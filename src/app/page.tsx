"use client";

import { Fragment, FormEvent, useEffect, useState } from "react";
import type { EnrichedRecipe } from "@/lib/enrich-recipe";
import { validateIngredientResult } from "@/lib/ingredient-result";
import {
  validateNutritionResult,
  type IngredientNutrition,
  type NutritionResult,
} from "@/lib/nutrition";
import {
  formatIngredient,
  formatRecipeMarkdown,
} from "@/lib/recipe-markdown";
import type { SavedRecipe } from "@/lib/saved-recipe-store";
import styles from "./page.module.css";

interface ApiError {
  readonly error?: string;
}

interface ExtractRecipeResponse extends Partial<EnrichedRecipe>, ApiError {}

interface SavedRecipeResponse extends ApiError {
  readonly recipe?: SavedRecipe;
}

interface SavedRecipeListResponse extends ApiError {
  readonly recipes?: ReadonlyArray<SavedRecipe>;
}

function recipeOperationError(
  response: Response,
  result: ApiError,
  fallback: string,
): Error {
  if (response.status === 429) {
    return new Error(
      result.error ??
        "Another recipe operation is in progress. Wait a moment, then try again.",
    );
  }

  return new Error(result.error ?? fallback);
}

interface RecentRecipe {
  readonly id: string;
  readonly recipe: EnrichedRecipe;
  readonly sourceUrl: string;
  readonly specialInstructions: string | null;
  readonly viewedAt: string;
}

type AppTab = "collect" | "saved" | "recipe";
type CollectSource = "link" | "images";
type EditableMacroField =
  | "carbohydratesGrams"
  | "proteinGrams"
  | "fatGrams";

const recentRecipesKey = "collected-recipes.recent";
const editableMacroLabels: Readonly<Record<EditableMacroField, string>> = {
  carbohydratesGrams: "Carbs",
  fatGrams: "Fat",
  proteinGrams: "Protein",
};

function parseRecentRecipe(value: unknown): RecentRecipe | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    typeof record.id !== "string" ||
    typeof record.sourceUrl !== "string" ||
    typeof record.viewedAt !== "string" ||
    (record.specialInstructions !== null &&
      typeof record.specialInstructions !== "string") ||
    typeof record.recipe !== "object" ||
    record.recipe === null ||
    Array.isArray(record.recipe)
  ) {
    return null;
  }

  try {
    const storedRecipe = record.recipe as Readonly<Record<string, unknown>>;
    let sourceUrl = "";
    if (record.sourceUrl) {
      const parsedSourceUrl = new URL(record.sourceUrl);
      if (!["http:", "https:"].includes(parsedSourceUrl.protocol)) {
        return null;
      }
      sourceUrl = parsedSourceUrl.href;
    }
    return {
      id: record.id,
      recipe: {
        ...validateIngredientResult(storedRecipe),
        nutrition: validateNutritionResult(storedRecipe.nutrition),
      },
      sourceUrl,
      specialInstructions: record.specialInstructions,
      viewedAt: record.viewedAt,
    };
  } catch {
    return null;
  }
}

function readRecentRecipes(): ReadonlyArray<RecentRecipe> {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(recentRecipesKey) ?? "[]",
    );
    return Array.isArray(value)
      ? value
          .map(parseRecentRecipe)
          .filter((item): item is RecentRecipe => item !== null)
          .slice(0, 3)
      : [];
  } catch {
    return [];
  }
}

function writeRecentRecipes(recipes: ReadonlyArray<RecentRecipe>): void {
  window.localStorage.setItem(recentRecipesKey, JSON.stringify(recipes));
}

function recentRecipeLabel(recipe: RecentRecipe): string {
  return recipe.sourceUrl
    ? new URL(recipe.sourceUrl).hostname.replace(/^www\./, "")
    : "Uploaded recipe";
}

function writeClipboardWithTimeout(value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Clipboard access timed out.")),
      1_000,
    );

    navigator.clipboard.writeText(value).then(
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function copyText(value: string): Promise<void> {
  let clipboardError: unknown;

  if (navigator.clipboard) {
    try {
      await writeClipboardWithTimeout(value);
      return;
    } catch (error: unknown) {
      clipboardError = error;
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();

  if (!copied) {
    throw new AggregateError(
      clipboardError === undefined ? [] : [clipboardError],
      "Browser clipboard access was denied.",
    );
  }
}

function formatMacro(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} g`;
}

function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

function updateNutritionAfterManualEdit(
  nutrition: NutritionResult,
  ingredientIndex: number,
  field: EditableMacroField,
  value: number | null,
): NutritionResult {
  const ingredients = nutrition.ingredients.map((ingredient, index) =>
    index === ingredientIndex
      ? { ...ingredient, [field]: value }
      : ingredient,
  );
  const includedIngredientCount = ingredients.filter(
    (ingredient) =>
      ingredient.carbohydratesGrams !== null &&
      ingredient.proteinGrams !== null &&
      ingredient.fatGrams !== null,
  ).length;
  const omittedIngredientCount = ingredients.length - includedIngredientCount;
  const status =
    includedIngredientCount === ingredients.length
      ? "complete"
      : includedIngredientCount > 0
        ? "partial"
        : "unavailable";

  return {
    ...nutrition,
    ingredients,
    message:
      omittedIngredientCount === 0
        ? null
        : nutrition.message ?? "Some ingredients are still missing macro values.",
    status,
    totals: {
      carbohydratesGrams: roundMacro(
        ingredients.reduce(
          (total, ingredient) => total + (ingredient.carbohydratesGrams ?? 0),
          0,
        ),
      ),
      fatGrams: roundMacro(
        ingredients.reduce(
          (total, ingredient) => total + (ingredient.fatGrams ?? 0),
          0,
        ),
      ),
      includedIngredientCount,
      omittedIngredientCount,
      proteinGrams: roundMacro(
        ingredients.reduce(
          (total, ingredient) => total + (ingredient.proteinGrams ?? 0),
          0,
        ),
      ),
    },
  };
}

interface MacroEditState {
  readonly draftValue: string;
  readonly field: EditableMacroField;
  readonly ingredientIndex: number;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("collect");
  const [collectSource, setCollectSource] =
    useState<CollectSource>("link");
  const [url, setUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [collectPrompt, setCollectPrompt] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [recipeImages, setRecipeImages] = useState<ReadonlyArray<File>>([]);
  const [appliedSpecialInstructions, setAppliedSpecialInstructions] =
    useState<string | null>(null);
  const [recipe, setRecipe] = useState<EnrichedRecipe | null>(null);
  const [savedRecipes, setSavedRecipes] = useState<
    ReadonlyArray<SavedRecipe>
  >([]);
  const [recentRecipes, setRecentRecipes] = useState<
    ReadonlyArray<RecentRecipe>
  >([]);
  const [activeRecentRecipeId, setActiveRecentRecipeId] = useState<
    string | null
  >(null);
  const [selectedSavedRecipeId, setSelectedSavedRecipeId] = useState<
    string | null
  >(null);
  const [saveName, setSaveName] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState("");
  const [error, setError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [macroEdit, setMacroEdit] = useState<MacroEditState | null>(
    null,
  );

  async function fetchSavedRecipes(): Promise<
    ReadonlyArray<SavedRecipe>
  > {
    const response = await fetch("/api/recipes");
    const result = (await response.json()) as SavedRecipeListResponse;
    if (!response.ok || !result.recipes) {
      throw new Error(
        result.error ?? "Saved recipes could not be loaded.",
      );
    }
    return result.recipes;
  }

  async function loadSavedRecipes(): Promise<void> {
    try {
      setSavedRecipes(await fetchSavedRecipes());
      setLibraryError("");
    } catch (caughtError: unknown) {
      setLibraryError(
        caughtError instanceof Error
          ? caughtError.message
          : "Saved recipes could not be loaded.",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setRecentRecipes(readRecentRecipes());
      }
    });
    fetchSavedRecipes().then(
      (recipes) => {
        if (!cancelled) {
          setSavedRecipes(recipes);
          setLibraryError("");
        }
      },
      (caughtError: unknown) => {
        if (!cancelled) {
          setLibraryError(
            caughtError instanceof Error
              ? caughtError.message
              : "Saved recipes could not be loaded.",
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function parseRecipeResponse(
    result: ExtractRecipeResponse,
  ): EnrichedRecipe {
    if (!result.ingredients || !result.instructions || !result.nutrition) {
      throw new Error(
        result.error ?? "The recipe could not be generated.",
      );
    }
    return {
      ingredients: result.ingredients,
      instructions: result.instructions,
      name: result.name ?? null,
      servings: result.servings ?? null,
      nutrition: result.nutrition,
    };
  }

  function rememberRecentRecipe(recent: RecentRecipe): void {
    setRecentRecipes((current) => {
      const next = [
        recent,
        ...current.filter((item) => item.id !== recent.id),
      ].slice(0, 3);
      writeRecentRecipes(next);
      return next;
    });
  }

  function canReplaceActiveRecipe(): boolean {
    return (
      !recipe ||
      (!hasUnsavedChanges &&
        (!isEditingNotes || notesDraft === customNotes)) ||
      window.confirm(
        "Replace the active recipe and lose its unsaved changes?",
      )
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReplaceActiveRecipe()) {
      return;
    }
    const submittedSourceUrl = url.trim();
    setError("");
    setIsLoading(true);
    setRecipeImages([]);

    try {
      const response = await fetch("/api/recipes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          specialInstructions: collectPrompt.trim() || undefined,
        }),
      });
      const result = (await response.json()) as ExtractRecipeResponse;
      if (!response.ok) {
        throw recipeOperationError(
          response,
          result,
          "The recipe could not be generated.",
        );
      }

      const appliedInstructions = collectPrompt.trim() || null;
      const extractedRecipe = parseRecipeResponse(result);
      setRecipe(extractedRecipe);
      setSelectedSavedRecipeId(null);
      setSaveName(extractedRecipe.name ?? "");
      setSourceUrl(submittedSourceUrl);
      setCustomNotes("");
      setNotesDraft("");
      setIsEditingNotes(false);
      setSpecialInstructions("");
      setHasUnsavedChanges(true);
      setSaveFeedback("");
      window.requestAnimationFrame(() => {
        const heading = document.getElementById("active-recipe-heading");
        heading?.focus();
        heading?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      setAppliedSpecialInstructions(appliedInstructions);
      const recent = {
        id: crypto.randomUUID(),
        recipe: extractedRecipe,
        sourceUrl: submittedSourceUrl,
        specialInstructions: appliedInstructions,
        viewedAt: new Date().toISOString(),
      };
      setActiveRecentRecipeId(recent.id);
      rememberRecentRecipe(recent);
      setActiveTab("recipe");
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The recipe could not be generated.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleImageSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!canReplaceActiveRecipe()) {
      return;
    }
    if (recipeImages.length < 1 || recipeImages.length > 2) {
      setError("Choose one or two recipe images.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const formData = new FormData();
      for (const image of recipeImages) {
        formData.append("images", image);
      }
      if (collectPrompt.trim()) {
        formData.append(
          "specialInstructions",
          collectPrompt.trim(),
        );
      }
      const response = await fetch("/api/recipes/extract-images", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as ExtractRecipeResponse;
      if (!response.ok) {
        throw recipeOperationError(
          response,
          result,
          "The recipe could not be read from the images.",
        );
      }

      const appliedInstructions = collectPrompt.trim() || null;
      const extractedRecipe = parseRecipeResponse(result);
      setRecipe(extractedRecipe);
      setSelectedSavedRecipeId(null);
      setSaveName(extractedRecipe.name ?? "");
      setUrl("");
      setSourceUrl("");
      setCustomNotes("");
      setNotesDraft("");
      setIsEditingNotes(false);
      setSpecialInstructions("");
      setHasUnsavedChanges(true);
      setSaveFeedback("");
      setAppliedSpecialInstructions(appliedInstructions);
      const recent = {
        id: crypto.randomUUID(),
        recipe: extractedRecipe,
        sourceUrl: "",
        specialInstructions: appliedInstructions,
        viewedAt: new Date().toISOString(),
      };
      setActiveRecentRecipeId(recent.id);
      rememberRecentRecipe(recent);
      setActiveTab("recipe");
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The recipe could not be read from the images.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function openSavedRecipe(saved: SavedRecipe): void {
    if (!canReplaceActiveRecipe()) {
      return;
    }
    setRecipe({
      ...saved.recipe,
      nutrition: saved.nutrition,
    });
    setSelectedSavedRecipeId(saved.id);
    setActiveRecentRecipeId(null);
    setHasUnsavedChanges(false);
    setSaveFeedback("");
    setSaveName(saved.name);
    setCustomNotes(saved.customNotes ?? "");
    setNotesDraft(saved.customNotes ?? "");
    setIsEditingNotes(false);
    setUrl(saved.sourceUrl ?? "");
    setSourceUrl(saved.sourceUrl ?? "");
    setAppliedSpecialInstructions(saved.specialInstructions);
    setSpecialInstructions("");
    setError("");
    setActiveTab("recipe");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openRecentRecipe(recent: RecentRecipe): void {
    if (!canReplaceActiveRecipe()) {
      return;
    }
    setRecipe(recent.recipe);
    setSelectedSavedRecipeId(null);
    setActiveRecentRecipeId(recent.id);
    setHasUnsavedChanges(true);
    setSaveFeedback("");
    setSaveName(recent.recipe.name ?? "");
    setCustomNotes("");
    setNotesDraft("");
    setIsEditingNotes(false);
    setUrl(recent.sourceUrl);
    setSourceUrl(recent.sourceUrl);
    setAppliedSpecialInstructions(recent.specialInstructions);
    setSpecialInstructions("");
    setError("");
    setActiveTab("recipe");
    rememberRecentRecipe({ ...recent, viewedAt: new Date().toISOString() });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function transformActiveRecipe(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!recipe) {
      return;
    }
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/recipes/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: {
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            name: recipe.name ?? null,
            servings: recipe.servings ?? null,
          },
          specialInstructions,
        }),
      });
      const result = (await response.json()) as ExtractRecipeResponse;
      if (!response.ok) {
        throw recipeOperationError(
          response,
          result,
          "The recipe could not be transformed.",
        );
      }
      const transformedRecipe = parseRecipeResponse(result);
      const appliedInstructions = specialInstructions.trim();
      setRecipe(transformedRecipe);
      setAppliedSpecialInstructions(appliedInstructions);
      setSpecialInstructions("");
      setHasUnsavedChanges(true);
      setSaveFeedback("");
      window.requestAnimationFrame(() => {
        const heading = document.getElementById("active-recipe-heading");
        heading?.focus();
        heading?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The recipe could not be transformed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function saveRecipe(
    mode: "save" | "save-as",
  ): Promise<void> {
    if (!recipe) {
      return;
    }
    setError("");
    setIsSaving(true);

    try {
      const updateExisting =
        mode === "save" && selectedSavedRecipeId !== null;
      const endpoint = updateExisting
        ? `/api/recipes/${selectedSavedRecipeId}`
        : "/api/recipes";
      const response = await fetch(endpoint, {
        method: updateExisting ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customNotes,
          name: saveName,
          nutrition: recipe.nutrition,
          recipe: {
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            name: recipe.name ?? null,
            servings: recipe.servings ?? null,
          },
          sourceUrl: sourceUrl || null,
          specialInstructions: appliedSpecialInstructions,
        }),
      });
      const result = (await response.json()) as SavedRecipeResponse;
      if (!response.ok || !result.recipe) {
        throw new Error(result.error ?? "The recipe could not be saved.");
      }

      setSelectedSavedRecipeId(result.recipe.id);
      setHasUnsavedChanges(false);
      setSaveName(result.recipe.name);
      setCustomNotes(result.recipe.customNotes ?? "");
      setNotesDraft(result.recipe.customNotes ?? "");
      setIsEditingNotes(false);
      setSaveFeedback(
        mode === "save-as"
          ? "Saved as a new recipe."
          : "Recipe saved.",
      );
      if (activeRecentRecipeId) {
        setRecentRecipes((current) => {
          const next = current.filter(
            (item) => item.id !== activeRecentRecipeId,
          );
          writeRecentRecipes(next);
          return next;
        });
        setActiveRecentRecipeId(null);
      }
      await loadSavedRecipes();
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The recipe could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function formatRecipe(): string {
    if (!recipe) {
      return "";
    }
    const markdown = formatRecipeMarkdown(recipe);
    return customNotes.trim()
      ? `${markdown}\n\n## Notes\n\n${customNotes.trim()}`
      : markdown;
  }

  async function copyRecipe() {
    try {
      await copyText(formatRecipe());
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1_500);
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? `Could not copy the recipe: ${caughtError.message}`
          : "Could not copy the recipe.",
      );
    }
  }

  function downloadRecipe() {
    const blob = new Blob([formatRecipe()], {
      type: "text/markdown;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "recipe.md";
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  function startMacroEdit(
    ingredientIndex: number,
    field: EditableMacroField,
    currentValue: number | null,
  ): void {
    setError("");
    setMacroEdit({
      draftValue: currentValue === null ? "" : currentValue.toString(),
      field,
      ingredientIndex,
    });
  }

  function saveMacroEdit(): void {
    if (!recipe || !macroEdit) {
      return;
    }

    const { draftValue, field, ingredientIndex } = macroEdit;
    setMacroEdit(null);
    const trimmedValue = draftValue.trim();
    const parsedValue = trimmedValue === "" ? null : Number(trimmedValue);
    if (
      trimmedValue !== "" &&
      (typeof parsedValue !== "number" ||
        !Number.isFinite(parsedValue) ||
        parsedValue < 0)
    ) {
      setError(`${editableMacroLabels[field]} must be a non-negative number.`);
      return;
    }

    const normalizedValue =
      parsedValue === null ? null : roundMacro(parsedValue);
    const previousValue =
      recipe.nutrition.ingredients[ingredientIndex]?.[field];
    if (previousValue === normalizedValue) {
      return;
    }

    setRecipe((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        nutrition: updateNutritionAfterManualEdit(
          current.nutrition,
          ingredientIndex,
          field,
          normalizedValue,
        ),
      };
    });
    setHasUnsavedChanges(true);
    setSaveFeedback("");
  }

  function renderMacroCell(
    ingredient: IngredientNutrition,
    ingredientIndex: number,
    field: EditableMacroField,
  ) {
    const isEditing =
      macroEdit?.ingredientIndex === ingredientIndex &&
      macroEdit.field === field;
    if (isEditing) {
      return (
        <input
          aria-label={`${editableMacroLabels[field]} for ${ingredient.ingredient}`}
          autoFocus
          className={styles.macroValueInput}
          inputMode="decimal"
          onBlur={saveMacroEdit}
          onChange={(event) => {
            setMacroEdit((current) =>
              current
                ? { ...current, draftValue: event.target.value }
                : current,
            );
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setMacroEdit(null);
            } else if (event.key === "Enter") {
              event.preventDefault();
              saveMacroEdit();
            }
          }}
          type="text"
          value={macroEdit.draftValue}
        />
      );
    }
    return (
      <button
        type="button"
        className={styles.macroValueButton}
        onClick={() =>
          startMacroEdit(ingredientIndex, field, ingredient[field])
        }
      >
        {formatMacro(ingredient[field])}
      </button>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.appHeader}>
        <span className={styles.eyebrow}>Collected recipes</span>
        <h1>Your recipes, without the clutter.</h1>
        <p>Collect a recipe, refine it, and save the version you want to keep.</p>
      </header>

      <nav className={styles.tabs} aria-label="Recipe workspace">
        <button
          type="button"
          aria-current={activeTab === "collect" ? "page" : undefined}
          className={activeTab === "collect" ? styles.activeTab : undefined}
          onClick={() => {
            setActiveTab("collect");
            setError("");
          }}
        >
          Collect
        </button>
        <button
          type="button"
          aria-current={activeTab === "saved" ? "page" : undefined}
          className={activeTab === "saved" ? styles.activeTab : undefined}
          onClick={() => {
            setActiveTab("saved");
            setError("");
          }}
        >
          Saved
          {savedRecipes.length > 0 && <span>{savedRecipes.length}</span>}
        </button>
        <button
          type="button"
          aria-current={activeTab === "recipe" ? "page" : undefined}
          className={activeTab === "recipe" ? styles.activeTab : undefined}
          disabled={!recipe}
          onClick={() => {
            setActiveTab("recipe");
            setError("");
          }}
        >
          Recipe
          {recipe && hasUnsavedChanges && (
            <span className={styles.unsavedDot} aria-label="Unsaved changes" />
          )}
        </button>
      </nav>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {activeTab === "collect" && (
        <section className={styles.tabPanel}>
          <div className={styles.pageHeading}>
            <span className={styles.eyebrow}>Add a recipe</span>
            <h2>Start with a link or photos</h2>
            <p>
              Choose one source, then optionally tell Copilot how you want the
              recipe adapted.
            </p>
          </div>

          <div className={styles.sourcePicker} aria-label="Recipe source">
            <button
              type="button"
              className={
                collectSource === "link" ? styles.activeSource : undefined
              }
              onClick={() => {
                setCollectSource("link");
                setError("");
              }}
            >
              Recipe link
            </button>
            <button
              type="button"
              className={
                collectSource === "images" ? styles.activeSource : undefined
              }
              onClick={() => {
                setCollectSource("images");
                setError("");
              }}
            >
              Recipe photos
            </button>
          </div>

          <form
            className={styles.collectForm}
            onSubmit={
              collectSource === "link" ? handleSubmit : handleImageSubmit
            }
          >
            {collectSource === "link" ? (
              <>
                <label htmlFor="recipe-url">Recipe URL</label>
                <input
                  id="recipe-url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://example.com/recipe"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  disabled={isLoading}
                  required
                />
              </>
            ) : (
              <>
                <label htmlFor="recipe-images">
                  Recipe photos <span>(1 or 2 images)</span>
                </label>
                <div className={styles.fileDrop}>
                  <input
                    id="recipe-images"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    disabled={isLoading}
                    onChange={(event) => {
                      const images = Array.from(event.target.files ?? []);
                      if (images.length > 2) {
                        event.target.value = "";
                        setRecipeImages([]);
                        setError("Choose no more than two recipe images.");
                        return;
                      }
                      setRecipeImages(images);
                      setError("");
                    }}
                  />
                  <p>Clear, straight-on photos work best. Maximum 8 MB each.</p>
                  {recipeImages.length > 0 && (
                    <strong>
                      {recipeImages
                        .map((image, index) => `${index + 1}. ${image.name}`)
                        .join(" · ")}
                    </strong>
                  )}
                </div>
              </>
            )}

            <label htmlFor="collect-prompt">
              Adaptation request <span>(optional)</span>
            </label>
            <textarea
              id="collect-prompt"
              placeholder="Double it, make it dairy free, or leave blank to preserve the original."
              value={collectPrompt}
              onChange={(event) => setCollectPrompt(event.target.value)}
              disabled={isLoading}
              maxLength={2_000}
              rows={3}
            />
            <button
              type="submit"
              disabled={
                isLoading ||
                (collectSource === "images" && recipeImages.length === 0)
              }
            >
              {isLoading ? "Collecting recipe..." : "Collect recipe"}
            </button>
          </form>

          {recentRecipes.length > 0 && (
            <section className={styles.recentSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.eyebrow}>Recent</span>
                  <h2>Unsaved recipes</h2>
                </div>
                <p>Kept in this browser until you save them.</p>
              </div>
              <div className={styles.savedRecipeGrid}>
                {recentRecipes.map((recent) => (
                  <button
                    type="button"
                    key={recent.id}
                    onClick={() => openRecentRecipe(recent)}
                  >
                    <strong>{recentRecipeLabel(recent)}</strong>
                    <span>
                      Viewed {new Date(recent.viewedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </section>
      )}

      {activeTab === "saved" && (
        <section className={styles.tabPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>Your collection</span>
              <h2>Saved recipes</h2>
            </div>
            <button type="button" onClick={() => void loadSavedRecipes()}>
              Refresh
            </button>
          </div>
          {libraryError && (
            <p className={styles.error} role="alert">
              {libraryError}
            </p>
          )}
          {savedRecipes.length === 0 && !libraryError ? (
            <div className={styles.emptyState}>
              <h3>No saved recipes yet</h3>
              <p>Collect a recipe, then save it from the Recipe tab.</p>
              <button type="button" onClick={() => setActiveTab("collect")}>
                Collect your first recipe
              </button>
            </div>
          ) : (
            <div className={styles.savedRecipeList}>
              {savedRecipes.map((saved) => (
                <button
                  type="button"
                  key={saved.id}
                  onClick={() => openSavedRecipe(saved)}
                  className={
                    saved.id === selectedSavedRecipeId
                      ? styles.selectedRecipe
                      : undefined
                  }
                >
                  <span>
                    <strong>{saved.name}</strong>
                    {saved.sourceUrl && (
                      <small>{new URL(saved.sourceUrl).hostname}</small>
                    )}
                  </span>
                  <span>
                    Updated {new Date(saved.updatedAt).toLocaleDateString()} →
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "recipe" && recipe && (
        <section className={styles.recipeWorkspace}>
          <div className={styles.saveBar}>
            <div>
              <label htmlFor="save-name">Recipe name</label>
              <input
                id="save-name"
                type="text"
                value={saveName}
                onChange={(event) => {
                  setSaveName(event.target.value);
                  setHasUnsavedChanges(true);
                  setSaveFeedback("");
                }}
                maxLength={120}
                placeholder="Name this recipe"
                required
              />
            </div>
            <div className={styles.saveActions}>
              <button
                type="button"
                disabled={
                  isSaving ||
                  isEditingNotes ||
                  !saveName.trim() ||
                  (selectedSavedRecipeId !== null && !hasUnsavedChanges)
                }
                onClick={() => void saveRecipe("save")}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={
                  isSaving ||
                  isEditingNotes ||
                  !saveName.trim() ||
                  !selectedSavedRecipeId
                }
                title={
                  selectedSavedRecipeId
                    ? "Create a separate copy"
                    : "Save this recipe before creating a copy"
                }
                onClick={() => void saveRecipe("save-as")}
              >
                Save as
              </button>
            </div>
            <p
              className={
                hasUnsavedChanges ? styles.unsavedStatus : styles.savedStatus
              }
              role="status"
            >
              {isSaving
                ? "Saving..."
                : saveFeedback ||
                  (hasUnsavedChanges ? "Unsaved changes" : "Up to date")}
            </p>
          </div>

          <section
            id="active-recipe"
            className={styles.result}
            aria-live="polite"
          >
            <div className={styles.resultHeader}>
              <div>
                <span className={styles.eyebrow}>Active recipe</span>
                <h2 id="active-recipe-heading" tabIndex={-1}>
                  {saveName || "Untitled recipe"}
                </h2>
                {recipe.servings !== null && recipe.servings !== undefined && (
                  <p>Servings: {recipe.servings}</p>
                )}
                {sourceUrl && (
                  <p>
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View original recipe
                    </a>
                  </p>
                )}
                {appliedSpecialInstructions && (
                  <p>Last adapted: {appliedSpecialInstructions}</p>
                )}
              </div>
              <div className={styles.actions}>
                <button type="button" onClick={copyRecipe}>
                  {copyLabel}
                </button>
                <button type="button" onClick={downloadRecipe}>
                  Download
                </button>
              </div>
            </div>
            <div className={styles.recipeContent}>
              <section>
                <h3>Ingredients</h3>
                <ul className={styles.ingredientLines}>
                  {recipe.ingredients.map((item, index) => (
                    <Fragment key={`${item.ingredient}-${index}`}>
                      {item.group &&
                        item.group !==
                          (recipe.ingredients[index - 1]?.group ?? null) && (
                          <li className={styles.ingredientGroup}>
                            {item.group}
                          </li>
                        )}
                      <li>{formatIngredient(item)}</li>
                    </Fragment>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Instructions</h3>
                <ol className={styles.instructionList}>
                  {recipe.instructions.map((instruction, index) => (
                    <li key={`${index}-${instruction}`}>{instruction}</li>
                  ))}
                </ol>
              </section>
            </div>
          </section>

          <section className={styles.modifyPanel}>
            <div>
              <span className={styles.eyebrow}>Refine with Copilot</span>
              <h2>Modify this recipe</h2>
              <p>
                Changes stay in this workspace until you choose Save or Save
                as.
              </p>
            </div>
            <form onSubmit={transformActiveRecipe}>
              <label htmlFor="recipe-modification">What should change?</label>
              <textarea
                id="recipe-modification"
                value={specialInstructions}
                onChange={(event) =>
                  setSpecialInstructions(event.target.value)
                }
                placeholder="Make it vegetarian, halve it, or replace the dairy."
                maxLength={2_000}
                rows={3}
                required
              />
              <button type="submit" disabled={isLoading || isSaving}>
                {isLoading ? "Applying change..." : "Apply change"}
              </button>
            </form>
          </section>

          <details className={styles.disclosure}>
            <summary>
              <strong>Notes</strong>
            </summary>
            <div className={styles.disclosureContent}>
              {isEditingNotes ? (
                <>
                  <label htmlFor="custom-notes">Notes</label>
                  <textarea
                    id="custom-notes"
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    placeholder="Great with fresh berries."
                    maxLength={10_000}
                    rows={6}
                  />
                  <div className={styles.noteActions}>
                    <button
                      type="button"
                      onClick={() => {
                        if (notesDraft !== customNotes) {
                          setCustomNotes(notesDraft);
                          setHasUnsavedChanges(true);
                          setSaveFeedback("");
                        }
                        setIsEditingNotes(false);
                      }}
                    >
                      Save notes
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setNotesDraft(customNotes);
                        setIsEditingNotes(false);
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.noteText}>
                    {customNotes.trim() || "No notes yet."}
                  </p>
                  <button
                    type="button"
                    className={styles.editNotesButton}
                    onClick={() => {
                      setNotesDraft(customNotes);
                      setIsEditingNotes(true);
                    }}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </details>

          <details className={styles.disclosure}>
            <summary>
              <strong>Nutrition info</strong>
            </summary>
            <div className={styles.disclosureContent}>
              <div className={styles.tableScroller}>
                <table className={styles.nutritionTable}>
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th>Weight</th>
                      <th>Carbs</th>
                      <th>Protein</th>
                      <th>Fat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipe.nutrition.ingredients.map((item, index) => (
                      <tr key={`${item.ingredient}-${index}`}>
                        <td>
                          {item.description}
                          {item.status !== "matched" && (
                            <small>{item.status.replace("-", " ")}</small>
                          )}
                        </td>
                        <td>
                          {item.estimatedGrams === null
                            ? "—"
                            : `${item.estimatedGrams} g`}
                        </td>
                        <td>
                          {renderMacroCell(
                            item,
                            index,
                            "carbohydratesGrams",
                          )}
                        </td>
                        <td>{renderMacroCell(item, index, "proteinGrams")}</td>
                        <td>{renderMacroCell(item, index, "fatGrams")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <td>
                        {recipe.nutrition.totals.includedIngredientCount} of{" "}
                        {recipe.nutrition.ingredients.length} included
                      </td>
                      <td>
                        {formatMacro(
                          recipe.nutrition.totals.carbohydratesGrams,
                        )}
                      </td>
                      <td>
                        {formatMacro(recipe.nutrition.totals.proteinGrams)}
                      </td>
                      <td>
                        {formatMacro(recipe.nutrition.totals.fatGrams)}
                      </td>
                    </tr>
                    {recipe.servings && recipe.servings > 0 && (
                      <tr>
                        <th>Per serving</th>
                        <td>{recipe.servings} servings</td>
                        <td>
                          {formatMacro(
                            recipe.nutrition.totals.carbohydratesGrams /
                              recipe.servings,
                          )}
                        </td>
                        <td>
                          {formatMacro(
                            recipe.nutrition.totals.proteinGrams /
                              recipe.servings,
                          )}
                        </td>
                        <td>
                          {formatMacro(
                            recipe.nutrition.totals.fatGrams /
                              recipe.servings,
                          )}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
              {recipe.nutrition.message && (
                <p className={styles.nutritionNote}>
                  {recipe.nutrition.message}
                </p>
              )}
            </div>
          </details>
        </section>
      )}
    </main>
  );
}
