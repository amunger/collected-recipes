import { describe, expect, test } from "vitest";
import {
  InvalidIngredientResultError,
  parseIngredientResult,
  validateIngredientResult,
} from "@/lib/ingredient-result";
import { proteinWaffleResult } from "@/test/fixtures/protein-waffles";

describe("ingredient result validation", () => {
  test("accepts and trims the exact ingredient contract", () => {
    expect(
      validateIngredientResult({
        ingredients: [
          {
            amount: " 1 ",
            estimatedGrams: 120,
            group: " Dough ",
            unit: " cup ",
            ingredient: " flour ",
            notes: "",
          },
        ],
        instructions: [" Mix thoroughly. "],
      }),
    ).toEqual({
      ingredients: [
        {
          amount: "1",
          estimatedGrams: 120,
          group: "Dough",
          unit: "cup",
          ingredient: "flour",
          notes: null,
        },
      ],
      instructions: ["Mix thoroughly."],
    });
  });

  test("parses the complete golden result from JSON", () => {
    expect(parseIngredientResult(JSON.stringify(proteinWaffleResult))).toEqual(
      proteinWaffleResult,
    );
  });

  test("normalizes legacy saved ingredients without groups", () => {
    const legacyIngredient = {
      amount: "1",
      estimatedGrams: 120,
      unit: "cup",
      ingredient: "flour",
      notes: null,
    };

    expect(
      validateIngredientResult({
        ingredients: [legacyIngredient],
        instructions: ["Mix."],
      }).ingredients[0].group,
    ).toBeNull();
  });

  test.each([
    ["not JSON", "not valid JSON"],
    [JSON.stringify([]), "JSON object"],
    [
      JSON.stringify({ ingredients: [], instructions: [] }),
      "non-empty ingredients and instructions",
    ],
    [
      JSON.stringify({
        ingredients: [],
        instructions: [],
        extra: true,
      }),
      "non-empty ingredients and instructions",
    ],
    [
      JSON.stringify({
        ingredients: [
          {
            amount: 1,
            estimatedGrams: 120,
            unit: "cup",
            ingredient: "flour",
            notes: null,
          },
        ],
        instructions: ["Mix."],
      }),
      "invalid field values",
    ],
    [
      JSON.stringify({
        ingredients: [
          {
            amount: "1",
            estimatedGrams: 120,
            unit: "cup",
            ingredient: "",
            notes: null,
          },
        ],
        instructions: ["Mix."],
      }),
      "invalid field values",
    ],
    [
      JSON.stringify({
        ingredients: [
          {
            amount: "1",
            estimatedGrams: 120,
            unit: "cup",
            ingredient: "flour",
            notes: null,
            invented: true,
          },
        ],
        instructions: ["Mix."],
      }),
      "must contain only",
    ],
    [
      JSON.stringify({
        ingredients: [
          {
            amount: "1",
            estimatedGrams: 120,
            unit: "cup",
            ingredient: "flour",
            notes: null,
          },
        ],
        instructions: [""],
      }),
      "Instruction 1",
    ],
    [
      JSON.stringify({
        ingredients: [
          {
            amount: "1",
            estimatedGrams: 0,
            unit: "cup",
            ingredient: "flour",
            notes: null,
          },
        ],
        instructions: ["Mix."],
      }),
      "invalid field values",
    ],
    [
      "```json\n" + JSON.stringify(proteinWaffleResult) + "\n```",
      "not valid JSON",
    ],
  ])("rejects malformed output", (value, message) => {
    expect(() => parseIngredientResult(value)).toThrow(message);
  });

  test("uses a dedicated validation error", () => {
    expect(() => validateIngredientResult(null)).toThrow(
      InvalidIngredientResultError,
    );
  });
});
