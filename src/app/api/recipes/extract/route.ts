import { NextResponse } from "next/server";
import {
  extractRecipe,
  InvalidRecipeUrlError,
  RecipePageFetchError,
} from "@/lib/extract-recipe";
import { enrichRecipe } from "@/lib/enrich-recipe";
import {
  createCopilotBusyResponse,
  tryAcquireCopilotOperation,
} from "@/lib/copilot-operation-gate";
import { createRecipeLogger } from "@/lib/recipe-logger";

export const runtime = "nodejs";

interface ExtractRecipeRequest {
  readonly url: string;
  readonly specialInstructions?: string;
}

function isExtractRecipeRequest(value: unknown): value is ExtractRecipeRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "url" in value &&
    typeof value.url === "string" &&
    (!("specialInstructions" in value) ||
      value.specialInstructions === undefined ||
      typeof value.specialInstructions === "string")
  );
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const lease = tryAcquireCopilotOperation();
  if (!lease) {
    return createCopilotBusyResponse(requestId);
  }

  try {
    return await handlePost(request, requestId);
  } finally {
    lease.release();
  }
}

async function handlePost(request: Request, requestId: string) {
  const logger = createRecipeLogger(requestId);
  let body: unknown;

  logger.info("api.request.received", {
    method: request.method,
    contentType: request.headers.get("content-type"),
  });

  try {
    body = await request.json();
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      logger.info("api.request.rejected", { reason: "invalid_json" });
      return NextResponse.json(
        {
          error: "Send a JSON body containing a recipe URL.",
          requestId,
        },
        { status: 400 },
      );
    }
    throw error;
  }

  if (!isExtractRecipeRequest(body)) {
    logger.info("api.request.rejected", { reason: "missing_url" });
    return NextResponse.json(
      { error: "A recipe URL is required.", requestId },
      { status: 400 },
    );
  }

  if ((body.specialInstructions?.trim().length ?? 0) > 2_000) {
    logger.info("api.request.rejected", {
      reason: "special_instructions_too_long",
    });
    return NextResponse.json(
      {
        error: "Special instructions must be 2,000 characters or fewer.",
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    const recipe = await extractRecipe(body.url, {
      logger,
      requestId,
      specialInstructions: body.specialInstructions,
    });
    const result = await enrichRecipe(recipe, logger);
    logger.info("api.request.completed", {
      ingredientCount: result.ingredients.length,
      instructionCount: result.instructions.length,
      status: 200,
    });
    return NextResponse.json({ ...result, requestId });
  } catch (error: unknown) {
    if (error instanceof InvalidRecipeUrlError) {
      logger.info("api.request.completed", { status: 400 });
      return NextResponse.json(
        { error: error.message, requestId },
        { status: 400 },
      );
    }

    if (error instanceof RecipePageFetchError) {
      logger.info("api.request.completed", { status: 502 });
      return NextResponse.json(
        { error: error.message, requestId },
        { status: 502 },
      );
    }

    logger.error("api.request.failed", error, { status: 500 });
    return NextResponse.json(
      {
        error: "Copilot could not extract this recipe. Please try again.",
        requestId,
      },
      { status: 500 },
    );
  }
}
