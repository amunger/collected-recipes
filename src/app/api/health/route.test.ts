import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("@/lib/saved-recipe-store", () => ({
  getSavedRecipeStore: () => ({ check }),
}));

describe("GET /api/health", () => {
  afterEach(() => {
    check.mockReset();
    vi.restoreAllMocks();
  });

  test("reports healthy when SQLite is available", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  test("reports unhealthy when SQLite fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    check.mockImplementationOnce(() => {
      throw new Error("disk unavailable");
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "unhealthy",
    });
  });
});
