import { afterEach, describe, expect, test, vi } from "vitest";
import { enrichRecipe } from "@/lib/enrich-recipe";
import { transformRecipe } from "@/lib/extract-recipe";
import {
  proteinWaffleNutrition,
  proteinWaffleResult,
} from "@/test/fixtures/protein-waffles";
import { POST } from "./route";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/saved-recipe-store", () => ({
  getSavedRecipeStore: () => ({ get }),
}));
vi.mock("@/lib/extract-recipe", () => ({
  transformRecipe: vi.fn(),
}));
vi.mock("@/lib/enrich-recipe", () => ({
  enrichRecipe: vi.fn(),
}));

const mockedTransformRecipe = vi.mocked(transformRecipe);
const mockedEnrichRecipe = vi.mocked(enrichRecipe);

describe("POST /api/recipes/[id]/transform", () => {
  afterEach(() => {
    get.mockReset();
    mockedTransformRecipe.mockReset();
    mockedEnrichRecipe.mockReset();
    vi.restoreAllMocks();
  });

  test("transforms the current saved snapshot without updating it", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    get.mockReturnValue({
      id: "saved-1",
      recipe: proteinWaffleResult,
      sourceUrl: "https://example.com/waffles",
    });
    mockedTransformRecipe.mockResolvedValueOnce(proteinWaffleResult);
    mockedEnrichRecipe.mockResolvedValueOnce({
      ...proteinWaffleResult,
      nutrition: proteinWaffleNutrition,
    });

    const response = await POST(
      new Request("http://localhost/api/recipes/saved-1/transform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          specialInstructions: "Double this recipe.",
        }),
      }),
      { params: Promise.resolve({ id: "saved-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockedTransformRecipe).toHaveBeenCalledWith(
      proteinWaffleResult,
      "Double this recipe.",
      expect.any(Object),
    );
    await expect(response.json()).resolves.toMatchObject({
      ...proteinWaffleResult,
      nutrition: proteinWaffleNutrition,
      specialInstructions: "Double this recipe.",
    });
  });

  test("returns not found before invoking Copilot", async () => {
    get.mockReturnValue(null);

    const response = await POST(
      new Request("http://localhost/api/recipes/missing/transform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ specialInstructions: "Double it." }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
    expect(mockedTransformRecipe).not.toHaveBeenCalled();
  });
});
