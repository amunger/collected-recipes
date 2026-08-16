import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  SavedRecipeNotFoundError,
  SavedRecipeStore,
} from "@/lib/saved-recipe-store";
import {
  proteinWaffleNutrition,
  proteinWaffleResult,
} from "@/test/fixtures/protein-waffles";

describe("SavedRecipeStore", () => {
  let store: SavedRecipeStore;

  beforeEach(() => {
    store = new SavedRecipeStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  test("creates, lists, and reopens named recipe snapshots", () => {
    const created = store.create({
      name: " Protein waffles ",
      customNotes: " Serve with berries. ",
      nutrition: proteinWaffleNutrition,
      recipe: proteinWaffleResult,
      sourceUrl: "https://example.com/waffles",
    });

    expect(created.name).toBe("Protein waffles");
    expect(created.customNotes).toBe("Serve with berries.");
    expect(store.get(created.id)).toEqual(created);
    expect(store.list()).toEqual([created]);
  });

  test("allows duplicate names and updates by stable identifier", () => {
    const first = store.create({
      name: "Waffles",
      nutrition: proteinWaffleNutrition,
      recipe: proteinWaffleResult,
    });
    const second = store.create({
      name: "Waffles",
      nutrition: proteinWaffleNutrition,
      recipe: proteinWaffleResult,
    });
    const updated = store.update(first.id, {
      name: "Double waffles",
      nutrition: proteinWaffleNutrition,
      recipe: proteinWaffleResult,
      specialInstructions: "Double this.",
      customNotes: "Freeze the extras.",
    });

    expect(second.id).not.toBe(first.id);
    expect(updated).toMatchObject({
      id: first.id,
      name: "Double waffles",
      specialInstructions: "Double this.",
      customNotes: "Freeze the extras.",
    });
  });

  test("validates names and missing updates", () => {
    expect(() =>
      store.create({
        name: " ",
        nutrition: proteinWaffleNutrition,
        recipe: proteinWaffleResult,
      }),
    ).toThrow("name is required");
    expect(() =>
      store.update("missing", {
        name: "Recipe",
        nutrition: proteinWaffleNutrition,
        recipe: proteinWaffleResult,
      }),
    ).toThrow(SavedRecipeNotFoundError);
    expect(() =>
      store.create({
        customNotes: "x".repeat(10_001),
        name: "Recipe",
        nutrition: proteinWaffleNutrition,
        recipe: proteinWaffleResult,
      }),
    ).toThrow("10,000");
  });

  test("adds custom notes to existing recipe databases", () => {
    const directory = mkdtempSync(join(tmpdir(), "collected-recipes-"));
    const databasePath = join(directory, "recipes.db");
    const database = new Database(databasePath);
    database.exec(`
      CREATE TABLE saved_recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_url TEXT,
        special_instructions TEXT,
        recipe_json TEXT NOT NULL,
        nutrition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database
      .prepare(
        `INSERT INTO saved_recipes VALUES (
          @id, @name, NULL, NULL, @recipe, @nutrition, @createdAt, @updatedAt
        )`,
      )
      .run({
        createdAt: "2026-08-15T20:00:00.000Z",
        id: "existing",
        name: "Existing recipe",
        nutrition: JSON.stringify(proteinWaffleNutrition),
        recipe: JSON.stringify(proteinWaffleResult),
        updatedAt: "2026-08-15T20:00:00.000Z",
      });
    database.close();

    const migratedStore = new SavedRecipeStore(databasePath);
    try {
      expect(migratedStore.get("existing")?.customNotes).toBeNull();
    } finally {
      migratedStore.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
