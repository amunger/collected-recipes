import { NextResponse } from "next/server";
import { enrichRecipe } from "@/lib/enrich-recipe";
import { extractRecipeImages } from "@/lib/extract-recipe";
import { parseRecipeImageRequest } from "@/lib/recipe-image-request";
import { createRecipeLogger } from "@/lib/recipe-logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const logger = createRecipeLogger(requestId);
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error: unknown) {
    logger.info("api.image_request.rejected", {
      reason: error instanceof Error ? error.message : "invalid_form_data",
    });
    return NextResponse.json(
      { error: "Send one or two recipe image files.", requestId },
      { status: 400 },
    );
  }

  let input: Awaited<ReturnType<typeof parseRecipeImageRequest>>;
  try {
    input = await parseRecipeImageRequest(formData);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Invalid recipe images.";
    logger.info("api.image_request.rejected", { reason: message });
    return NextResponse.json(
      { error: message, requestId },
      { status: 400 },
    );
  }

  try {
    const recipe = await extractRecipeImages(input.images, {
      logger,
      requestId,
      specialInstructions: input.specialInstructions,
    });
    const result = await enrichRecipe(recipe, logger);
    logger.info("api.image_request.completed", {
      imageCount: input.images.length,
      ingredientCount: result.ingredients.length,
      instructionCount: result.instructions.length,
      status: 200,
    });
    return NextResponse.json({ ...result, requestId });
  } catch (error: unknown) {
    logger.error("api.image_request.failed", error, { status: 500 });
    return NextResponse.json(
      {
        error:
          "Copilot could not extract a recipe from these images. Try clearer, closer photos.",
        requestId,
      },
      { status: 500 },
    );
  }
}
