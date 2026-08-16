import { describe, expect, test } from "vitest";
import { extractRecipeWithCopilot } from "@/lib/copilot-ingredients";
import { transformRecipe } from "@/lib/extract-recipe";
import { fetchRecipePage } from "@/lib/recipe-page";
import { createRecipeLogger } from "@/lib/recipe-logger";
import { createRecipeSource } from "@/lib/recipe-source";
import {
  proteinWaffleResult,
  proteinWaffleInstructionSteps,
  proteinWaffleSourceLines,
} from "@/test/fixtures/protein-waffles";

const recipeUrl =
  "https://www.thewellnourishedmama.com/blog/kennabangs-favorite-protein-waffles-recipe";
const runLiveTests = process.env.RUN_LIVE_RECIPE_TESTS === "1";

function withoutEstimatedGrams(
  ingredient: (typeof proteinWaffleResult.ingredients)[number],
) {
  return {
    amount: ingredient.amount,
    ingredient: ingredient.ingredient,
    notes: ingredient.notes,
    unit: ingredient.unit,
  };
}

describe.skipIf(!runLiveTests)("live recipe extraction", () => {
  test(
    "extracts the exact seven ingredients using the real site and GPT-5.6 Luna",
    async () => {
      const logger = createRecipeLogger(`live-${crypto.randomUUID()}`);
      const page = await fetchRecipePage(recipeUrl, { logger });
      const source = createRecipeSource(page.text, logger);

      expect(source.sourceIngredients).toEqual(proteinWaffleSourceLines);
      expect(source.sourceInstructions).toEqual(
        proteinWaffleInstructionSteps,
      );

      const result = await extractRecipeWithCopilot(
        page.url,
        source.modelInput,
        { logger },
      );

      expect(
        result.ingredients.map(withoutEstimatedGrams),
      ).toEqual(proteinWaffleResult.ingredients.map(withoutEstimatedGrams));
      expect(result.instructions).toEqual(
        proteinWaffleResult.instructions,
      );
      expect(
        result.ingredients
          .slice(0, 6)
          .every(
            (ingredient) =>
              ingredient.estimatedGrams !== null &&
              ingredient.estimatedGrams > 0,
          ),
      ).toBe(true);

      const doubled = await transformRecipe(
        result,
        "Double this recipe.",
        { logger },
      );
      expect(doubled.ingredients.map((ingredient) => ingredient.amount)).toEqual(
        ["2", "2", "4", "2/3", "1/2", "2", null],
      );
      result.ingredients.slice(0, 6).forEach((ingredient, index) => {
        const originalGrams = ingredient.estimatedGrams;
        const doubledGrams = doubled.ingredients[index].estimatedGrams;
        expect(originalGrams).not.toBeNull();
        expect(doubledGrams).not.toBeNull();
        expect(doubledGrams as number).toBeCloseTo(
          (originalGrams as number) * 2,
          0,
        );
      });
    },
    180_000,
  );
});
