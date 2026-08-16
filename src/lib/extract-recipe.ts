import {
  extractRecipeWithCopilot,
  type CopilotRecipeOptions,
  type RecipeImage,
} from "@/lib/copilot-ingredients";
import type { IngredientResult } from "@/lib/ingredient-result";
import {
  fetchRecipePage,
  InvalidRecipeUrlError,
  RecipePageFetchError,
  type RecipePageLoaderOptions,
} from "@/lib/recipe-page";
import {
  createRecipeLogger,
  type RecipeLogger,
} from "@/lib/recipe-logger";
import { createRecipeSource } from "@/lib/recipe-source";

export { InvalidRecipeUrlError, RecipePageFetchError };

export interface ExtractRecipeOptions {
  readonly copilot?: Omit<CopilotRecipeOptions, "logger">;
  readonly loadPage?: Omit<RecipePageLoaderOptions, "logger">;
  readonly logger?: RecipeLogger;
  readonly requestId?: string;
  readonly specialInstructions?: string;
}

export async function extractRecipe(
  value: string,
  options: ExtractRecipeOptions = {},
): Promise<IngredientResult> {
  const requestId = options.requestId ?? crypto.randomUUID();
  const logger = options.logger ?? createRecipeLogger(requestId);
  const startedAt = performance.now();

  logger.info("recipe.extraction.started");

  try {
    const page = await fetchRecipePage(value, {
      ...options.loadPage,
      logger,
    });
    const source = createRecipeSource(page.text, logger);
    const result = await extractRecipeWithCopilot(
      page.url,
      source.modelInput,
      {
        ...options.copilot,
        logger,
        specialInstructions: options.specialInstructions,
      },
    );
    logger.info("recipe.extraction.completed", {
      ingredientCount: result.ingredients.length,
      instructionCount: result.instructions.length,
      totalDurationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error: unknown) {
    logger.error("recipe.extraction.failed", error, {
      totalDurationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}

export async function extractRecipeImages(
  images: ReadonlyArray<RecipeImage>,
  options: Omit<ExtractRecipeOptions, "loadPage"> = {},
): Promise<IngredientResult> {
  if (images.length < 1 || images.length > 2) {
    throw new Error("Upload one or two recipe images.");
  }

  const requestId = options.requestId ?? crypto.randomUUID();
  const logger = options.logger ?? createRecipeLogger(requestId);
  const startedAt = performance.now();
  logger.info("recipe.image_extraction.started", {
    imageCount: images.length,
  });

  try {
    const result = await extractRecipeWithCopilot(
      "uploaded-recipe-images",
      "The attached images are consecutive recipe pages in upload order. Read all visible recipe text, preserve ingredient group headings and page order, and ignore non-recipe text.",
      {
        ...options.copilot,
        images,
        logger,
        specialInstructions: options.specialInstructions,
      },
    );
    logger.info("recipe.image_extraction.completed", {
      imageCount: images.length,
      ingredientCount: result.ingredients.length,
      instructionCount: result.instructions.length,
      totalDurationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error: unknown) {
    logger.error("recipe.image_extraction.failed", error, {
      imageCount: images.length,
      totalDurationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}

export async function transformRecipe(
  recipe: IngredientResult,
  specialInstructions: string,
  options: Omit<ExtractRecipeOptions, "loadPage" | "specialInstructions"> = {},
): Promise<IngredientResult> {
  const normalizedInstructions = specialInstructions.trim();
  if (!normalizedInstructions) {
    throw new Error("Special instructions are required.");
  }

  const requestId = options.requestId ?? crypto.randomUUID();
  const logger = options.logger ?? createRecipeLogger(requestId);
  const startedAt = performance.now();
  logger.info("recipe.transformation.started");

  try {
    const result = await extractRecipeWithCopilot(
      "saved-recipe",
      `Current saved recipe:\n${JSON.stringify(recipe)}`,
      {
        ...options.copilot,
        logger,
        specialInstructions: normalizedInstructions,
      },
    );
    logger.info("recipe.transformation.completed", {
      ingredientCount: result.ingredients.length,
      instructionCount: result.instructions.length,
      totalDurationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error: unknown) {
    logger.error("recipe.transformation.failed", error, {
      totalDurationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}
