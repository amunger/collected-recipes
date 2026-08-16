import { validateIngredientResult } from "@/lib/ingredient-result";
import { validateNutritionResult } from "@/lib/nutrition";
import type { SaveRecipeInput } from "@/lib/saved-recipe-store";

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function optionalString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }
  return value.trim() || null;
}

export function parseSaveRecipeInput(value: unknown): SaveRecipeInput {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.name !== "string" ||
    !record.name.trim()
  ) {
    throw new Error("A saved recipe name is required.");
  }
  if (record.name.trim().length > 120) {
    throw new Error("Saved recipe names must be 120 characters or fewer.");
  }

  const sourceUrl = optionalString(record.sourceUrl, "sourceUrl");
  if (sourceUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      throw new Error("sourceUrl must be a valid URL.");
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("sourceUrl must use HTTP or HTTPS.");
    }
  }

  const customNotes = optionalString(record.customNotes, "customNotes");
  if (customNotes && customNotes.length > 10_000) {
    throw new Error("customNotes must be 10,000 characters or fewer.");
  }

  return {
    customNotes,
    name: record.name,
    nutrition: validateNutritionResult(record.nutrition),
    recipe: validateIngredientResult(record.recipe),
    sourceUrl,
    specialInstructions: optionalString(
      record.specialInstructions,
      "specialInstructions",
    ),
  };
}

export function parseTransformationPrompt(value: unknown): string {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.specialInstructions !== "string" ||
    !record.specialInstructions.trim()
  ) {
    throw new Error("Special instructions are required.");
  }
  if (record.specialInstructions.trim().length > 2_000) {
    throw new Error(
      "Special instructions must be 2,000 characters or fewer.",
    );
  }
  return record.specialInstructions.trim();
}

export function parseRecipeTransformationInput(value: unknown): {
  readonly recipe: ReturnType<typeof validateIngredientResult>;
  readonly specialInstructions: string;
} {
  const record = asRecord(value);
  if (!record) {
    throw new Error("A recipe and special instructions are required.");
  }
  return {
    recipe: validateIngredientResult(record.recipe),
    specialInstructions: parseTransformationPrompt(record),
  };
}
