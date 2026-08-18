import { afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configureProduction(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv(
    "RECIPE_PUBLIC_BASE_URL",
    "https://recipes.example.test",
  );
  vi.stubEnv("RECIPE_REQUIRE_TAILSCALE_IDENTITY", "true");
}

describe("recipe API proxy", () => {
  test("matches recipe APIs without intercepting the health endpoint", () => {
    expect(config.matcher).toBe("/api/recipes/:path*");
  });

  test("returns an explicit JSON 401 without a trusted identity", async () => {
    configureProduction();

    const response = proxy(
      new NextRequest("https://recipes.example.test/api/recipes"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "A trusted Tailscale identity is required.",
    });
  });

  test("returns an explicit JSON 403 for a mutation from another origin", async () => {
    configureProduction();

    const response = proxy(
      new NextRequest("https://recipes.example.test/api/recipes", {
        headers: {
          origin: "https://other.example.test",
          "tailscale-user-login": "owner@example.test",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This request origin is not allowed.",
    });
  });
});
