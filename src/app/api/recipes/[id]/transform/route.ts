import { NextResponse } from "next/server";
import { enrichRecipe } from "@/lib/enrich-recipe";
import { transformRecipe } from "@/lib/extract-recipe";
import { createRecipeLogger } from "@/lib/recipe-logger";
import { parseTransformationPrompt } from "@/lib/saved-recipe-request";
import { getSavedRecipeStore } from "@/lib/saved-recipe-store";

export const runtime = "nodejs";

interface RecipeRouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function POST(
  request: Request,
  context: RecipeRouteContext,
) {
  const requestId = crypto.randomUUID();
  const logger = createRecipeLogger(requestId);
  const { id } = await context.params;
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

  let specialInstructions: string;
  try {
    specialInstructions = parseTransformationPrompt(body);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid special instructions.",
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    const saved = getSavedRecipeStore().get(id);
    if (!saved) {
      return NextResponse.json(
        { error: "Saved recipe not found.", requestId },
        { status: 404 },
      );
    }

    const transformed = await transformRecipe(
      saved.recipe,
      specialInstructions,
      { logger, requestId },
    );
    const result = await enrichRecipe(transformed, logger);
    logger.info("saved-recipes.transform.completed", {
      savedRecipeId: id,
      ingredientCount: result.ingredients.length,
    });
    return NextResponse.json({
      ...result,
      sourceUrl: saved.sourceUrl,
      specialInstructions,
      requestId,
    });
  } catch (error: unknown) {
    logger.error("saved-recipes.transform.failed", error, {
      savedRecipeId: id,
    });
    return NextResponse.json(
      {
        error: "Copilot could not transform this recipe. Please try again.",
        requestId,
      },
      { status: 500 },
    );
  }
}
