import type { IngredientResult } from "@/lib/ingredient-result";
import type { NutritionResult } from "@/lib/nutrition";

export const proteinWaffleSourceLines = [
  "1 C Kodiak Cakes buttermilk waffle mix*",
  "1 C low fat cottage cheese (2% milkfat)",
  "2 large eggs",
  "1/3 C liquid egg whites**",
  "1/4 C unsweetened almond milk",
  "1 tsp vanilla",
  "Cinnamon, to taste",
] as const;

export const proteinWaffleInstructionSteps = [
  "Add all ingredients to a high speed blender and blend until smooth, scraping down the sides as necessary.",
  "Spray a heated waffle iron with cooking spray, then pour half the waffle batter (about 2/3 cup) into the center and spread around with a spoon or spatula, leaving some space for the waffle to expand around the edges. Cook for one full cycle (every waffle iron is different, so just let it do it's thing!), then use a fork to remove from the waffle maker.",
  "Serve with your favorite toppings*** and enjoy!",
] as const;

export const proteinWaffleResult: IngredientResult = {
  ingredients: [
    {
      amount: "1",
      estimatedGrams: 106,
      group: null,
      unit: "cup",
      ingredient: "Kodiak Cakes buttermilk waffle mix",
      notes: "*",
    },
    {
      amount: "1",
      estimatedGrams: 226,
      group: null,
      unit: "cup",
      ingredient: "low fat cottage cheese",
      notes: "2% milkfat",
    },
    {
      amount: "2",
      estimatedGrams: 100,
      group: null,
      unit: null,
      ingredient: "large eggs",
      notes: null,
    },
    {
      amount: "1/3",
      estimatedGrams: 80,
      group: null,
      unit: "cup",
      ingredient: "liquid egg whites",
      notes: "**",
    },
    {
      amount: "1/4",
      estimatedGrams: 60,
      group: null,
      unit: "cup",
      ingredient: "unsweetened almond milk",
      notes: null,
    },
    {
      amount: "1",
      estimatedGrams: 4.2,
      group: null,
      unit: "teaspoon",
      ingredient: "vanilla",
      notes: null,
    },
    {
      amount: null,
      estimatedGrams: null,
      group: null,
      unit: null,
      ingredient: "Cinnamon",
      notes: "to taste",
    },
  ],
  instructions: proteinWaffleInstructionSteps,
};

export const proteinWaffleNutrition: NutritionResult = {
  calculatedAt: "2026-08-15T20:00:00.000Z",
  ingredients: proteinWaffleResult.ingredients.map((ingredient) =>
    ingredient.estimatedGrams === null
      ? {
          carbohydratesGrams: null,
          description: ingredient.ingredient,
          estimatedGrams: null,
          fatGrams: null,
          ingredient: ingredient.ingredient,
          proteinGrams: null,
          sourceDescription: null,
          sourceFdcId: null,
          status: "unweighed" as const,
        }
      : {
          carbohydratesGrams: 1,
          description: ingredient.ingredient,
          estimatedGrams: ingredient.estimatedGrams,
          fatGrams: 2,
          ingredient: ingredient.ingredient,
          proteinGrams: 3,
          sourceDescription: "TEST FOOD",
          sourceFdcId: 123,
          status: "matched" as const,
        },
  ),
  message: "Some ingredients could not be matched or weighed.",
  provider: "USDA FoodData Central",
  status: "partial",
  totals: {
    carbohydratesGrams: 6,
    fatGrams: 12,
    includedIngredientCount: 6,
    omittedIngredientCount: 1,
    proteinGrams: 18,
  },
};

export const proteinWaffleHtml = `
<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Recipe","name":"Protein Waffles"}
    </script>
  </head>
  <body>
    <article>
      <p>Long introductory story that is not an ingredient list.</p>
      <div aria-ingredients="true">
        <ul>
          ${proteinWaffleSourceLines.map((line) => `<li>${line}</li>`).join("")}
        </ul>
      </div>
      <div aria-instruction="true">
        <ol>
          ${proteinWaffleInstructionSteps.map((step) => `<li>${step}</li>`).join("")}
        </ol>
      </div>
    </article>
  </body>
</html>
`;
