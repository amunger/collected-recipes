import { describe, expect, test, vi } from "vitest";
import type { CopilotClientFactory } from "@/lib/copilot-ingredients";
import { transformRecipe } from "@/lib/extract-recipe";
import { silentRecipeLogger } from "@/lib/recipe-logger";
import { proteinWaffleResult } from "@/test/fixtures/protein-waffles";

describe("transformRecipe", () => {
  test("applies a prompt to the current structured recipe", async () => {
    const doubled = {
      ...proteinWaffleResult,
      ingredients: proteinWaffleResult.ingredients.map((ingredient) => ({
        ...ingredient,
        amount: ingredient.amount === "1" ? "2" : ingredient.amount,
        estimatedGrams:
          ingredient.estimatedGrams === null
            ? null
            : ingredient.estimatedGrams * 2,
      })),
    };
    let prompt = "";
    const createClient: CopilotClientFactory = () => ({
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => []),
      async createSession() {
        return {
          disconnect: vi.fn(async () => {}),
          async sendAndWait(message) {
            prompt = message.prompt;
            return { data: { content: JSON.stringify(doubled) } };
          },
        };
      },
    });

    const result = await transformRecipe(
      proteinWaffleResult,
      " Double this recipe. ",
      {
        logger: silentRecipeLogger,
        copilot: { createClient },
      },
    );

    expect(result).toEqual(doubled);
    expect(prompt).toContain('"specialInstructions":"Double this recipe."');
    expect(prompt).toContain('"Current saved recipe:');
  });

  test("rejects blank transformation instructions before calling Copilot", async () => {
    await expect(
      transformRecipe(proteinWaffleResult, "   ", {
        logger: silentRecipeLogger,
      }),
    ).rejects.toThrow("Special instructions are required");
  });
});
