import { NextResponse } from "next/server";
import {
  createCopilotBusyResponse,
  tryAcquireCopilotOperation,
} from "@/lib/copilot-operation-gate";
import { enrichRecipe } from "@/lib/enrich-recipe";
import { transformRecipe } from "@/lib/extract-recipe";
import { createRecipeLogger } from "@/lib/recipe-logger";
import { parseRecipeTransformationInput } from "@/lib/saved-recipe-request";

export const runtime = "nodejs";

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

  try {
    body = await request.json();
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Send a valid transformation JSON body.", requestId },
        { status: 400 },
      );
    }
    throw error;
  }

  let input: ReturnType<typeof parseRecipeTransformationInput>;
  try {
    input = parseRecipeTransformationInput(body);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid recipe transformation.",
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    const transformed = await transformRecipe(
      input.recipe,
      input.specialInstructions,
      { logger, requestId },
    );
    const result = await enrichRecipe(transformed, logger);
    logger.info("recipes.transform.completed", {
      ingredientCount: result.ingredients.length,
    });
    return NextResponse.json({ ...result, requestId });
  } catch (error: unknown) {
    logger.error("recipes.transform.failed", error);
    return NextResponse.json(
      {
        error: "Copilot could not transform this recipe. Please try again.",
        requestId,
      },
      { status: 500 },
    );
  }
}
