import { describe, expect, test, vi } from "vitest";
import type { CopilotClientFactory } from "@/lib/copilot-ingredients";
import { extractRecipe } from "@/lib/extract-recipe";
import { silentRecipeLogger } from "@/lib/recipe-logger";
import {
  proteinWaffleHtml,
  proteinWaffleResult,
} from "@/test/fixtures/protein-waffles";

describe("recipe extraction integration", () => {
  test("composes fetching, parsing, Copilot extraction, and validation", async () => {
    let modelPrompt = "";
    const createClient: CopilotClientFactory = () => ({
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => []),
      async createSession(config) {
        expect(config.model).toBe("gpt-5.6-luna");
        return {
          disconnect: vi.fn(async () => {}),
          async sendAndWait(message) {
            modelPrompt = message.prompt;
            return {
              data: { content: JSON.stringify(proteinWaffleResult) },
            };
          },
        };
      },
    });
    const fetchImplementation: typeof fetch = vi.fn(async () => {
      return new Response(proteinWaffleHtml, {
        headers: { "content-type": "text/html" },
      });
    });

    const result = await extractRecipe("https://example.com/waffles", {
      logger: silentRecipeLogger,
      requestId: "integration-test",
      loadPage: {
        fetchImplementation,
        lookupHostname: async () => [{ address: "93.184.216.34" }],
      },
      copilot: { createClient },
    });

    expect(result).toEqual(proteinWaffleResult);
    expect(modelPrompt).toContain(
      "1 C Kodiak Cakes buttermilk waffle mix*",
    );
    expect(modelPrompt).toContain("Cinnamon, to taste");
    expect(modelPrompt).toContain(
      "Add all ingredients to a high speed blender",
    );
  });
});
