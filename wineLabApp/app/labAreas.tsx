"use client";

import {
  ArrowLeft,
  BookOpen,
  Check,
  ChefHat,
  Clock3,
  FlaskConical,
  ImagePlus,
  LoaderCircle,
  Plus,
  ScanBarcode,
  Search,
  Sprout,
  Trash2,
  Users,
  Wine,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { PickleBatchDetail } from "./pickleTastings";

export type RecipeIngredient = {
  id: string;
  ingredientId: string;
  name: string;
  category: string | null;
  section: string | null;
  quantityValue: number | null;
  quantityText: string | null;
  unit: string | null;
  preparation: string | null;
  rawText: string | null;
  optional: boolean;
  sequence: number;
};

export type RecipeStep = {
  id: string;
  section: string | null;
  instruction: string;
  sequence: number;
  timerMinutes: number | null;
};

export type RecipeRecord = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  sourceUrl: string | null;
  photoPath: string | null;
  photoUrl?: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  category: string | null;
  tags: string[];
  status: string;
  createdByPersonId: number;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

export type PickleBatchRecord = {
  id: string;
  batchCode: string;
  fermentationType: string;
  preparedAt: string | null;
  recordStatus: string;
  analysisEligibility: string;
  recipePayload: Record<string, unknown>;
  processPayload: Record<string, unknown>;
  createdAt: string;
  experiment: {
    id: string;
    title: string;
    researchQuestion: string | null;
    hypothesis: string | null;
    purpose: string;
    status: string;
  } | null;
  ingredients: Array<{
    id: string;
    name: string;
    role: string;
    quantityValue: number | null;
    quantityUnit: string | null;
    rawText: string | null;
  }>;
  latestState: {
    id: string;
    stateCode: string;
    observedAt: string | null;
    fermentationDay: number | null;
    storageStage: string | null;
    ph: number | null;
    temperatureC: number | null;
    visualActivity: string | null;
    aroma: string | null;
    texture: string | null;
    brineAppearance: string | null;
    checkpointPayload: Record<string, unknown>;
  } | null;
  tastingCount: number;
};

type IngredientDraft = {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  preparation: string;
  role: string;
  optional: boolean;
};

type StepDraft = {
  key: string;
  instruction: string;
  timerMinutes: string;
};

function draftKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function blankIngredient(role = "other"): IngredientDraft {
  return {
    key: draftKey(),
    name: "",
    quantity: "",
    unit: "",
    preparation: "",
    role,
    optional: false,
  };
}

function blankStep(): StepDraft {
  return { key: draftKey(), instruction: "", timerMinutes: "" };
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateLabel(value: string | null): string {
  if (!value) return "Date not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function methodLabel(value: string): string {
  return {
    lacto_fermented: "Lacto-fermented",
    vinegar_quick: "Quick vinegar",
    refrigerator: "Refrigerator pickle",
    hybrid: "Hybrid method",
  }[value] ?? value.replaceAll("_", " ");
}

function ingredientAmount(ingredient: RecipeIngredient): string {
  const amount = ingredient.quantityText ?? ingredient.quantityValue?.toString() ?? "";
  return [amount, ingredient.unit].filter(Boolean).join(" ");
}

export function LabHome({
  name,
  wineCount,
  reviewCount,
  pickleBatches,
  recipes,
  onWine,
  onPickles,
  onRecipes,
}: {
  name: string;
  wineCount: number;
  reviewCount: number;
  pickleBatches: number;
  recipes: number;
  onWine: () => void;
  onPickles: () => void;
  onRecipes: () => void;
}) {
  return (
    <div className="page lab-home-page">
      <section className="lab-home-hero">
        <div>
          <p className="eyebrow">Household research collective</p>
          <h1>Welcome home, {name}</h1>
          <p className="lab-home-intro">
            One private laboratory for the bottles, batches, and meals that make
            this household increasingly itself.
          </p>
        </div>
        <div className="home-orbit" aria-hidden="true">
          <span className="orbit-core"><FlaskConical /></span>
          <span className="home-orbit-ring ring-one" />
          <span className="home-orbit-ring ring-two" />
          <span className="orbit-dot dot-wine"><Wine /></span>
          <span className="orbit-dot dot-pickle"><Sprout /></span>
          <span className="orbit-dot dot-kitchen"><ChefHat /></span>
        </div>
      </section>

      <section className="lab-module-grid" aria-label="Apartment Lab areas">
        <button className="lab-module-card wine-module" type="button" onClick={onWine}>
          <span className="module-index">001</span>
          <span className="module-icon"><Wine /></span>
          <span className="module-copy">
            <small>Active instrument</small>
            <strong>Wine Lab</strong>
            <span>{wineCount} wines · {reviewCount} reviews</span>
          </span>
        </button>

        <button className="lab-module-card pickle-module" type="button" onClick={onPickles}>
          <span className="module-index">002</span>
          <span className="module-icon"><Sprout /></span>
          <span className="module-copy">
            <small>Branching experiment space</small>
            <strong>Pickle Lab</strong>
            <span>{pickleBatches} {pickleBatches === 1 ? "batch" : "batches"} mapped</span>
          </span>
        </button>

        <button className="lab-module-card kitchen-module" type="button" onClick={onRecipes}>
          <span className="module-index">003</span>
          <span className="module-icon"><ChefHat /></span>
          <span className="module-copy">
            <small>Our actual household menu</small>
            <strong>Recipe Book</strong>
            <span>{recipes} {recipes === 1 ? "recipe" : "recipes"} ready to cook</span>
          </span>
        </button>

        <div className="lab-module-card inventory-module" aria-label="Inventory planned">
          <span className="module-index">004</span>
          <span className="module-icon"><ScanBarcode /></span>
          <span className="module-copy">
            <small>Architecture reserved</small>
            <strong>Household Inventory</strong>
            <span>Barcode intake comes after the ingredient vocabulary</span>
          </span>
        </div>
      </section>
    </div>
  );
}

export function RecipeLibrary({
  recipes,
  onNew,
  onOpen,
}: {
  recipes: RecipeRecord[];
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(
    () => Array.from(new Set(recipes.map((recipe) => recipe.category).filter(Boolean) as string[])).sort(),
    [recipes],
  );
  const filtered = recipes.filter((recipe) => {
    const haystack = [
      recipe.title,
      recipe.subtitle,
      recipe.description,
      recipe.category,
      ...recipe.tags,
      ...recipe.ingredients.map((ingredient) => ingredient.name),
    ].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase()) && (category === "all" || recipe.category === category);
  });

  return (
    <div className="page inner-page recipe-library-page">
      <div className="page-heading area-heading">
        <div>
          <p className="eyebrow kitchen-eyebrow">Household instrument · 003</p>
          <h1>The menu</h1>
          <p>The meals we actually make, preserved well enough to make again.</p>
        </div>
        <button className="primary-button kitchen-button" type="button" onClick={onNew}>
          <Plus /> Add a recipe
        </button>
      </div>

      <div className="library-controls">
        <label className="search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Search recipes</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search meals or ingredients"
          />
        </label>
        <label className="compact-select">
          <span className="sr-only">Filter by category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      {recipes.length === 0 ? (
        <section className="area-empty-state kitchen-empty">
          <span className="empty-instrument"><ChefHat /></span>
          <p className="eyebrow">A menu waiting to happen</p>
          <h2>What should always be cookable again?</h2>
          <p>
            Add the first meal with its real ingredients and steps. Photos are optional,
            but they turn this into the beautiful little household menu you showed me.
          </p>
          <button className="primary-button kitchen-button" type="button" onClick={onNew}>
            <Plus /> Add the first recipe
          </button>
        </section>
      ) : filtered.length === 0 ? (
        <p className="no-results">No meals match that search.</p>
      ) : (
        <div className="recipe-grid">
          {filtered.map((recipe) => (
            <button className="recipe-card" type="button" key={recipe.id} onClick={() => onOpen(recipe.id)}>
              <span className="recipe-photo-frame">
                {recipe.photoUrl ? (
                  <img src={recipe.photoUrl} alt="" />
                ) : (
                  <span className="recipe-monogram" aria-hidden="true">{recipe.title.slice(0, 1)}</span>
                )}
                {recipe.category ? <span className="recipe-category">{recipe.category}</span> : null}
              </span>
              <span className="recipe-card-copy">
                <strong>{recipe.title}</strong>
                {recipe.subtitle ? <span>{recipe.subtitle}</span> : null}
                <small>
                  {recipe.ingredients.length} ingredients
                  {recipe.prepMinutes || recipe.cookMinutes
                    ? ` · ${(recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)} min`
                    : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecipeDetail({ recipe, onBack }: { recipe: RecipeRecord; onBack: () => void }) {
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  return (
    <div className="page inner-page recipe-detail-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft /> Back to the menu
      </button>
      <section className="recipe-detail-hero">
        <div className="recipe-detail-image">
          {recipe.photoUrl ? <img src={recipe.photoUrl} alt={recipe.title} /> : <ChefHat aria-hidden="true" />}
        </div>
        <div className="recipe-detail-copy">
          <p className="eyebrow kitchen-eyebrow">{recipe.category ?? "Household recipe"}</p>
          <h1>{recipe.title}</h1>
          {recipe.subtitle ? <p className="recipe-subtitle">{recipe.subtitle}</p> : null}
          {recipe.description ? <p>{recipe.description}</p> : null}
          <div className="recipe-meta-row">
            {recipe.servings ? <span><Users /> Serves {recipe.servings}</span> : null}
            {totalMinutes ? <span><Clock3 /> {totalMinutes} minutes</span> : null}
            <span><BookOpen /> {recipe.steps.length} steps</span>
          </div>
          {recipe.tags.length ? (
            <div className="tag-row">{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          ) : null}
        </div>
      </section>

      <div className="recipe-detail-grid">
        <section className="recipe-ingredients-panel">
          <p className="eyebrow">Ingredients</p>
          <h2>What goes in</h2>
          <ul>
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id}>
                <span className="ingredient-amount">{ingredientAmount(ingredient)}</span>
                <span>
                  <strong>{ingredient.name}</strong>
                  {ingredient.preparation ? <small>{ingredient.preparation}</small> : null}
                  {ingredient.optional ? <small>optional</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="recipe-steps-panel">
          <p className="eyebrow">Method</p>
          <h2>How it happens</h2>
          <ol>
            {recipe.steps.map((step) => (
              <li key={step.id}>
                <span>{String(step.sequence).padStart(2, "0")}</span>
                <p>{step.instruction}</p>
                {step.timerMinutes ? <small><Clock3 /> {step.timerMinutes} min</small> : null}
              </li>
            ))}
          </ol>
          {recipe.sourceUrl ? (
            <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              Original source
            </a>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function NewRecipe({
  draftOwnerId,
  onCancel,
  onSaved,
}: {
  draftOwnerId: string;
  onCancel: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([blankIngredient()]);
  const [steps, setSteps] = useState<StepDraft[]>([blankStep()]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saved" | "restored" | "unavailable">("idle");
  const storageKey = `apartmentLab:recipeDraft:v1:${draftOwnerId}`;

  const writeDraft = useCallback(() => {
    if (!formRef.current) return;
    const fields = Object.fromEntries(
      Array.from(formRef.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "input[name]:not([type=file]), textarea[name], select[name]",
      )).map((field) => [field.name, field.value]),
    );
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, fields, ingredients, steps }));
      setDraftStatus("saved");
    } catch {
      setDraftStatus("unavailable");
    }
  }, [ingredients, steps, storageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        version?: number;
        fields?: Record<string, string>;
        ingredients?: IngredientDraft[];
        steps?: StepDraft[];
      };
      if (draft.version !== 1) return;
      if (draft.ingredients?.length) setIngredients(draft.ingredients.map((item) => ({ ...item, key: item.key || draftKey() })));
      if (draft.steps?.length) setSteps(draft.steps.map((item) => ({ ...item, key: item.key || draftKey() })));
      requestAnimationFrame(() => {
        formRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          "input[name]:not([type=file]), textarea[name], select[name]",
        ).forEach((field) => {
          const value = draft.fields?.[field.name];
          if (typeof value === "string") field.value = value;
        });
      });
      setDraftStatus("restored");
    } catch {
      setDraftStatus("unavailable");
    }
  }, [storageKey]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") writeDraft();
    };
    window.addEventListener("pagehide", writeDraft);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", writeDraft);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [writeDraft]);

  function updateIngredient(key: string, patch: Partial<IngredientDraft>) {
    setIngredients((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function updateStep(key: string, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const recipeId = crypto.randomUUID();
    let photoPath: string | null = null;

    if (photo) {
      const extension = (photo.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      photoPath = `1/${recipeId}/cover.${extension || "jpg"}`;
      const { error } = await supabase.storage.from("recipe-images").upload(photoPath, photo, {
        cacheControl: "3600",
        upsert: false,
        contentType: photo.type || undefined,
      });
      if (error) {
        setMessage(`The recipe is safe, but the photo could not upload: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    const payload = {
      id: recipeId,
      title: String(form.get("title") || "").trim(),
      subtitle: String(form.get("subtitle") || "").trim() || null,
      description: String(form.get("description") || "").trim() || null,
      sourceUrl: String(form.get("sourceUrl") || "").trim() || null,
      photoPath,
      servings: numberOrNull(String(form.get("servings") || "")),
      prepMinutes: numberOrNull(String(form.get("prepMinutes") || "")),
      cookMinutes: numberOrNull(String(form.get("cookMinutes") || "")),
      category: String(form.get("category") || "").trim() || null,
      tags: String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
      ingredients: ingredients.filter((item) => item.name.trim()).map((item) => ({
        name: item.name.trim(),
        quantityValue: numberOrNull(item.quantity),
        quantityText: item.quantity.trim() || null,
        unit: item.unit.trim() || null,
        preparation: item.preparation.trim() || null,
        optional: item.optional,
      })),
      steps: steps.filter((item) => item.instruction.trim()).map((item) => ({
        instruction: item.instruction.trim(),
        timerMinutes: numberOrNull(item.timerMinutes),
      })),
    };

    const { data, error } = await supabase.schema("lab").rpc("create_recipe", { p_recipe: payload });
    if (error) {
      if (photoPath) await supabase.storage.from("recipe-images").remove([photoPath]);
      setMessage(error.message);
      setSaving(false);
      return;
    }

    try { localStorage.removeItem(storageKey); } catch { /* saved database record is authoritative */ }
    await onSaved(String(data));
  }

  function keepDraftAndExit() {
    writeDraft();
    onCancel();
  }

  function discardDraft() {
    if (!window.confirm("Discard this recipe draft from this device?")) return;
    try { localStorage.removeItem(storageKey); } catch { /* form can still reset */ }
    formRef.current?.reset();
    setIngredients([blankIngredient()]);
    setSteps([blankStep()]);
    setPhoto(null);
    setDraftStatus("idle");
  }

  return (
    <div className="page inner-page recipe-editor-page">
      <div className="page-heading area-heading">
        <div>
          <p className="eyebrow kitchen-eyebrow">New household standard</p>
          <h1>Add a recipe</h1>
          <p>Enough structure to cook it again; enough humanity to remember why.</p>
        </div>
        <button className="close-button" type="button" onClick={keepDraftAndExit}><X /></button>
      </div>

      <form ref={formRef} className="tasting-form area-editor-form" onSubmit={handleSubmit} onInput={writeDraft} onChange={writeDraft}>
        <div className={`draft-status ${draftStatus}`} aria-live="polite">
          <span>
            {draftStatus === "restored" ? <><Check /> Recipe draft restored.</> :
              draftStatus === "saved" ? <><Check /> Recipe draft saved on this device.</> :
              draftStatus === "unavailable" ? "This browser blocked local draft storage." :
              "This recipe will save automatically on this device."}
          </span>
          {draftStatus === "saved" || draftStatus === "restored" ? (
            <button type="button" onClick={discardDraft}><Trash2 /> Discard draft</button>
          ) : null}
        </div>

        <section className="form-section kitchen-section">
          <div className="section-number">01</div>
          <div className="section-content">
            <h2>The menu card</h2>
            <div className="recipe-basics-grid">
              <div className="photo-upload-field">
                <label>
                  {photoPreview ? <img src={photoPreview} alt="Recipe preview" /> : <span><ImagePlus /> Add a finished-dish photo</span>}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
                </label>
                {photo ? <small>{photo.name}</small> : <small>Optional · up to 10 MB</small>}
              </div>
              <div className="form-grid">
                <label className="field wide"><span>Recipe name *</span><input name="title" required placeholder="Yogurt cream chicken" /></label>
                <label className="field wide"><span>Short menu description</span><input name="subtitle" placeholder="Lemony, herby, and suspiciously easy" /></label>
                <label className="field"><span>Category</span><input name="category" placeholder="Dinner, baking, sauce…" /></label>
                <label className="field"><span>Servings</span><input name="servings" type="number" min="0.25" step="0.25" inputMode="decimal" /></label>
                <label className="field"><span>Prep · minutes</span><input name="prepMinutes" type="number" min="0" inputMode="numeric" /></label>
                <label className="field"><span>Cook · minutes</span><input name="cookMinutes" type="number" min="0" inputMode="numeric" /></label>
                <label className="field wide"><span>Tags</span><input name="tags" placeholder="weeknight, chicken, Kyle favorite" /><small>Separate with commas.</small></label>
                <label className="field wide"><span>Description / why we keep it</span><textarea name="description" rows={3} /></label>
                <label className="field wide"><span>Original source URL</span><input name="sourceUrl" type="url" inputMode="url" placeholder="https://…" /></label>
              </div>
            </div>
          </div>
        </section>

        <section className="form-section kitchen-section">
          <div className="section-number">02</div>
          <div className="section-content">
            <div className="section-title-row">
              <h2>Ingredients</h2>
              <button type="button" className="small-add-button" onClick={() => setIngredients((current) => [...current, blankIngredient()])}><Plus /> Add ingredient</button>
            </div>
            <div className="dynamic-list ingredient-editor-list">
              {ingredients.map((ingredient, index) => (
                <div className="dynamic-row ingredient-row" key={ingredient.key}>
                  <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                  <input aria-label={`Ingredient ${index + 1} quantity`} value={ingredient.quantity} onChange={(event) => updateIngredient(ingredient.key, { quantity: event.target.value })} placeholder="2" inputMode="decimal" />
                  <input aria-label={`Ingredient ${index + 1} unit`} value={ingredient.unit} onChange={(event) => updateIngredient(ingredient.key, { unit: event.target.value })} placeholder="tbsp" />
                  <input className="ingredient-name-input" aria-label={`Ingredient ${index + 1} name`} value={ingredient.name} onChange={(event) => updateIngredient(ingredient.key, { name: event.target.value })} placeholder="Greek yogurt" />
                  <input aria-label={`Ingredient ${index + 1} preparation`} value={ingredient.preparation} onChange={(event) => updateIngredient(ingredient.key, { preparation: event.target.value })} placeholder="finely chopped" />
                  <label className="optional-check"><input type="checkbox" checked={ingredient.optional} onChange={(event) => updateIngredient(ingredient.key, { optional: event.target.checked })} /> optional</label>
                  <button type="button" className="icon-delete" aria-label={`Remove ingredient ${index + 1}`} onClick={() => setIngredients((current) => current.filter((item) => item.key !== ingredient.key))}><Trash2 /></button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="form-section kitchen-section">
          <div className="section-number">03</div>
          <div className="section-content">
            <div className="section-title-row">
              <h2>Method</h2>
              <button type="button" className="small-add-button" onClick={() => setSteps((current) => [...current, blankStep()])}><Plus /> Add step</button>
            </div>
            <div className="dynamic-list step-editor-list">
              {steps.map((step, index) => (
                <div className="dynamic-row step-row" key={step.key}>
                  <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                  <textarea aria-label={`Step ${index + 1}`} value={step.instruction} onChange={(event) => updateStep(step.key, { instruction: event.target.value })} rows={2} placeholder="Describe what actually happens…" />
                  <label><span>Timer</span><input value={step.timerMinutes} onChange={(event) => updateStep(step.key, { timerMinutes: event.target.value })} type="number" min="0" inputMode="numeric" placeholder="min" /></label>
                  <button type="button" className="icon-delete" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps((current) => current.filter((item) => item.key !== step.key))}><Trash2 /></button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {message ? <p className="form-message error">{message}</p> : null}
        <div className="form-actions">
          <button className="ghost-button" type="button" onClick={keepDraftAndExit}>Keep draft &amp; exit</button>
          <button className="primary-button kitchen-button" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <ChefHat />}{saving ? "Saving…" : "Add to our menu"}</button>
        </div>
      </form>
    </div>
  );
}

export function PickleLab({ batches, onNew, people, draftOwnerId, currentPersonId, onSaved }: {
  batches: PickleBatchRecord[]; onNew: () => void;
  people: { id: number; display_name: string }[]; draftOwnerId: string;
  currentPersonId: number | null; onSaved: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const batch = batches.find(b => b.id === selectedId);
  if (batch) return <PickleBatchDetail key={batch.id} batch={batch} people={people} draftOwnerId={draftOwnerId} currentPersonId={currentPersonId} onBack={() => setSelectedId(null)} onSaved={onSaved} />;
  return (
    <div className="page inner-page pickle-lab-page">
      <div className="page-heading area-heading">
        <div>
          <p className="eyebrow pickle-eyebrow">Household instrument · 002</p>
          <h1>Pickle Lab</h1>
          <p>Explore broadly, preserve promising branches, and keep the failures useful.</p>
        </div>
        <button className="primary-button pickle-button" type="button" onClick={onNew}><Plus /> Start a batch</button>
      </div>

      <section className="pickle-summary-strip">
        <div><strong>{batches.length}</strong><span>batches</span></div>
        <div><strong>{batches.filter((batch) => batch.recordStatus === "active").length}</strong><span>active</span></div>
        <div><strong>{batches.reduce((total, batch) => total + Number(batch.tastingCount || 0), 0)}</strong><span>tastings</span></div>
      </section>

      {batches.length === 0 ? (
        <section className="area-empty-state pickle-empty">
          <span className="empty-instrument"><Sprout /></span>
          <p className="eyebrow pickle-eyebrow">The branching map is empty</p>
          <h2>Start with the next jar, not an imaginary perfect system.</h2>
          <p>
            Record the recipe, method, question, and initial conditions. Each later
            variation can branch from the batch that inspired it.
          </p>
          <button className="primary-button pickle-button" type="button" onClick={onNew}><Plus /> Start the first batch</button>
        </section>
      ) : (
        <div className="pickle-batch-grid">
          {batches.map((batch) => (
            <article className="pickle-batch-card" key={batch.id}>
              <div className="batch-card-topline">
                <span>{batch.batchCode}</span>
                <span className={`batch-status ${batch.recordStatus}`}>{batch.recordStatus}</span>
              </div>
              <p className="eyebrow pickle-eyebrow">{methodLabel(batch.fermentationType)}</p>
              <h2>{batch.experiment?.title ?? batch.batchCode}</h2>
              {batch.experiment?.researchQuestion ? <p>{batch.experiment.researchQuestion}</p> : null}
              <div className="batch-ingredient-cloud">
                {batch.ingredients.slice(0, 6).map((ingredient) => <span key={ingredient.id}>{ingredient.name}</span>)}
              </div>
              <div className="batch-card-footer">
                <span>{dateLabel(batch.preparedAt)}</span>
                <span>{batch.tastingCount} tastings</span>
                <button className="small-add-button" type="button" onClick={() => setSelectedId(batch.id)}>Open batch / Add tasting</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function NewPickleBatch({
  draftOwnerId,
  onCancel,
  onSaved,
}: {
  draftOwnerId: string;
  onCancel: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([blankIngredient("vegetable")]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const storageKey = `apartmentLab:pickleDraft:v1:${draftOwnerId}`;
  const defaultCode = useMemo(() => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replaceAll("-", "");
    return `PKL-${date}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  }, []);

  const writeDraft = useCallback(() => {
    if (!formRef.current) return;
    const fields = Object.fromEntries(
      Array.from(formRef.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input[name], textarea[name], select[name]"))
        .map((field) => [field.name, field.value]),
    );
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, fields, ingredients })); } catch { /* database save still works */ }
  }, [ingredients, storageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { version?: number; fields?: Record<string, string>; ingredients?: IngredientDraft[] };
      if (draft.version !== 1) return;
      if (draft.ingredients?.length) setIngredients(draft.ingredients.map((item) => ({ ...item, key: item.key || draftKey() })));
      requestAnimationFrame(() => {
        formRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input[name], textarea[name], select[name]").forEach((field) => {
          const value = draft.fields?.[field.name];
          if (typeof value === "string") field.value = value;
        });
      });
    } catch { /* ignore unreadable device-local drafts */ }
  }, [storageKey]);

  useEffect(() => {
    const saveWhenHidden = () => { if (document.visibilityState === "hidden") writeDraft(); };
    window.addEventListener("pagehide", writeDraft);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", writeDraft);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [writeDraft]);

  function updateIngredient(key: string, patch: Partial<IngredientDraft>) {
    setIngredients((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const preparedAt = String(form.get("preparedAt") || "");
    const payload = {
      title: String(form.get("title") || "").trim(),
      batchCode: String(form.get("batchCode") || "").trim(),
      fermentationType: String(form.get("fermentationType") || "lacto_fermented"),
      preparedAt: preparedAt ? new Date(preparedAt).toISOString() : new Date().toISOString(),
      purpose: String(form.get("purpose") || "explore"),
      researchQuestion: String(form.get("researchQuestion") || "").trim() || null,
      hypothesis: String(form.get("hypothesis") || "").trim() || null,
      recipePayload: {
        brine: String(form.get("brine") || "").trim() || null,
        recipeNotes: String(form.get("recipeNotes") || "").trim() || null,
      },
      processPayload: {
        vessel: String(form.get("vessel") || "").trim() || null,
        processNotes: String(form.get("processNotes") || "").trim() || null,
      },
      ingredients: ingredients.filter((item) => item.name.trim()).map((item) => ({
        name: item.name.trim(),
        role: item.role,
        batchRole: item.role,
        quantityValue: numberOrNull(item.quantity),
        quantityUnit: item.unit.trim() || null,
        rawText: [item.quantity, item.unit, item.name, item.preparation].filter(Boolean).join(" "),
      })),
    };

    const { data, error } = await supabase.schema("lab").rpc("create_pickle_batch", { p_batch: payload });
    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }
    try { localStorage.removeItem(storageKey); } catch { /* record is authoritative */ }
    await onSaved(String(data));
  }

  function keepDraftAndExit() {
    writeDraft();
    onCancel();
  }

  return (
    <div className="page inner-page pickle-editor-page">
      <div className="page-heading area-heading">
        <div>
          <p className="eyebrow pickle-eyebrow">New branch</p>
          <h1>Start a pickle batch</h1>
          <p>Capture the jar as made. We can decide what it means after tasting it.</p>
        </div>
        <button className="close-button" type="button" onClick={keepDraftAndExit}><X /></button>
      </div>

      <form ref={formRef} className="tasting-form area-editor-form" onSubmit={handleSubmit} onInput={writeDraft} onChange={writeDraft}>
        <div className="draft-status"><span><Check /> This batch draft stays on this device until saved.</span></div>
        <section className="form-section pickle-section">
          <div className="section-number">01</div>
          <div className="section-content">
            <h2>The question and the jar</h2>
            <div className="form-grid">
              <label className="field"><span>Batch title *</span><input name="title" required placeholder="Garlic dill · lower salt branch" /></label>
              <label className="field"><span>Batch code *</span><input name="batchCode" required defaultValue={defaultCode} /></label>
              <label className="field"><span>Method</span><select name="fermentationType" defaultValue="lacto_fermented"><option value="lacto_fermented">Lacto-fermented</option><option value="vinegar_quick">Quick vinegar</option><option value="refrigerator">Refrigerator pickle</option><option value="hybrid">Hybrid</option></select></label>
              <label className="field"><span>Prepared at</span><input name="preparedAt" type="datetime-local" /></label>
              <label className="field"><span>Experiment purpose</span><select name="purpose" defaultValue="explore"><option value="explore">Explore</option><option value="refine">Refine</option><option value="extend">Extend</option><option value="replicate">Replicate</option><option value="recombine">Recombine</option></select></label>
              <label className="field"><span>Vessel</span><input name="vessel" placeholder="64 oz jar, deli quart…" /></label>
              <label className="field wide"><span>Research question</span><textarea name="researchQuestion" rows={2} placeholder="What are we trying to learn from this branch?" /></label>
              <label className="field wide"><span>Hypothesis</span><textarea name="hypothesis" rows={2} placeholder="What do we expect, without pretending certainty?" /></label>
            </div>
          </div>
        </section>

        <section className="form-section pickle-section">
          <div className="section-number">02</div>
          <div className="section-content">
            <div className="section-title-row"><h2>Ingredients</h2><button type="button" className="small-add-button pickle-add" onClick={() => setIngredients((current) => [...current, blankIngredient()])}><Plus /> Add ingredient</button></div>
            <div className="dynamic-list ingredient-editor-list pickle-ingredient-list">
              {ingredients.map((ingredient, index) => (
                <div className="dynamic-row ingredient-row" key={ingredient.key}>
                  <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                  <input aria-label={`Pickle ingredient ${index + 1} quantity`} value={ingredient.quantity} onChange={(event) => updateIngredient(ingredient.key, { quantity: event.target.value })} placeholder="2" inputMode="decimal" />
                  <input aria-label={`Pickle ingredient ${index + 1} unit`} value={ingredient.unit} onChange={(event) => updateIngredient(ingredient.key, { unit: event.target.value })} placeholder="lb" />
                  <input className="ingredient-name-input" aria-label={`Pickle ingredient ${index + 1} name`} value={ingredient.name} onChange={(event) => updateIngredient(ingredient.key, { name: event.target.value })} placeholder="Kirby cucumbers" />
                  <select aria-label={`Pickle ingredient ${index + 1} role`} value={ingredient.role} onChange={(event) => updateIngredient(ingredient.key, { role: event.target.value })}><option value="vegetable">Vegetable</option><option value="aromatic">Aromatic</option><option value="spice">Spice</option><option value="sweetener">Sweetener</option><option value="other">Other / brine</option></select>
                  <button type="button" className="icon-delete" aria-label={`Remove ingredient ${index + 1}`} onClick={() => setIngredients((current) => current.filter((item) => item.key !== ingredient.key))}><Trash2 /></button>
                </div>
              ))}
            </div>
            <div className="form-grid pickle-notes-grid">
              <label className="field wide"><span>Brine / liquid details</span><textarea name="brine" rows={3} placeholder="Water, vinegar, salinity, sugar, anything easier to preserve as written…" /></label>
              <label className="field wide"><span>Recipe notes</span><textarea name="recipeNotes" rows={3} /></label>
              <label className="field wide"><span>Process notes</span><textarea name="processNotes" rows={3} placeholder="Cut, pack, temperatures, weights, oddities…" /></label>
            </div>
          </div>
        </section>

        {message ? <p className="form-message error">{message}</p> : null}
        <div className="form-actions"><button className="ghost-button" type="button" onClick={keepDraftAndExit}>Keep draft &amp; exit</button><button className="primary-button pickle-button" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Sprout />}{saving ? "Recording…" : "Start this branch"}</button></div>
      </form>
    </div>
  );
}
