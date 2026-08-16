import {
  silentRecipeLogger,
  type RecipeLogger,
} from "@/lib/recipe-logger";

const MAX_SOURCE_CHARACTERS = 120_000;

export interface RecipeSource {
  readonly modelInput: string;
  readonly sourceIngredients: ReadonlyArray<string>;
  readonly sourceInstructions: ReadonlyArray<string>;
  readonly ingredientStrategy: "json-ld" | "recipe-card" | "visible-text";
  readonly instructionStrategy: "json-ld" | "recipe-card" | "visible-text";
}

interface SourceIngredientGroup {
  readonly ingredients: ReadonlyArray<string>;
  readonly name: string;
}

export function decodeHtmlEntities(value: string): string {
  const namedEntities: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, code: string) => {
      if (code.toLowerCase().startsWith("#x")) {
        const codePoint = Number.parseInt(code.slice(2), 16);
        return Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      if (code.startsWith("#")) {
        const codePoint = Number.parseInt(code.slice(1), 10);
        return Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return namedEntities[code.toLowerCase()] ?? entity;
    },
  );
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function collectRecipeIngredients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectRecipeIngredients);
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const directIngredients = record.recipeIngredient;
  const ingredients = Array.isArray(directIngredients)
    ? directIngredients.filter(
        (ingredient): ingredient is string =>
          typeof ingredient === "string" && ingredient.trim().length > 0,
      )
    : [];

  return [
    ...ingredients,
    ...Object.values(record).flatMap(collectRecipeIngredients),
  ];
}

function extractJsonLdIngredients(
  structuredDataBlocks: ReadonlyArray<string>,
): string[] {
  for (const block of structuredDataBlocks) {
    try {
      const ingredients = collectRecipeIngredients(JSON.parse(block));
      if (ingredients.length > 0) {
        return ingredients.map((ingredient) =>
          decodeHtmlEntities(ingredient).trim(),
        );
      }
    } catch {
      // Invalid JSON-LD remains useful as bounded model context.
    }
  }

  return [];
}

function collectInstructionText(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = decodeHtmlEntities(value).trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectInstructionText);
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record.text === "string") {
    return collectInstructionText(record.text);
  }
  if ("itemListElement" in record) {
    return collectInstructionText(record.itemListElement);
  }

  return [];
}

function collectRecipeInstructions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectRecipeInstructions);
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Readonly<Record<string, unknown>>;
  const instructions = collectInstructionText(record.recipeInstructions);
  return [
    ...instructions,
    ...Object.values(record).flatMap(collectRecipeInstructions),
  ];
}

function extractJsonLdInstructions(
  structuredDataBlocks: ReadonlyArray<string>,
): string[] {
  for (const block of structuredDataBlocks) {
    try {
      const instructions = collectRecipeInstructions(JSON.parse(block));
      if (instructions.length > 0) {
        return instructions;
      }
    } catch {
      // Invalid JSON-LD remains useful as bounded model context.
    }
  }

  return [];
}

function extractRecipeCardList(
  html: string,
  attribute: "aria-ingredients" | "aria-instruction",
): string[] {
  const escapedAttribute = attribute.replace("-", "\\-");
  const container = html.match(
    new RegExp(
      `<([a-z][\\w:-]*)[^>]*\\b${escapedAttribute}=["']true["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i",
    ),
  );
  if (!container) {
    return [];
  }

  return Array.from(
    container[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi),
    (match) => htmlToText(match[1]).trim(),
  ).filter(Boolean);
}

function extractRecipeCardIngredientLine(html: string): string {
  const ariaLabel = html.match(
    /<input\b[^>]*\baria-label=["']([^"']*)["'][^>]*>/i,
  )?.[1];
  return htmlToText(ariaLabel ?? html).trim();
}

function extractRecipeCardIngredientGroups(
  html: string,
): ReadonlyArray<SourceIngredientGroup> {
  return Array.from(
    html.matchAll(
      /<h[1-6]\b[^>]*class=["'][^"']*\bwprm-recipe-ingredient-group-name\b[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>\s*<ul\b[^>]*class=["'][^"']*\bwprm-recipe-ingredients\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi,
    ),
    (match) => ({
      ingredients: Array.from(
        match[2].matchAll(
          /<li\b[^>]*class=["'][^"']*\bwprm-recipe-ingredient\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
        ),
        (ingredientMatch) =>
          extractRecipeCardIngredientLine(ingredientMatch[1]),
      ).filter(Boolean),
      name: htmlToText(match[1]).trim(),
    }),
  ).filter((group) => group.name && group.ingredients.length > 0);
}

export function createRecipeSource(
  html: string,
  logger: RecipeLogger = silentRecipeLogger,
): RecipeSource {
  const structuredDataBlocks = Array.from(
    html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
    (match) => match[1].trim(),
  );
  const jsonLdIngredients = extractJsonLdIngredients(structuredDataBlocks);
  const jsonLdInstructions =
    extractJsonLdInstructions(structuredDataBlocks);
  const recipeCardIngredients = extractRecipeCardList(
    html,
    "aria-ingredients",
  );
  const recipeCardIngredientGroups =
    extractRecipeCardIngredientGroups(html);
  const recipeCardInstructions = extractRecipeCardList(
    html,
    "aria-instruction",
  );
  const sourceIngredients =
    jsonLdIngredients.length > 0
      ? jsonLdIngredients
      : recipeCardIngredients;
  const sourceInstructions =
    jsonLdInstructions.length > 0
      ? jsonLdInstructions
      : recipeCardInstructions;
  const ingredientStrategy =
    jsonLdIngredients.length > 0
      ? "json-ld"
      : recipeCardIngredients.length > 0
        ? "recipe-card"
        : "visible-text";
  const instructionStrategy =
    jsonLdInstructions.length > 0
      ? "json-ld"
      : recipeCardInstructions.length > 0
        ? "recipe-card"
        : "visible-text";
  const visibleText = htmlToText(html);
  const modelInput = [
    `Authoritative ingredient lines:\n${JSON.stringify(sourceIngredients)}`,
    `Authoritative ingredient groups:\n${JSON.stringify(recipeCardIngredientGroups)}`,
    `Authoritative instruction steps:\n${JSON.stringify(sourceInstructions)}`,
    `Structured data:\n${structuredDataBlocks.join("\n")}`,
    `Visible text:\n${visibleText}`,
  ]
    .join("\n\n")
    .slice(0, MAX_SOURCE_CHARACTERS);

  logger.info("page.parse.completed", {
    ingredientStrategy,
    instructionStrategy,
    structuredDataCount: structuredDataBlocks.length,
    ingredientCount: sourceIngredients.length,
    instructionCount: sourceInstructions.length,
    modelInputCharacters: modelInput.length,
  });

  return {
    modelInput,
    sourceIngredients,
    sourceInstructions,
    ingredientStrategy,
    instructionStrategy,
  };
}
