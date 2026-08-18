export const TAILSCALE_IDENTITY_HEADER = "tailscale-user-login";

interface RecipeRequestProtectionEnvironment {
  readonly NODE_ENV?: string;
  readonly RECIPE_PUBLIC_BASE_URL?: string;
  readonly RECIPE_REQUIRE_TAILSCALE_IDENTITY?: string;
}

export type RecipeRequestProtectionResult =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly error: string;
      readonly status: 401 | 403;
    };

interface ProductionProtectionConfig {
  readonly publicOrigin: string;
}

function readProductionConfig(
  environment: RecipeRequestProtectionEnvironment,
): ProductionProtectionConfig | null {
  const identitySetting =
    environment.RECIPE_REQUIRE_TAILSCALE_IDENTITY;
  if (identitySetting !== "true") {
    return null;
  }

  try {
    const publicUrl = new URL(environment.RECIPE_PUBLIC_BASE_URL ?? "");
    if (
      publicUrl.protocol !== "https:" ||
      publicUrl.username ||
      publicUrl.password ||
      publicUrl.pathname !== "/" ||
      publicUrl.search ||
      publicUrl.hash
    ) {
      return null;
    }

    return {
      publicOrigin: publicUrl.origin,
    };
  } catch {
    return null;
  }
}

export function protectRecipeRequest(
  request: Request,
  environment: RecipeRequestProtectionEnvironment = process.env,
): RecipeRequestProtectionResult {
  if (environment.NODE_ENV !== "production") {
    return { allowed: true };
  }

  const config = readProductionConfig(environment);
  if (!config) {
    return {
      allowed: false,
      error: "Recipe API request protection is not configured safely.",
      status: 403,
    };
  }

  if (!request.headers.get(TAILSCALE_IDENTITY_HEADER)?.trim()) {
    return {
      allowed: false,
      error: "A trusted Tailscale identity is required.",
      status: 401,
    };
  }

  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.headers.get("origin") !== config.publicOrigin
  ) {
    return {
      allowed: false,
      error: "This request origin is not allowed.",
      status: 403,
    };
  }

  return { allowed: true };
}
