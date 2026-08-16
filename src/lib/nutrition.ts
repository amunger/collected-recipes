import type {
  Ingredient,
  IngredientResult,
} from "@/lib/ingredient-result";
import {
  silentRecipeLogger,
  type RecipeLogger,
} from "@/lib/recipe-logger";

export interface FoodMacroProfile {
  readonly carbohydratesPer100Grams: number;
  readonly description: string;
  readonly fatPer100Grams: number;
  readonly fdcId: number;
  readonly proteinPer100Grams: number;
}

export interface NutritionProvider {
  findMacros(ingredient: Ingredient): Promise<FoodMacroProfile | null>;
}

export type IngredientNutritionStatus =
  | "matched"
  | "provider-error"
  | "unmatched"
  | "unweighed";

export interface IngredientNutrition {
  readonly carbohydratesGrams: number | null;
  readonly description: string;
  readonly estimatedGrams: number | null;
  readonly fatGrams: number | null;
  readonly ingredient: string;
  readonly proteinGrams: number | null;
  readonly sourceDescription: string | null;
  readonly sourceFdcId: number | null;
  readonly status: IngredientNutritionStatus;
}

export interface NutritionResult {
  readonly calculatedAt: string;
  readonly ingredients: ReadonlyArray<IngredientNutrition>;
  readonly message: string | null;
  readonly provider: "USDA FoodData Central";
  readonly status: "complete" | "partial" | "unavailable";
  readonly totals: {
    readonly carbohydratesGrams: number;
    readonly fatGrams: number;
    readonly includedIngredientCount: number;
    readonly omittedIngredientCount: number;
    readonly proteinGrams: number;
  };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

export function validateNutritionResult(value: unknown): NutritionResult {
  const record = asRecord(value);
  const totals = asRecord(record?.totals);
  if (
    !record ||
    record.provider !== "USDA FoodData Central" ||
    !["complete", "partial", "unavailable"].includes(
      typeof record.status === "string" ? record.status : "",
    ) ||
    typeof record.calculatedAt !== "string" ||
    !(record.message === null || typeof record.message === "string") ||
    !Array.isArray(record.ingredients) ||
    !totals
  ) {
    throw new Error("Stored nutrition data is invalid.");
  }

  const nullableNumber = (value: unknown): number | null => {
    if (value === null) {
      return null;
    }
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new Error("Stored ingredient nutrition data is invalid.");
    }
    return value;
  };
  const nullableString = (value: unknown): string | null => {
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new Error("Stored ingredient nutrition data is invalid.");
    }
    return value;
  };
  const ingredients: IngredientNutrition[] = record.ingredients.map((value) => {
    const ingredient = asRecord(value);
    const status = ingredient?.status;
    if (
      !ingredient ||
      typeof ingredient.description !== "string" ||
      typeof ingredient.ingredient !== "string" ||
      !["matched", "provider-error", "unmatched", "unweighed"].includes(
        typeof status === "string" ? status : "",
      )
    ) {
      throw new Error("Stored ingredient nutrition data is invalid.");
    }
    const parsed: IngredientNutrition = {
      carbohydratesGrams: nullableNumber(
        ingredient.carbohydratesGrams,
      ),
      description: ingredient.description,
      estimatedGrams: nullableNumber(ingredient.estimatedGrams),
      fatGrams: nullableNumber(ingredient.fatGrams),
      ingredient: ingredient.ingredient,
      proteinGrams: nullableNumber(ingredient.proteinGrams),
      sourceDescription: nullableString(ingredient.sourceDescription),
      sourceFdcId: nullableNumber(ingredient.sourceFdcId),
      status: status as IngredientNutritionStatus,
    };
    if (
      parsed.status === "matched" &&
      (parsed.carbohydratesGrams === null ||
        parsed.estimatedGrams === null ||
        parsed.fatGrams === null ||
        parsed.proteinGrams === null ||
        parsed.sourceDescription === null ||
        parsed.sourceFdcId === null)
    ) {
      throw new Error("Stored matched nutrition data is incomplete.");
    }
    return parsed;
  });
  const numericTotalKeys = [
    "carbohydratesGrams",
    "fatGrams",
    "includedIngredientCount",
    "omittedIngredientCount",
    "proteinGrams",
  ] as const;
  if (
    numericTotalKeys.some(
      (key) =>
        typeof totals[key] !== "number" ||
        !Number.isFinite(totals[key]) ||
        totals[key] < 0,
    )
  ) {
    throw new Error("Stored nutrition totals are invalid.");
  }

  return {
    calculatedAt: record.calculatedAt,
    ingredients,
    message: record.message as string | null,
    provider: "USDA FoodData Central",
    status: record.status as NutritionResult["status"],
    totals: {
      carbohydratesGrams: totals.carbohydratesGrams as number,
      fatGrams: totals.fatGrams as number,
      includedIngredientCount: totals.includedIngredientCount as number,
      omittedIngredientCount: totals.omittedIngredientCount as number,
      proteinGrams: totals.proteinGrams as number,
    },
  };
}

function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

function ingredientDescription(ingredient: Ingredient): string {
  return [ingredient.amount, ingredient.unit, ingredient.ingredient]
    .filter((value): value is string => value !== null)
    .join(" ");
}

function unavailableRow(
  ingredient: Ingredient,
  status: Exclude<IngredientNutritionStatus, "matched">,
): IngredientNutrition {
  return {
    carbohydratesGrams: null,
    description: ingredientDescription(ingredient),
    estimatedGrams: ingredient.estimatedGrams,
    fatGrams: null,
    ingredient: ingredient.ingredient,
    proteinGrams: null,
    sourceDescription: null,
    sourceFdcId: null,
    status,
  };
}

async function calculateIngredientNutrition(
  ingredient: Ingredient,
  provider: NutritionProvider,
  logger: RecipeLogger,
): Promise<IngredientNutrition> {
  if (ingredient.estimatedGrams === null) {
    return unavailableRow(ingredient, "unweighed");
  }

  let profile: FoodMacroProfile | null;
  try {
    profile = await provider.findMacros(ingredient);
  } catch (error: unknown) {
    logger.error("nutrition.ingredient.failed", error, {
      ingredient: ingredient.ingredient,
    });
    return unavailableRow(ingredient, "provider-error");
  }

  if (!profile) {
    return unavailableRow(ingredient, "unmatched");
  }

  const scale = ingredient.estimatedGrams / 100;
  return {
    carbohydratesGrams: roundMacro(
      profile.carbohydratesPer100Grams * scale,
    ),
    description: ingredientDescription(ingredient),
    estimatedGrams: ingredient.estimatedGrams,
    fatGrams: roundMacro(profile.fatPer100Grams * scale),
    ingredient: ingredient.ingredient,
    proteinGrams: roundMacro(profile.proteinPer100Grams * scale),
    sourceDescription: profile.description,
    sourceFdcId: profile.fdcId,
    status: "matched",
  };
}

export async function calculateRecipeNutrition(
  recipe: IngredientResult,
  provider: NutritionProvider,
  logger: RecipeLogger = silentRecipeLogger,
): Promise<NutritionResult> {
  const startedAt = performance.now();
  logger.info("nutrition.calculation.started", {
    ingredientCount: recipe.ingredients.length,
  });

  const ingredients = await Promise.all(
    recipe.ingredients.map((ingredient) =>
      calculateIngredientNutrition(ingredient, provider, logger),
    ),
  );
  const matched = ingredients.filter(
    (ingredient) => ingredient.status === "matched",
  );
  const omittedIngredientCount = ingredients.length - matched.length;
  const status =
    matched.length === ingredients.length
      ? "complete"
      : matched.length > 0
        ? "partial"
        : "unavailable";
  const providerFailed = ingredients.some(
    (ingredient) => ingredient.status === "provider-error",
  );
  const result: NutritionResult = {
    calculatedAt: new Date().toISOString(),
    ingredients,
    message:
      omittedIngredientCount === 0
        ? null
        : providerFailed
          ? "Some nutrition data could not be loaded from the provider."
          : "Some ingredients could not be matched or weighed.",
    provider: "USDA FoodData Central",
    status,
    totals: {
      carbohydratesGrams: roundMacro(
        matched.reduce(
          (total, ingredient) =>
            total + (ingredient.carbohydratesGrams ?? 0),
          0,
        ),
      ),
      fatGrams: roundMacro(
        matched.reduce(
          (total, ingredient) => total + (ingredient.fatGrams ?? 0),
          0,
        ),
      ),
      includedIngredientCount: matched.length,
      omittedIngredientCount,
      proteinGrams: roundMacro(
        matched.reduce(
          (total, ingredient) => total + (ingredient.proteinGrams ?? 0),
          0,
        ),
      ),
    },
  };

  logger.info("nutrition.calculation.completed", {
    status,
    includedIngredientCount: matched.length,
    omittedIngredientCount,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return result;
}
