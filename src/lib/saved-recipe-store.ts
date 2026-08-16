import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import {
  validateIngredientResult,
  type IngredientResult,
} from "@/lib/ingredient-result";
import {
  validateNutritionResult,
  type NutritionResult,
} from "@/lib/nutrition";

export interface SavedRecipe {
  readonly createdAt: string;
  readonly customNotes: string | null;
  readonly id: string;
  readonly name: string;
  readonly nutrition: NutritionResult;
  readonly recipe: IngredientResult;
  readonly sourceUrl: string | null;
  readonly specialInstructions: string | null;
  readonly updatedAt: string;
}

export interface SaveRecipeInput {
  readonly customNotes?: string | null;
  readonly name: string;
  readonly nutrition: NutritionResult;
  readonly recipe: IngredientResult;
  readonly sourceUrl?: string | null;
  readonly specialInstructions?: string | null;
}

interface SavedRecipeRow {
  readonly created_at: string;
  readonly custom_notes: string | null;
  readonly id: string;
  readonly name: string;
  readonly nutrition_json: string;
  readonly recipe_json: string;
  readonly source_url: string | null;
  readonly special_instructions: string | null;
  readonly updated_at: string;
}

export class SavedRecipeNotFoundError extends Error {
  constructor(id: string) {
    super(`Saved recipe ${id} was not found.`);
    this.name = "SavedRecipeNotFoundError";
  }
}

function parseStoredJson(value: string, description: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error: unknown) {
    throw new Error(
      `Stored ${description} JSON is invalid: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
    );
  }
}

function mapRow(row: SavedRecipeRow): SavedRecipe {
  return {
    createdAt: row.created_at,
    customNotes: row.custom_notes,
    id: row.id,
    name: row.name,
    nutrition: validateNutritionResult(
      parseStoredJson(row.nutrition_json, "nutrition"),
    ),
    recipe: validateIngredientResult(
      parseStoredJson(row.recipe_json, "recipe"),
    ),
    sourceUrl: row.source_url,
    specialInstructions: row.special_instructions,
    updatedAt: row.updated_at,
  };
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("A saved recipe name is required.");
  }
  if (normalized.length > 120) {
    throw new Error("Saved recipe names must be 120 characters or fewer.");
  }
  return normalized;
}

function normalizeCustomNotes(
  notes: string | null | undefined,
): string | null {
  const normalized = notes?.trim() || null;
  if (normalized && normalized.length > 10_000) {
    throw new Error("Custom notes must be 10,000 characters or fewer.");
  }
  return normalized;
}

export class SavedRecipeStore {
  readonly #database: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.#database = new Database(databasePath);
    this.#database.pragma("journal_mode = WAL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS saved_recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        custom_notes TEXT,
        source_url TEXT,
        special_instructions TEXT,
        recipe_json TEXT NOT NULL,
        nutrition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS saved_recipes_updated_at
        ON saved_recipes(updated_at DESC);
    `);
    const columns = this.#database
      .prepare("PRAGMA table_info(saved_recipes)")
      .all() as Array<{ readonly name: string }>;
    if (!columns.some((column) => column.name === "custom_notes")) {
      this.#database.exec(
        "ALTER TABLE saved_recipes ADD COLUMN custom_notes TEXT",
      );
    }
  }

  close(): void {
    this.#database.close();
  }

  check(): void {
    this.#database.prepare("SELECT 1").get();
  }

  create(input: SaveRecipeInput): SavedRecipe {
    const now = new Date().toISOString();
    const saved: SavedRecipe = {
      createdAt: now,
      customNotes: normalizeCustomNotes(input.customNotes),
      id: crypto.randomUUID(),
      name: normalizeName(input.name),
      nutrition: input.nutrition,
      recipe: input.recipe,
      sourceUrl: input.sourceUrl?.trim() || null,
      specialInstructions: input.specialInstructions?.trim() || null,
      updatedAt: now,
    };
    this.#database
      .prepare(
        `INSERT INTO saved_recipes (
          id, name, custom_notes, source_url, special_instructions, recipe_json,
          nutrition_json, created_at, updated_at
        ) VALUES (
          @id, @name, @customNotes, @sourceUrl, @specialInstructions, @recipeJson,
          @nutritionJson, @createdAt, @updatedAt
        )`,
      )
      .run({
        ...saved,
        nutritionJson: JSON.stringify(saved.nutrition),
        recipeJson: JSON.stringify(saved.recipe),
      });
    return saved;
  }

  get(id: string): SavedRecipe | null {
    const row = this.#database
      .prepare("SELECT * FROM saved_recipes WHERE id = ?")
      .get(id) as SavedRecipeRow | undefined;
    return row ? mapRow(row) : null;
  }

  list(): ReadonlyArray<SavedRecipe> {
    const rows = this.#database
      .prepare(
        "SELECT * FROM saved_recipes ORDER BY updated_at DESC, name ASC",
      )
      .all() as SavedRecipeRow[];
    return rows.map(mapRow);
  }

  update(id: string, input: SaveRecipeInput): SavedRecipe {
    const updatedAt = new Date().toISOString();
    const row = this.#database
      .prepare(
        `UPDATE saved_recipes SET
          name = @name,
          custom_notes = @customNotes,
          source_url = @sourceUrl,
          special_instructions = @specialInstructions,
          recipe_json = @recipeJson,
          nutrition_json = @nutritionJson,
          updated_at = @updatedAt
        WHERE id = @id
        RETURNING *`,
      )
      .get({
        id,
        customNotes: normalizeCustomNotes(input.customNotes),
        name: normalizeName(input.name),
        nutritionJson: JSON.stringify(input.nutrition),
        recipeJson: JSON.stringify(input.recipe),
        sourceUrl: input.sourceUrl?.trim() || null,
        specialInstructions: input.specialInstructions?.trim() || null,
        updatedAt,
      }) as SavedRecipeRow | undefined;

    if (!row) {
      throw new SavedRecipeNotFoundError(id);
    }
    return mapRow(row);
  }
}

let defaultStore: SavedRecipeStore | undefined;

export function getSavedRecipeStore(): SavedRecipeStore {
  defaultStore ??= new SavedRecipeStore(
    process.env.RECIPE_DATABASE_PATH ??
      join(process.cwd(), "data", "recipes.db"),
  );
  return defaultStore;
}
