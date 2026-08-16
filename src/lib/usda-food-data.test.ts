import { describe, expect, test, vi } from "vitest";
import { UsdaFoodDataClient } from "@/lib/usda-food-data";
import { proteinWaffleResult } from "@/test/fixtures/protein-waffles";

describe("UsdaFoodDataClient", () => {
  test("extracts official macro nutrient IDs from a search result", async () => {
    const fetchImplementation: typeof fetch = vi.fn(async () => {
      return Response.json({
        foods: [
          {
            fdcId: 987,
            description: "LOW FAT COTTAGE CHEESE",
            foodNutrients: [
              { nutrientId: 1003, value: 10.6 },
              { nutrientId: 1004, value: 0.88 },
              { nutrientId: 1005, value: 5.31 },
            ],
          },
        ],
      });
    });
    const client = new UsdaFoodDataClient({
      apiKey: "test-key",
      fetchImplementation,
    });

    await expect(
      client.findMacros(proteinWaffleResult.ingredients[1]),
    ).resolves.toEqual({
      carbohydratesPer100Grams: 5.31,
      description: "LOW FAT COTTAGE CHEESE",
      fatPer100Grams: 0.88,
      fdcId: 987,
      proteinPer100Grams: 10.6,
    });
    const requestedUrl = new URL(
      String(vi.mocked(fetchImplementation).mock.calls[0][0]),
    );
    expect(requestedUrl.searchParams.get("query")).toBe(
      "low fat cottage cheese 2% milkfat",
    );
    expect(requestedUrl.searchParams.get("api_key")).toBe("test-key");
  });

  test("caches matches and reports invalid provider responses", async () => {
    const fetchImplementation: typeof fetch = vi.fn(async () =>
      Response.json({ foods: [] }),
    );
    const client = new UsdaFoodDataClient({ fetchImplementation });

    await expect(
      client.findMacros(proteinWaffleResult.ingredients[0]),
    ).resolves.toBeNull();
    await expect(
      client.findMacros(proteinWaffleResult.ingredients[0]),
    ).resolves.toBeNull();
    expect(fetchImplementation).toHaveBeenCalledOnce();

    const invalidClient = new UsdaFoodDataClient({
      fetchImplementation: vi.fn(async () => Response.json({ bad: true })),
    });
    await expect(
      invalidClient.findMacros(proteinWaffleResult.ingredients[0]),
    ).rejects.toThrow("invalid search response");
  });
});
