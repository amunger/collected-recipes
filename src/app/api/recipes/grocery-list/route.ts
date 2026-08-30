import { NextResponse } from "next/server";
import { createRecipeLogger } from "@/lib/recipe-logger";
import {
  getSavedRecipeStore,
  SavedRecipeNotFoundError,
} from "@/lib/saved-recipe-store";

export const runtime = "nodejs";

function parseSavedRecipeId(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Send a grocery list JSON object.");
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.savedRecipeId !== "string" ||
    !record.savedRecipeId.trim()
  ) {
    throw new Error("A saved recipe ID is required.");
  }
  return record.savedRecipeId.trim();
}

export async function GET() {
  const requestId = crypto.randomUUID();
  const logger = createRecipeLogger(requestId);

  try {
    const items = getSavedRecipeStore().listGroceryItems();
    logger.info("grocery-list.get.completed", { count: items.length });
    return NextResponse.json({ items, requestId });
  } catch (error: unknown) {
    logger.error("grocery-list.get.failed", error);
    return NextResponse.json(
      { error: "The grocery list could not be loaded.", requestId },
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
        { error: "Send a valid grocery list JSON body.", requestId },
        { status: 400 },
      );
    }
    throw error;
  }

  let savedRecipeId: string;
  try {
    savedRecipeId = parseSavedRecipeId(body);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid grocery list item.",
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    const items =
      getSavedRecipeStore().addRecipeToGroceryList(savedRecipeId);
    logger.info("grocery-list.add.completed", {
      count: items.length,
      savedRecipeId,
    });
    return NextResponse.json({ items, requestId });
  } catch (error: unknown) {
    if (error instanceof SavedRecipeNotFoundError) {
      return NextResponse.json(
        { error: "Saved recipe not found.", requestId },
        { status: 404 },
      );
    }
    logger.error("grocery-list.add.failed", error, { savedRecipeId });
    return NextResponse.json(
      { error: "The recipe could not be added to the grocery list.", requestId },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const requestId = crypto.randomUUID();
  const logger = createRecipeLogger(requestId);

  try {
    getSavedRecipeStore().clearGroceryList();
    logger.info("grocery-list.clear.completed");
    return NextResponse.json({ items: [], requestId });
  } catch (error: unknown) {
    logger.error("grocery-list.clear.failed", error);
    return NextResponse.json(
      { error: "The grocery list could not be cleared.", requestId },
      { status: 500 },
    );
  }
}
