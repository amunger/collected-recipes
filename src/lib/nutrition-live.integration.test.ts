import { describe, expect, test } from "vitest";
import { calculateRecipeNutrition } from "@/lib/nutrition";
import { createRecipeLogger } from "@/lib/recipe-logger";
import { UsdaFoodDataClient } from "@/lib/usda-food-data";
import { proteinWaffleResult } from "@/test/fixtures/protein-waffles";

const runLiveTests = process.env.RUN_LIVE_NUTRITION_TESTS === "1";

describe.skipIf(!runLiveTests)("live USDA nutrition enrichment", () => {
  test(
    "matches and totals the protein waffle ingredients",
    async () => {
      const logger = createRecipeLogger(
        `nutrition-live-${crypto.randomUUID()}`,
      );
      const nutrition = await calculateRecipeNutrition(
        proteinWaffleResult,
        new UsdaFoodDataClient({ logger }),
        logger,
      );

      expect(nutrition.totals.includedIngredientCount).toBeGreaterThanOrEqual(
        5,
      );
      expect(nutrition.totals.carbohydratesGrams).toBeGreaterThan(0);
      expect(nutrition.totals.proteinGrams).toBeGreaterThan(0);
      expect(nutrition.totals.fatGrams).toBeGreaterThan(0);
      expect(
        nutrition.ingredients
          .filter((ingredient) => ingredient.status === "matched")
          .every(
            (ingredient) =>
              ingredient.sourceFdcId !== null &&
              ingredient.sourceDescription !== null,
          ),
      ).toBe(true);
    },
    60_000,
  );
});
