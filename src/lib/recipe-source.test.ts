import { describe, expect, test } from "vitest";
import { createRecipeSource, decodeHtmlEntities } from "@/lib/recipe-source";
import {
  proteinWaffleHtml,
  proteinWaffleInstructionSteps,
  proteinWaffleSourceLines,
} from "@/test/fixtures/protein-waffles";

describe("decodeHtmlEntities", () => {
  test("decodes named, decimal, and hexadecimal entities", () => {
    expect(
      decodeHtmlEntities("salt &amp; pepper &#35;1 &#xBD;"),
    ).toBe("salt & pepper #1 ½");
  });

  test("leaves invalid code points intact", () => {
    expect(decodeHtmlEntities("&#x110000;")).toBe("&#x110000;");
  });
});

describe("createRecipeSource", () => {
  test("extracts all seven authoritative recipe-card ingredient lines", () => {
    const source = createRecipeSource(proteinWaffleHtml);

    expect(source.ingredientStrategy).toBe("recipe-card");
    expect(source.instructionStrategy).toBe("recipe-card");
    expect(source.sourceIngredients).toEqual(proteinWaffleSourceLines);
    expect(source.sourceInstructions).toEqual(
      proteinWaffleInstructionSteps,
    );
    expect(source.modelInput).toContain("1/3 C liquid egg whites**");
    expect(source.modelInput).toContain("Serve with your favorite toppings");
  });

  test("normalizes non-breaking spaces in recipe-card text", () => {
    const source = createRecipeSource(`
      <div aria-ingredients="true"><li>1&nbsp;cup flour</li></div>
      <div aria-instruction="true"><li>Mix\u00a0and serve.</li></div>
    `);

    expect(source.sourceIngredients).toEqual(["1 cup flour"]);
    expect(source.sourceInstructions).toEqual(["Mix and serve."]);
  });

  test("prefers valid JSON-LD recipe ingredients", () => {
    const source = createRecipeSource(`
      <script type="application/ld+json">
        {"@type":"Recipe","recipeIngredient":["1 cup flour","&frac12; tsp salt"],"recipeInstructions":[{"@type":"HowToStep","text":"Mix it."},{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Bake it."}]}]}
      </script>
      <div aria-ingredients="true"><li>wrong fallback</li></div>
    `);

    expect(source.ingredientStrategy).toBe("json-ld");
    expect(source.instructionStrategy).toBe("json-ld");
    expect(source.sourceIngredients).toEqual([
      "1 cup flour",
      "&frac12; tsp salt",
    ]);
    expect(source.sourceInstructions).toEqual(["Mix it.", "Bake it."]);
  });

  test("preserves Skinnytaste-style recipe-card ingredient groups", () => {
    const source = createRecipeSource(`
      <script type="application/ld+json">
        {"@type":"Recipe","recipeIngredient":["1 pound ground turkey","2 tablespoons BBQ sauce"],"recipeInstructions":["Mix and bake."]}
      </script>
      <div aria-ingredients="true">
        <div class="wprm-recipe-ingredient-group">
          <h4 class="wprm-recipe-group-name wprm-recipe-ingredient-group-name">For meatballs:</h4>
          <ul class="wprm-recipe-ingredients">
            <li class="wprm-recipe-ingredient">
              <input aria-label="1&#032;pound&#032;ground turkey">
              <span class="wprm-recipe-ingredient-name">ground turkey</span>
            </li>
          </ul>
        </div>
        <div class="wprm-recipe-ingredient-group">
          <h4 class="wprm-recipe-group-name wprm-recipe-ingredient-group-name">For the BBQ glaze:</h4>
          <ul class="wprm-recipe-ingredients">
            <li class="wprm-recipe-ingredient">
              <input aria-label="2&#032;tablespoons&#032;BBQ sauce">
              <span class="wprm-recipe-ingredient-name">BBQ sauce</span>
            </li>
          </ul>
        </div>
      </div>
    `);

    expect(source.ingredientStrategy).toBe("json-ld");
    expect(source.modelInput).toContain(
      '"ingredients":["1 pound ground turkey"],"name":"For meatballs:"',
    );
    expect(source.modelInput).toContain(
      '"ingredients":["2 tablespoons BBQ sauce"],"name":"For the BBQ glaze:"',
    );
  });

  test("falls back safely when structured recipe data is malformed", () => {
    const source = createRecipeSource(`
      <script type="application/ld+json">{"broken":</script>
      <main><h1>Recipe</h1><p>Use flour and water.</p></main>
    `);

    expect(source.ingredientStrategy).toBe("visible-text");
    expect(source.instructionStrategy).toBe("visible-text");
    expect(source.sourceIngredients).toEqual([]);
    expect(source.sourceInstructions).toEqual([]);
    expect(source.modelInput).toContain("Use flour and water.");
  });
});
