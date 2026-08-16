import type { IngredientResult } from "@/lib/ingredient-result";
import {
  calculateRecipeNutrition,
  type NutritionProvider,
  type NutritionResult,
} from "@/lib/nutrition";
import type { RecipeLogger } from "@/lib/recipe-logger";
import { UsdaFoodDataClient } from "@/lib/usda-food-data";

export interface EnrichedRecipe extends IngredientResult {
  readonly nutrition: NutritionResult;
}

export async function enrichRecipe(
  recipe: IngredientResult,
  logger: RecipeLogger,
  provider: NutritionProvider = new UsdaFoodDataClient({ logger }),
): Promise<EnrichedRecipe> {
  return {
    ...recipe,
    nutrition: await calculateRecipeNutrition(recipe, provider, logger),
  };
}
