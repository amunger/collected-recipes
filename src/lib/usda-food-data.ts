import type { Ingredient } from "@/lib/ingredient-result";
import type {
  FoodMacroProfile,
  NutritionProvider,
} from "@/lib/nutrition";
import {
  silentRecipeLogger,
  type RecipeLogger,
} from "@/lib/recipe-logger";

const FOOD_SEARCH_URL =
  "https://api.nal.usda.gov/fdc/v1/foods/search";
const NUTRIENT_IDS = {
  protein: 1003,
  fat: 1004,
  carbohydrates: 1005,
} as const;

interface UsdaFoodDataOptions {
  readonly apiKey?: string;
  readonly fetchImplementation?: typeof fetch;
  readonly logger?: RecipeLogger;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function readNutrient(
  nutrients: ReadonlyArray<unknown>,
  nutrientId: number,
): number | null {
  const nutrient = nutrients
    .map(asRecord)
    .find((candidate) => candidate?.nutrientId === nutrientId);
  return nutrient && typeof nutrient.value === "number"
    ? nutrient.value
    : null;
}

function parseFood(value: unknown): FoodMacroProfile | null {
  const food = asRecord(value);
  if (
    !food ||
    typeof food.fdcId !== "number" ||
    typeof food.description !== "string" ||
    !Array.isArray(food.foodNutrients)
  ) {
    return null;
  }

  const protein = readNutrient(
    food.foodNutrients,
    NUTRIENT_IDS.protein,
  );
  const fat = readNutrient(food.foodNutrients, NUTRIENT_IDS.fat);
  const carbohydrates = readNutrient(
    food.foodNutrients,
    NUTRIENT_IDS.carbohydrates,
  );
  if (protein === null || fat === null || carbohydrates === null) {
    return null;
  }

  return {
    carbohydratesPer100Grams: carbohydrates,
    description: food.description,
    fatPer100Grams: fat,
    fdcId: food.fdcId,
    proteinPer100Grams: protein,
  };
}

function searchQuery(ingredient: Ingredient): string {
  const notes =
    ingredient.notes && !ingredient.notes.startsWith("*")
      ? ingredient.notes
      : null;
  return [ingredient.ingredient, notes].filter(Boolean).join(" ");
}

export class UsdaFoodDataClient implements NutritionProvider {
  readonly #apiKey: string;
  readonly #fetchImplementation: typeof fetch;
  readonly #logger: RecipeLogger;
  readonly #cache = new Map<string, FoodMacroProfile | null>();

  constructor(options: UsdaFoodDataOptions = {}) {
    this.#apiKey =
      options.apiKey ?? process.env.FDC_API_KEY ?? "DEMO_KEY";
    this.#fetchImplementation = options.fetchImplementation ?? fetch;
    this.#logger = options.logger ?? silentRecipeLogger;
  }

  async findMacros(
    ingredient: Ingredient,
  ): Promise<FoodMacroProfile | null> {
    const query = searchQuery(ingredient);
    const cached = this.#cache.get(query);
    if (cached !== undefined || this.#cache.has(query)) {
      return cached ?? null;
    }

    const url = new URL(FOOD_SEARCH_URL);
    url.searchParams.set("api_key", this.#apiKey);
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "5");
    const startedAt = performance.now();
    const response = await this.#fetchImplementation(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    this.#logger.info("nutrition.usda.response", {
      ingredient: ingredient.ingredient,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    if (!response.ok) {
      throw new Error(
        `USDA FoodData Central returned HTTP ${response.status}.`,
      );
    }

    const body: unknown = await response.json();
    const record = asRecord(body);
    if (!record || !Array.isArray(record.foods)) {
      throw new Error(
        "USDA FoodData Central returned an invalid search response.",
      );
    }

    const profile =
      record.foods.map(parseFood).find((food) => food !== null) ?? null;
    this.#cache.set(query, profile);
    this.#logger.info("nutrition.usda.match", {
      ingredient: ingredient.ingredient,
      matched: profile !== null,
      sourceFdcId: profile?.fdcId,
    });
    return profile;
  }
}
