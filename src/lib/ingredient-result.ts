export interface Ingredient {
  readonly amount: string | null;
  readonly estimatedGrams: number | null;
  readonly group: string | null;
  readonly unit: string | null;
  readonly ingredient: string;
  readonly notes: string | null;
}

export interface IngredientResult {
  readonly ingredients: ReadonlyArray<Ingredient>;
  readonly instructions: ReadonlyArray<string>;
  readonly name?: string | null;
  readonly servings?: number | null;
}

export class InvalidIngredientResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIngredientResultError";
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: ReadonlyArray<string>,
): boolean {
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    [...expectedKeys]
      .sort()
      .every((expectedKey, index) => actualKeys[index] === expectedKey)
  );
}

function parseIngredient(value: unknown, index: number): Ingredient {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidIngredientResultError(
      `Ingredient ${index + 1} must be an object.`,
    );
  }

  const record = value as Readonly<Record<string, unknown>>;
  const expectedKeys = [
    "amount",
    "estimatedGrams",
    "group",
    "unit",
    "ingredient",
    "notes",
  ];
  const legacyKeys = expectedKeys.filter((key) => key !== "group");
  if (
    !hasExactKeys(record, expectedKeys) &&
    !hasExactKeys(record, legacyKeys)
  ) {
    throw new InvalidIngredientResultError(
      `Ingredient ${index + 1} must contain only amount, estimatedGrams, group, unit, ingredient, and notes.`,
    );
  }

  if (
    !isNullableString(record.amount) ||
    !(
      record.estimatedGrams === null ||
      (typeof record.estimatedGrams === "number" &&
        Number.isFinite(record.estimatedGrams) &&
        record.estimatedGrams > 0)
    ) ||
    !isNullableString(record.group ?? null) ||
    !isNullableString(record.unit) ||
    !isNullableString(record.notes) ||
    typeof record.ingredient !== "string" ||
    record.ingredient.trim().length === 0
  ) {
    throw new InvalidIngredientResultError(
      `Ingredient ${index + 1} contains invalid field values.`,
    );
  }

  const normalizeNullable = (field: string | null): string | null => {
    if (field === null) {
      return null;
    }
    const trimmed = field.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    amount: normalizeNullable(record.amount),
    estimatedGrams: record.estimatedGrams,
    group: normalizeNullable(
      typeof record.group === "string" ? record.group : null,
    ),
    unit: normalizeNullable(record.unit),
    ingredient: record.ingredient.trim(),
    notes: normalizeNullable(record.notes),
  };
}

export function validateIngredientResult(value: unknown): IngredientResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidIngredientResultError(
      "The model response must be a JSON object.",
    );
  }

  const record = value as Readonly<Record<string, unknown>>;
  const hasRecipeMetadata = hasExactKeys(record, [
    "ingredients",
    "instructions",
    "name",
    "servings",
  ]);
  if (
    !(
      hasRecipeMetadata ||
      hasExactKeys(record, ["ingredients", "instructions"])
    ) ||
    !Array.isArray(record.ingredients) ||
    record.ingredients.length === 0 ||
    !Array.isArray(record.instructions) ||
    record.instructions.length === 0
  ) {
    throw new InvalidIngredientResultError(
      "The model response must contain non-empty ingredients and instructions arrays.",
    );
  }

  const instructions = record.instructions.map((instruction, index) => {
    if (
      typeof instruction !== "string" ||
      instruction.trim().length === 0
    ) {
      throw new InvalidIngredientResultError(
        `Instruction ${index + 1} must be a non-empty string.`,
      );
    }
    return instruction.trim();
  });

  let name: string | null = null;
  if (record.name !== undefined) {
    if (record.name !== null && typeof record.name !== "string") {
      throw new InvalidIngredientResultError(
        "name must be a string or null.",
      );
    }
    const normalizedName = record.name?.trim() ?? "";
    name = normalizedName || null;
  }

  let servings: number | null = null;
  if (record.servings !== undefined) {
    if (
      record.servings !== null &&
      (typeof record.servings !== "number" ||
        !Number.isFinite(record.servings) ||
        record.servings <= 0)
    ) {
      throw new InvalidIngredientResultError(
        "servings must be a positive number or null.",
      );
    }
    servings = record.servings;
  }

  return {
    ingredients: record.ingredients.map(parseIngredient),
    instructions,
    ...(hasRecipeMetadata ? { name, servings } : {}),
  };
}

export function parseIngredientResult(value: string): IngredientResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error: unknown) {
    throw new InvalidIngredientResultError(
      `The model response was not valid JSON: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
    );
  }

  return validateIngredientResult(parsed);
}
