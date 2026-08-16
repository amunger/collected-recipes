import { afterEach, describe, expect, test, vi } from "vitest";
import { enrichRecipe } from "@/lib/enrich-recipe";
import { transformRecipe } from "@/lib/extract-recipe";
import {
  proteinWaffleNutrition,
  proteinWaffleResult,
} from "@/test/fixtures/protein-waffles";
import { POST } from "./route";

vi.mock("@/lib/extract-recipe", () => ({
  transformRecipe: vi.fn(),
}));
vi.mock("@/lib/enrich-recipe", () => ({
  enrichRecipe: vi.fn(),
}));

const mockedTransformRecipe = vi.mocked(transformRecipe);
const mockedEnrichRecipe = vi.mocked(enrichRecipe);

describe("POST /api/recipes/transform", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedTransformRecipe.mockReset();
    mockedEnrichRecipe.mockReset();
  });

  test("transforms the active recipe without saving it", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    mockedTransformRecipe.mockResolvedValueOnce(proteinWaffleResult);
    mockedEnrichRecipe.mockResolvedValueOnce({
      ...proteinWaffleResult,
      nutrition: proteinWaffleNutrition,
    });

    const response = await POST(
      new Request("http://localhost/api/recipes/transform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipe: proteinWaffleResult,
          specialInstructions: "Double it.",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedTransformRecipe).toHaveBeenCalledWith(
      proteinWaffleResult,
      "Double it.",
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  test("rejects an invalid active recipe", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipes/transform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipe: { ingredients: [] },
          specialInstructions: "Double it.",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockedTransformRecipe).not.toHaveBeenCalled();
  });
});
