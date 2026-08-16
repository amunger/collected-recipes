import { afterEach, describe, expect, test, vi } from "vitest";
import {
  proteinWaffleNutrition,
  proteinWaffleResult,
} from "@/test/fixtures/protein-waffles";
import { GET, POST } from "./route";

const { create, list } = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/saved-recipe-store", () => ({
  getSavedRecipeStore: () => ({ create, list }),
}));

const savedRecipe = {
  createdAt: "2026-08-15T20:00:00.000Z",
  customNotes: null,
  id: "saved-1",
  name: "Protein waffles",
  nutrition: proteinWaffleNutrition,
  recipe: proteinWaffleResult,
  sourceUrl: "https://example.com/waffles",
  specialInstructions: null,
  updatedAt: "2026-08-15T20:00:00.000Z",
};

describe("/api/recipes", () => {
  afterEach(() => {
    create.mockReset();
    list.mockReset();
    vi.restoreAllMocks();
  });

  test("lists saved recipes", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    list.mockReturnValue([savedRecipe]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      recipes: [savedRecipe],
      requestId: expect.any(String),
    });
  });

  test("validates and creates a saved recipe", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    create.mockReturnValue(savedRecipe);

    const response = await POST(
      new Request("http://localhost/api/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Protein waffles",
          nutrition: proteinWaffleNutrition,
          recipe: proteinWaffleResult,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      recipe: savedRecipe,
    });
  });

  test("rejects an invalid save payload", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await POST(
      new Request("http://localhost/api/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
