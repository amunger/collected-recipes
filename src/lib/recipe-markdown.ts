import type {
  Ingredient,
  IngredientResult,
} from "@/lib/ingredient-result";

export function formatIngredient(ingredient: Ingredient): string {
  const quantity = [ingredient.amount, ingredient.unit]
    .filter((value): value is string => value !== null)
    .join(" ");
  const base = [quantity, ingredient.ingredient].filter(Boolean).join(" ");

  if (!ingredient.notes) {
    return base;
  }

  return ingredient.notes.startsWith("*")
    ? `${base}${ingredient.notes}`
    : `${base} (${ingredient.notes})`;
}

export function formatRecipeMarkdown(recipe: IngredientResult): string {
  const ingredientLines: string[] = [];
  let previousGroup: string | null = null;
  for (const ingredient of recipe.ingredients) {
    if (ingredient.group !== previousGroup) {
      if (ingredientLines.length > 0) {
        ingredientLines.push("");
      }
      if (ingredient.group) {
        ingredientLines.push(`### ${ingredient.group}`, "");
      }
      previousGroup = ingredient.group;
    }
    ingredientLines.push(`- ${formatIngredient(ingredient)}`);
  }
  const ingredients = ingredientLines.join("\n");
  const instructions = recipe.instructions
    .map((instruction, index) => `${index + 1}. ${instruction}`)
    .join("\n");

  return `## Ingredients\n\n${ingredients}\n\n## Instructions\n\n${instructions}`;
}
