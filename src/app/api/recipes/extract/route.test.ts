import { afterEach, describe, expect, test, vi } from "vitest";
import {
  extractRecipe,
  InvalidRecipeUrlError,
  RecipePageFetchError,
} from "@/lib/extract-recipe";
import { enrichRecipe } from "@/lib/enrich-recipe";
import {
  proteinWaffleNutrition,
  proteinWaffleResult,
} from "@/test/fixtures/protein-waffles";
import { POST } from "./route";

vi.mock("@/lib/extract-recipe", () => {
  class MockInvalidRecipeUrlError extends Error {}
  class MockRecipePageFetchError extends Error {}

  return {
    extractRecipe: vi.fn(),
    InvalidRecipeUrlError: MockInvalidRecipeUrlError,
    RecipePageFetchError: MockRecipePageFetchError,
  };
});
vi.mock("@/lib/enrich-recipe", () => ({
  enrichRecipe: vi.fn(),
}));

const mockedExtractRecipe = vi.mocked(extractRecipe);
const mockedEnrichRecipe = vi.mocked(enrichRecipe);

describe("POST /api/recipes/extract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedExtractRecipe.mockReset();
    mockedEnrichRecipe.mockReset();
  });

  test("rejects malformed JSON at the boundary", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await POST(
      new Request("http://localhost/api/recipes/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Send a JSON body containing a recipe URL.",
      requestId: expect.any(String),
    });
  });

  test("returns validated ingredients and a request ID", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    mockedExtractRecipe.mockResolvedValueOnce(proteinWaffleResult);
    mockedEnrichRecipe.mockResolvedValueOnce({
      ...proteinWaffleResult,
      nutrition: proteinWaffleNutrition,
    });

    const response = await POST(
      new Request("http://localhost/api/recipes/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ...proteinWaffleResult,
      nutrition: proteinWaffleNutrition,
      requestId: expect.any(String),
    });
  });

  test("rejects concurrent Copilot work immediately", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    let finishExtraction:
      | ((value: typeof proteinWaffleResult) => void)
      | undefined;
    mockedExtractRecipe.mockReturnValueOnce(
      new Promise((resolve) => {
        finishExtraction = resolve;
      }),
    );
    mockedEnrichRecipe.mockResolvedValueOnce({
      ...proteinWaffleResult,
      nutrition: proteinWaffleNutrition,
    });
    const createRequest = () =>
      new Request("http://localhost/api/recipes/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      });

    const activeResponse = POST(createRequest());
    await vi.waitFor(() => {
      expect(mockedExtractRecipe).toHaveBeenCalledTimes(1);
    });
    const busyResponse = await POST(createRequest());

    expect(busyResponse.status).toBe(429);
    expect(busyResponse.headers.get("Retry-After")).toBe("5");
    await expect(busyResponse.json()).resolves.toMatchObject({
      error: expect.stringContaining("Wait for it to finish"),
      requestId: expect.any(String),
    });
    expect(mockedExtractRecipe).toHaveBeenCalledTimes(1);

    finishExtraction?.(proteinWaffleResult);
    expect((await activeResponse).status).toBe(200);
  });

  test("rejects oversized special instructions", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await POST(
      new Request("http://localhost/api/recipes/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/recipe",
          specialInstructions: "x".repeat(2_001),
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockedExtractRecipe).not.toHaveBeenCalled();
  });

  test.each([
    [new InvalidRecipeUrlError("bad URL"), 400],
    [new RecipePageFetchError("upstream failed"), 502],
    [new Error("model failed"), 500],
  ])("maps extraction failures to HTTP errors", async (error, status) => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedExtractRecipe.mockRejectedValueOnce(error);

    const response = await POST(
      new Request("http://localhost/api/recipes/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      }),
    );

    expect(response.status).toBe(status);
  });
});
