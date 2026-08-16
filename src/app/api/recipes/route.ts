import { NextResponse } from "next/server";
import { createRecipeLogger } from "@/lib/recipe-logger";
import { parseSaveRecipeInput } from "@/lib/saved-recipe-request";
import { getSavedRecipeStore } from "@/lib/saved-recipe-store";

export const runtime = "nodejs";

export async function GET() {
  const requestId = crypto.randomUUID();
  const logger = createRecipeLogger(requestId);

  try {
    const recipes = getSavedRecipeStore().list();
    logger.info("saved-recipes.list.completed", { count: recipes.length });
    return NextResponse.json({ recipes, requestId });
  } catch (error: unknown) {
    logger.error("saved-recipes.list.failed", error);
    return NextResponse.json(
      { error: "Saved recipes could not be loaded.", requestId },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const logger = createRecipeLogger(requestId);
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
    const message =
      error instanceof Error ? error.message : "Invalid saved recipe.";
    logger.info("saved-recipes.create.rejected", { reason: message });
    return NextResponse.json(
      { error: message, requestId },
      { status: 400 },
    );
  }

  try {
    const recipe = getSavedRecipeStore().create(input);
    logger.info("saved-recipes.create.completed", {
      savedRecipeId: recipe.id,
    });
    return NextResponse.json({ recipe, requestId }, { status: 201 });
  } catch (error: unknown) {
    logger.error("saved-recipes.create.failed", error);
    return NextResponse.json(
      { error: "The recipe could not be saved.", requestId },
      { status: 500 },
    );
  }
}
