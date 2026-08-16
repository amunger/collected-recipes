import { afterEach, describe, expect, test, vi } from "vitest";
import { enrichRecipe } from "@/lib/enrich-recipe";
import { extractRecipeImages } from "@/lib/extract-recipe";
import {
  proteinWaffleNutrition,
  proteinWaffleResult,
} from "@/test/fixtures/protein-waffles";
import { POST } from "./route";

vi.mock("@/lib/extract-recipe", () => ({
  extractRecipeImages: vi.fn(),
}));
vi.mock("@/lib/enrich-recipe", () => ({
  enrichRecipe: vi.fn(),
}));

const mockedExtractRecipeImages = vi.mocked(extractRecipeImages);
const mockedEnrichRecipe = vi.mocked(enrichRecipe);
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("POST /api/recipes/extract-images", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedExtractRecipeImages.mockReset();
    mockedEnrichRecipe.mockReset();
  });

  test("extracts and enriches uploaded recipe images", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    mockedExtractRecipeImages.mockResolvedValueOnce(proteinWaffleResult);
    mockedEnrichRecipe.mockResolvedValueOnce({
      ...proteinWaffleResult,
      nutrition: proteinWaffleNutrition,
    });
    const formData = new FormData();
    formData.append(
      "images",
      new File([pngBytes], "recipe.png", { type: "image/png" }),
    );

    const response = await POST(
      new Request("http://localhost/api/recipes/extract-images", {
        body: formData,
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedExtractRecipeImages).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          displayName: "recipe-page-1.png",
          mimeType: "image/png",
        }),
      ],
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    await expect(response.json()).resolves.toMatchObject({
      ...proteinWaffleResult,
      nutrition: proteinWaffleNutrition,
      requestId: expect.any(String),
    });
  });

  test("rejects requests without images", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await POST(
      new Request("http://localhost/api/recipes/extract-images", {
        body: new FormData(),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockedExtractRecipeImages).not.toHaveBeenCalled();
  });
});
