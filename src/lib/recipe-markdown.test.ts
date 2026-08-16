import { describe, expect, test } from "vitest";
import {
  formatIngredient,
  formatRecipeMarkdown,
} from "@/lib/recipe-markdown";
import { proteinWaffleResult } from "@/test/fixtures/protein-waffles";

describe("recipe Markdown formatting", () => {
  test("formats quantities, notes, and footnote markers", () => {
    expect(formatIngredient(proteinWaffleResult.ingredients[0])).toBe(
      "1 cup Kodiak Cakes buttermilk waffle mix*",
    );
    expect(formatIngredient(proteinWaffleResult.ingredients[1])).toBe(
      "1 cup low fat cottage cheese (2% milkfat)",
    );
    expect(formatIngredient(proteinWaffleResult.ingredients[6])).toBe(
      "Cinnamon (to taste)",
    );
  });

  test("produces only ingredient and instruction sections", () => {
    const markdown = formatRecipeMarkdown(proteinWaffleResult);

    expect(markdown).toContain("## Ingredients");
    expect(markdown).toContain(
      "- 1/3 cup liquid egg whites**",
    );
    expect(markdown).toContain("## Instructions");
    expect(markdown).toContain(
      "1. Add all ingredients to a high speed blender",
    );
    expect(markdown).not.toContain("sourceUrl");
  });

  test("retains ingredient group headings", () => {
    const ingredients = proteinWaffleResult.ingredients.map(
      (ingredient, index) => ({
        ...ingredient,
        group: index < 5 ? "For meatballs:" : "For the BBQ glaze:",
      }),
    );

    expect(
      formatRecipeMarkdown({
        ...proteinWaffleResult,
        ingredients,
      }),
    ).toContain(
      "### For meatballs:\n\n- 1 cup Kodiak Cakes buttermilk waffle mix*",
    );
    expect(
      formatRecipeMarkdown({
        ...proteinWaffleResult,
        ingredients,
      }),
    ).toContain("### For the BBQ glaze:\n\n- 1 teaspoon vanilla");
  });
});
