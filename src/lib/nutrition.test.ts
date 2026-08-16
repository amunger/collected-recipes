import { describe, expect, test, vi } from "vitest";
import {
  calculateRecipeNutrition,
  type NutritionProvider,
  validateNutritionResult,
} from "@/lib/nutrition";
import { silentRecipeLogger } from "@/lib/recipe-logger";
import { proteinWaffleResult } from "@/test/fixtures/protein-waffles";

describe("calculateRecipeNutrition", () => {
  test("scales per-100 g macros and totals matched ingredients", async () => {
    const provider: NutritionProvider = {
      findMacros: vi.fn(async () => ({
        carbohydratesPer100Grams: 20,
        description: "MATCHED FOOD",
        fatPer100Grams: 5,
        fdcId: 123,
        proteinPer100Grams: 10,
      })),
    };

    const result = await calculateRecipeNutrition(
      proteinWaffleResult,
      provider,
      silentRecipeLogger,
    );

    expect(result.status).toBe("partial");
    expect(result.ingredients[0]).toMatchObject({
      carbohydratesGrams: 21.2,
      fatGrams: 5.3,
      proteinGrams: 10.6,
      sourceFdcId: 123,
      status: "matched",
    });
    expect(result.ingredients[6].status).toBe("unweighed");
    expect(result.totals).toMatchObject({
      includedIngredientCount: 6,
      omittedIngredientCount: 1,
    });
  });

  test("distinguishes unmatched and provider-error rows", async () => {
    const provider: NutritionProvider = {
      findMacros: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValue(new Error("provider unavailable")),
    };

    const result = await calculateRecipeNutrition(
      {
        ingredients: proteinWaffleResult.ingredients.slice(0, 2),
        instructions: ["Mix."],
      },
      provider,
      silentRecipeLogger,
    );

    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("provider");
    expect(result.ingredients.map((item) => item.status)).toEqual([
      "unmatched",
      "provider-error",
    ]);
    expect(result.totals).toEqual({
      carbohydratesGrams: 0,
      fatGrams: 0,
      includedIngredientCount: 0,
      omittedIngredientCount: 2,
      proteinGrams: 0,
    });
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid stored totals: %s",
    (invalidTotal) => {
      expect(() =>
        validateNutritionResult({
          calculatedAt: "2026-08-15T20:00:00.000Z",
          ingredients: [],
          message: null,
          provider: "USDA FoodData Central",
          status: "unavailable",
          totals: {
            carbohydratesGrams: invalidTotal,
            fatGrams: 0,
            includedIngredientCount: 0,
            omittedIngredientCount: 0,
            proteinGrams: 0,
          },
        }),
      ).toThrow("totals");
    },
  );
});
