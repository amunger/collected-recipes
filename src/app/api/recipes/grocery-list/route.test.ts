import { afterEach, describe, expect, test, vi } from "vitest";
import { proteinWaffleResult } from "@/test/fixtures/protein-waffles";
import { DELETE, GET, POST } from "./route";

const { addRecipeToGroceryList, clearGroceryList, listGroceryItems } = vi.hoisted(
  () => ({
    addRecipeToGroceryList: vi.fn(),
    clearGroceryList: vi.fn(),
    listGroceryItems: vi.fn(),
  }),
);

vi.mock("@/lib/saved-recipe-store", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/saved-recipe-store")>();
  return {
    ...original,
    getSavedRecipeStore: () => ({
      addRecipeToGroceryList,
      clearGroceryList,
      listGroceryItems,
    }),
  };
});

const groceryItem = {
  addedAt: "2026-08-30T20:00:00.000Z",
  id: "item-1",
  ingredient: proteinWaffleResult.ingredients[0],
  ingredientIndex: 0,
  recipeName: "Protein waffles",
  savedRecipeId: "saved-1",
};

describe("/api/recipes/grocery-list", () => {
  afterEach(() => {
    addRecipeToGroceryList.mockReset();
    clearGroceryList.mockReset();
    listGroceryItems.mockReset();
    vi.restoreAllMocks();
  });

  test("lists grocery items", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    listGroceryItems.mockReturnValue([groceryItem]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [groceryItem],
    });
  });

  test("adds a saved recipe", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    addRecipeToGroceryList.mockReturnValue([groceryItem]);

    const response = await POST(
      new Request("http://localhost/api/recipes/grocery-list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ savedRecipeId: "saved-1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(addRecipeToGroceryList).toHaveBeenCalledWith("saved-1");
  });

  test("rejects a missing saved recipe ID", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipes/grocery-list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(addRecipeToGroceryList).not.toHaveBeenCalled();
  });

  test("clears every grocery item", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(clearGroceryList).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ items: [] });
  });
});
