import { describe, expect, test } from "vitest";
import {
  parseRecipeTransformationInput,
  parseSaveRecipeInput,
  parseTransformationPrompt,
} from "@/lib/saved-recipe-request";
import {
  proteinWaffleNutrition,
  proteinWaffleResult,
} from "@/test/fixtures/protein-waffles";

describe("saved recipe request parsing", () => {
  test("validates a complete save request", () => {
    expect(
      parseSaveRecipeInput({
        name: " Waffles ",
        customNotes: " Serve warm. ",
        nutrition: proteinWaffleNutrition,
        recipe: proteinWaffleResult,
        sourceUrl: " https://example.com ",
        specialInstructions: " Double it. ",
      }),
    ).toMatchObject({
      name: " Waffles ",
      customNotes: "Serve warm.",
      sourceUrl: "https://example.com",
      specialInstructions: "Double it.",
    });
  });

  test("rejects invalid recipe and nutrition payloads", () => {
    expect(() => parseSaveRecipeInput({ name: "Recipe" })).toThrow(
      "nutrition",
    );
    expect(() =>
      parseSaveRecipeInput({
        name: "Recipe",
        nutrition: proteinWaffleNutrition,
        recipe: { ingredients: [] },
      }),
    ).toThrow("ingredients");
  });

  test("validates saved names and source URLs", () => {
    const validPayload = {
      name: "Recipe",
      nutrition: proteinWaffleNutrition,
      recipe: proteinWaffleResult,
    };
    expect(() =>
      parseSaveRecipeInput({ ...validPayload, name: "x".repeat(121) }),
    ).toThrow("120");
    expect(() =>
      parseSaveRecipeInput({ ...validPayload, sourceUrl: "not a URL" }),
    ).toThrow("valid URL");
    expect(() =>
      parseSaveRecipeInput({
        ...validPayload,
        sourceUrl: "file:///recipe.html",
      }),
    ).toThrow("HTTP or HTTPS");
    expect(() =>
      parseSaveRecipeInput({
        ...validPayload,
        customNotes: "x".repeat(10_001),
      }),
    ).toThrow("10,000");
  });

  test("normalizes and limits transformation prompts", () => {
    expect(
      parseTransformationPrompt({
        specialInstructions: " Double it. ",
      }),
    ).toBe("Double it.");
    expect(() => parseTransformationPrompt({})).toThrow(
      "Special instructions are required",
    );
    expect(() =>
      parseTransformationPrompt({
        specialInstructions: "x".repeat(2_001),
      }),
    ).toThrow("2,000");
  });

  test("validates transformations of the active recipe", () => {
    expect(
      parseRecipeTransformationInput({
        recipe: proteinWaffleResult,
        specialInstructions: " Make it dairy free. ",
      }),
    ).toEqual({
      recipe: proteinWaffleResult,
      specialInstructions: "Make it dairy free.",
    });
    expect(() =>
      parseRecipeTransformationInput({
        recipe: { ingredients: [] },
        specialInstructions: "Change it.",
      }),
    ).toThrow("ingredients");
  });
});
