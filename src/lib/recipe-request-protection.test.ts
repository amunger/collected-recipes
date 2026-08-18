import { describe, expect, test } from "vitest";
import {
  protectRecipeRequest,
  TAILSCALE_IDENTITY_HEADER,
} from "@/lib/recipe-request-protection";

const productionEnvironment = {
  NODE_ENV: "production",
  RECIPE_PUBLIC_BASE_URL: "https://recipes.example.test",
  RECIPE_REQUIRE_TAILSCALE_IDENTITY: "true",
} as const;

function request(
  method: string,
  headers: Readonly<Record<string, string>> = {},
): Request {
  return new Request("http://localhost/api/recipes", {
    headers,
    method,
  });
}

describe("protectRecipeRequest", () => {
  test("allows development requests without production headers", () => {
    expect(
      protectRecipeRequest(request("POST"), { NODE_ENV: "development" }),
    ).toEqual({ allowed: true });
  });

  test("fails closed when production configuration is missing, disabled, or unsafe", () => {
    expect(
      protectRecipeRequest(request("GET"), { NODE_ENV: "production" }),
    ).toMatchObject({ allowed: false, status: 403 });
    expect(
      protectRecipeRequest(request("GET"), {
        ...productionEnvironment,
        RECIPE_REQUIRE_TAILSCALE_IDENTITY: "false",
      }),
    ).toMatchObject({ allowed: false, status: 403 });
    expect(
      protectRecipeRequest(request("GET"), {
        ...productionEnvironment,
        RECIPE_PUBLIC_BASE_URL: "http://recipes.example.test",
      }),
    ).toMatchObject({ allowed: false, status: 403 });
  });

  test("requires a non-empty Tailscale Serve identity for every recipe request", () => {
    expect(
      protectRecipeRequest(request("GET"), productionEnvironment),
    ).toEqual({
      allowed: false,
      error: "A trusted Tailscale identity is required.",
      status: 401,
    });
    expect(
      protectRecipeRequest(
        request("HEAD", { [TAILSCALE_IDENTITY_HEADER]: "owner@example.test" }),
        productionEnvironment,
      ),
    ).toEqual({ allowed: true });
  });

  test("requires the exact configured HTTPS Origin for mutations", () => {
    const identityHeaders = {
      [TAILSCALE_IDENTITY_HEADER]: "owner@example.test",
    };

    expect(
      protectRecipeRequest(
        request("POST", {
          ...identityHeaders,
          origin: "https://recipes.example.test",
        }),
        productionEnvironment,
      ),
    ).toEqual({ allowed: true });
    expect(
      protectRecipeRequest(
        request("POST", {
          ...identityHeaders,
          origin: "https://other.example.test",
        }),
        productionEnvironment,
      ),
    ).toMatchObject({ allowed: false, status: 403 });
    expect(
      protectRecipeRequest(
        request("POST", {
          ...identityHeaders,
          "x-forwarded-origin": "https://recipes.example.test",
        }),
        productionEnvironment,
      ),
    ).toMatchObject({ allowed: false, status: 403 });
  });

});
