import { NextResponse } from "next/server";
import { createRecipeLogger } from "@/lib/recipe-logger";
import { parseSaveRecipeInput } from "@/lib/saved-recipe-request";
import {
  getSavedRecipeStore,
  SavedRecipeNotFoundError,
} from "@/lib/saved-recipe-store";

export const runtime = "nodejs";

interface RecipeRouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function GET(
  _request: Request,
  context: RecipeRouteContext,
) {
  const requestId = crypto.randomUUID();
  const logger = createRecipeLogger(requestId);
  const { id } = await context.params;

  try {
    const recipe = getSavedRecipeStore().get(id);
    if (!recipe) {
      return NextResponse.json(
        { error: "Saved recipe not found.", requestId },
        { status: 404 },
      );
    }
    logger.info("saved-recipes.get.completed", { savedRecipeId: id });
    return NextResponse.json({ recipe, requestId });
  } catch (error: unknown) {
    logger.error("saved-recipes.get.failed", error, {
      savedRecipeId: id,
    });
    return NextResponse.json(
      { error: "The saved recipe could not be loaded.", requestId },
      { status: 500 },
    );
  }
}

export async function PUT(
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
        { error: "Send a valid saved recipe JSON body.", requestId },
        { status: 400 },
      );
    }
    throw error;
  }

  let input: ReturnType<typeof parseSaveRecipeInput>;
  try {
    input = parseSaveRecipeInput(body);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid saved recipe.",
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    const recipe = getSavedRecipeStore().update(id, input);
    logger.info("saved-recipes.update.completed", {
      savedRecipeId: id,
    });
    return NextResponse.json({ recipe, requestId });
  } catch (error: unknown) {
    if (error instanceof SavedRecipeNotFoundError) {
      return NextResponse.json(
        { error: "Saved recipe not found.", requestId },
        { status: 404 },
      );
    }
    logger.error("saved-recipes.update.failed", error, {
      savedRecipeId: id,
    });
    return NextResponse.json(
      { error: "The saved recipe could not be updated.", requestId },
      { status: 500 },
    );
  }
}
