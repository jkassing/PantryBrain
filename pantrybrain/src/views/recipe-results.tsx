import "@/index.css";

import {
  Clock3,
  ExternalLink,
  Leaf,
  Minus,
  Plus,
  X,
  Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { useLayout, useOpenExternal, useViewState } from "skybridge/web";
import { useToolInfo } from "@/helpers.js";
import pantryBrainLockup from "@/views/images/pantrybrain-lockup.png";
import type { RecipeResult, RecipeSearchOutput } from "@/types.js";

type ViewState = {
  activeIndex: number;
  selectedId: string | null;
};

type DragState = {
  pointerId: number;
  startX: number;
  deltaX: number;
  moved: boolean;
};

type DetailTab = "recipe" | "nutrition";

const SWIPE_THRESHOLD = 42;
const CARD_ANIMATION_MS = 360;
const DEFAULT_SERVINGS = 4;

export default function RecipeResults() {
  const { theme } = useLayout();
  const openExternal = useOpenExternal();
  const { output } = useToolInfo<"find_recipes">();
  const [state, setState] = useViewState<ViewState>({
    activeIndex: 0,
    selectedId: null,
  });
  const [motionDirection, setMotionDirection] = useState<-1 | 0 | 1>(0);
  const dragRef = useRef<DragState | null>(null);

  const data = output as RecipeSearchOutput | undefined;
  const recipes = data?.recipes ?? [];
  const storedActiveIndex = Number.isFinite(state.activeIndex)
    ? state.activeIndex
    : 0;
  const activeIndex = recipes.length
    ? wrapIndex(storedActiveIndex, recipes.length)
    : 0;
  const activeRecipe = recipes[activeIndex];
  const selected = recipes.find((recipe) => recipe.id === state.selectedId);
  const isDetailOpen = Boolean(selected);
  const moveSelection = (direction: -1 | 1) => {
    if (!recipes.length || motionDirection !== 0) return;
    setMotionDirection(direction);
    setState({
      activeIndex: wrapIndex(
        (Number.isFinite(state.activeIndex) ? state.activeIndex : 0) + direction,
        recipes.length,
      ),
      selectedId: null,
    });
    window.setTimeout(() => setMotionDirection(0), CARD_ANIMATION_MS);
  };

  const openActiveRecipe = () => {
    if (!activeRecipe || dragRef.current?.moved) return;
    window.setTimeout(() => {
      setState({
        ...state,
        activeIndex,
        selectedId: activeRecipe.id,
      });
    }, 0);
  };

  const closeRecipe = () => {
    window.setTimeout(() => {
      setState({
        ...state,
        selectedId: null,
      });
    }, 0);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.dataset.front !== "true") return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      deltaX: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.dataset.front !== "true") return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.deltaX = event.clientX - drag.startX;
    drag.moved = Math.abs(drag.deltaX) > 8;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.dataset.front !== "true") return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    if (Math.abs(drag.deltaX) >= SWIPE_THRESHOLD) {
      moveSelection(drag.deltaX < 0 ? 1 : -1);
      return;
    }

    if (!drag.moved) {
      openActiveRecipe();
    }
  };

  const rootContext = selected
    ? `PantryBrain is showing the full recipe for "${selected.title}" from ${selected.source}.`
    : activeRecipe
      ? `PantryBrain is browsing ${recipes.length} recipe options. No recipe is selected. Front card is "${activeRecipe.title}" from ${activeRecipe.source}.`
      : "PantryBrain did not find a complete real recipe for this request.";

  return (
    <main
      className={`${theme === "dark" ? "dark" : ""} pantry-shell`}
      data-llm={rootContext}
    >
      <section className="pantry-panel">
        <header className="pantry-header">
          <Logo />
        </header>

        {data?.fallbackMessage ? (
          <p className="pantry-notice">{data.fallbackMessage}</p>
        ) : null}

        {recipes.length ? (
          <section className="recipe-stage">
            {isDetailOpen && selected ? (
              <RecipeDetail
                key={selected.id}
                recipe={selected}
                onBack={closeRecipe}
                onOpenSource={() => openExternal(selected.url)}
              />
            ) : (
              <RecipeDeck
                activeIndex={activeIndex}
                activeRecipe={activeRecipe}
                recipes={recipes}
                onMove={moveSelection}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onOpenActive={openActiveRecipe}
                motionDirection={motionDirection}
              />
            )}
          </section>
        ) : (
          <div className="empty-state">
            <h2>No complete recipes found</h2>
            <p>
              PantryBrain searched the curated source list and skipped pages
              without clear recipe ingredients and instructions.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function Logo() {
  return (
    <div className="pantry-brand" aria-label="PantryBrain">
      <img className="pantry-brand-lockup" src={pantryBrainLockup} alt="" />
    </div>
  );
}

function RecipeDeck({
  activeIndex,
  activeRecipe,
  recipes,
  onMove,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onOpenActive,
  motionDirection,
}: {
  activeIndex: number;
  activeRecipe?: RecipeResult;
  recipes: RecipeResult[];
  onMove: (direction: -1 | 1) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onOpenActive: () => void;
  motionDirection: -1 | 0 | 1;
}) {
  const cardOffsets =
    recipes.length <= 1 ? [0] : recipes.length === 2 ? [0, 1] : [-1, 0, 1];
  const visibleCards = cardOffsets
    .map((offset) => {
      const recipeIndex = wrapIndex(activeIndex + offset, recipes.length);
      return {
        recipe: recipes[recipeIndex],
        recipeIndex,
        position:
          offset === 0 ? "active" : offset < 0 ? "previous" : "next",
      };
    })
    .filter(
      (entry): entry is {
        recipe: RecipeResult;
        recipeIndex: number;
        position: "previous" | "active" | "next";
      } => Boolean(entry.recipe),
    );

  return (
    <div
      className={`deck-shell ${
        motionDirection === 1
          ? "is-moving-next"
          : motionDirection === -1
            ? "is-moving-prev"
            : ""
      } carousel-count-${visibleCards.length}`}
      data-llm={
        activeRecipe
          ? `Recipe deck with ${recipes.length} options. Front card: ${activeRecipe.title} from ${activeRecipe.source}. No full recipe is selected.`
          : "Recipe deck is empty."
      }
    >
      <div className="deck-area" aria-live="polite">
        {visibleCards.map(({ recipe, recipeIndex, position }) => (
          <button
            className={`stack-card is-${position}`}
            type="button"
            key={`${position}-${recipeIndex}-${recipe.source}-${recipe.id}-${recipe.url}`}
            tabIndex={position === "active" ? 0 : -1}
            aria-label={
              position === "active"
                ? `Open ${recipe.title}`
                : `Show ${position === "previous" ? "previous" : "next"} recipe: ${recipe.title}`
            }
            data-llm={`Carousel ${position} recipe card: ${recipe.title} from ${recipe.source}.`}
            data-front={position === "active" ? "true" : "false"}
            onClick={
              position === "active" || motionDirection !== 0
                ? undefined
                : () => onMove(position === "previous" ? -1 : 1)
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onKeyDown={(event) => {
              if (
                position === "active" &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onOpenActive();
              }
            }}
          >
            <RecipeImage recipe={recipe} />
            <span className="stack-card-body">
              <span className="recipe-source">{recipe.source}</span>
              <span className="recipe-title">{recipe.title}</span>
              {recipe.description ? (
                <span className="recipe-card-description">
                  {recipe.description}
                </span>
              ) : null}
              <span className="tag-row">
                <MetaPills recipe={recipe} tagLimit={2} compact />
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="deck-dots" aria-hidden="true">
        {recipes.map((recipe, index) => (
          <span
            className={`deck-dot ${index === activeIndex ? "is-active" : ""}`}
            key={`${index}-${recipe.source}-${recipe.id}`}
          />
        ))}
      </div>
    </div>
  );
}

function RecipeDetail({
  recipe,
  onBack,
  onOpenSource,
}: {
  recipe: RecipeResult;
  onBack: () => void;
  onOpenSource: () => void;
}) {
  const baseServings = parseServings(recipe.servings) ?? DEFAULT_SERVINGS;
  const [targetServings, setTargetServings] = useState(baseServings);
  const [unitSystem, setUnitSystem] = useState<"metric" | "imperial">("metric");
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("recipe");
  const hasNutrition = Boolean(recipe.nutrition?.length);

  const changeServings = (delta: number) => {
    setTargetServings((current) => Math.min(24, Math.max(1, current + delta)));
  };

  return (
    <article
      className="recipe-detail is-active"
      data-llm={`Full recipe is visible: ${recipe.title}. Source: ${recipe.source}. URL: ${recipe.url}. Active tab: ${activeDetailTab}. Source nutrition available: ${hasNutrition ? "yes" : "no"}. Display: ${targetServings} portions, ${unitSystem}. Ingredients: ${recipe.ingredients.join("; ")}.`}
    >
      <div className="detail-card">
        <button
          className="close-button"
          type="button"
          onClick={onBack}
          aria-label="Close recipe"
          title="Close recipe"
        >
          <X size={17} />
        </button>

        <div className="detail-hero">
          <RecipeImage recipe={recipe} large />
          <div className="detail-copy">
            <h2>{recipe.title}</h2>
            {recipe.description ? <p>{recipe.description}</p> : null}
            <div className="tag-row">
              <MetaPills recipe={recipe} tagLimit={5} />
            </div>
            <button className="secondary-button" type="button" onClick={onOpenSource}>
              <ExternalLink size={16} />
              Open source
            </button>
          </div>
        </div>

        {hasNutrition ? (
          <div className="detail-tabs" role="tablist" aria-label="Recipe details">
            <button
              type="button"
              role="tab"
              aria-selected={activeDetailTab === "recipe"}
              className={activeDetailTab === "recipe" ? "detail-tab is-active" : "detail-tab"}
              onClick={() => setActiveDetailTab("recipe")}
            >
              Recipe
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeDetailTab === "nutrition"}
              className={activeDetailTab === "nutrition" ? "detail-tab is-active" : "detail-tab"}
              onClick={() => setActiveDetailTab("nutrition")}
            >
              Nutrition
            </button>
          </div>
        ) : null}

        {activeDetailTab === "nutrition" && hasNutrition ? (
          <NutritionTable rows={recipe.nutrition ?? []} />
        ) : (
          <FullRecipe
            recipe={recipe}
            baseServings={baseServings}
            targetServings={targetServings}
            unitSystem={unitSystem}
            onChangeServings={changeServings}
            onUnitSystemChange={setUnitSystem}
          />
        )}
      </div>
    </article>
  );
}

function NutritionTable({ rows }: { rows: NonNullable<RecipeResult["nutrition"]> }) {
  return (
    <section className="nutrition-panel" aria-label="Source nutrition">
      <h3>Nutrition</h3>
      <table className="nutrition-table">
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.label}-${row.value}`}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MetaPills({
  recipe,
  tagLimit,
  compact = false,
}: {
  recipe: RecipeResult;
  tagLimit: number;
  compact?: boolean;
}) {
  const iconSize = compact ? 13 : 14;
  const pills: Array<{
    key: string;
    icon?: "time" | "servings" | "leaf";
    label: string;
  }> = [];

  if (recipe.totalTimeMinutes) {
    pills.push({
      key: `${recipe.id}-time`,
      icon: "time",
      label: compact
        ? `${recipe.totalTimeMinutes}m`
        : `${recipe.totalTimeMinutes} minutes`,
    });
  }

  if (recipe.servings) {
    pills.push({
      key: `${recipe.id}-servings`,
      icon: "servings",
      label: recipe.servings,
    });
  }

  recipe.tags.slice(0, tagLimit).forEach((tag, index) => {
    const shouldShowLeaf =
      compact &&
      (tag.includes("vegan") ||
        tag.includes("vegetarian") ||
        tag.includes("dairy"));

    pills.push({
      key: `${recipe.id}-tag-${index}`,
      icon: shouldShowLeaf ? "leaf" : undefined,
      label: tag,
    });
  });

  return (
    <>
      {pills.map((pill) => (
        <span
          className={`meta-pill ${pill.icon ? `has-${pill.icon}` : "has-tag"}`}
          key={`pill-${pill.key}`}
        >
          {pill.icon === "time" ? <Clock3 size={iconSize} /> : null}
          {pill.icon === "servings" ? <Users size={iconSize} /> : null}
          {pill.icon === "leaf" ? <Leaf size={iconSize} /> : null}
          {pill.label}
        </span>
      ))}
    </>
  );
}

function RecipeImage({
  recipe,
  large = false,
}: {
  recipe: RecipeResult;
  large?: boolean;
}) {
  if (recipe.thumbnail) {
    return (
      <img
        className={large ? "recipe-image is-large" : "recipe-image"}
        src={recipe.thumbnail}
        sizes={large ? "(max-width: 720px) 100vw, 390px" : "(max-width: 720px) 350px, 360px"}
        loading={large ? "eager" : "lazy"}
        decoding="async"
        alt=""
      />
    );
  }

  return (
    <span
      className={
        large ? "recipe-image image-fallback is-large" : "recipe-image image-fallback"
      }
    >
      {recipe.title.slice(0, 1)}
    </span>
  );
}

function FullRecipe({
  recipe,
  baseServings,
  targetServings,
  unitSystem,
  onChangeServings,
  onUnitSystemChange,
}: {
  recipe: RecipeResult;
  baseServings: number;
  targetServings: number;
  unitSystem: "metric" | "imperial";
  onChangeServings: (delta: number) => void;
  onUnitSystemChange: (unitSystem: "metric" | "imperial") => void;
}) {
  const scaledIngredients = recipe.ingredients.map((ingredient) =>
    scaleIngredientLine(ingredient, baseServings, targetServings, unitSystem),
  );

  return (
    <div className="full-recipe">
      <section className="ingredients-panel">
        <div className="recipe-section-heading">
          <h3>Ingredients</h3>
          <div className="portion-controls" aria-label="Ingredient display controls">
            <div className="stepper" aria-label="Portions">
              <button
                type="button"
                onClick={() => onChangeServings(-1)}
                disabled={targetServings <= 1}
                aria-label="Decrease portions"
              >
                <Minus size={13} />
              </button>
              <span>{targetServings} portions</span>
              <button
                type="button"
                onClick={() => onChangeServings(1)}
                disabled={targetServings >= 24}
                aria-label="Increase portions"
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="unit-toggle" aria-label="Unit system">
              <button
                type="button"
                className={unitSystem === "metric" ? "is-active" : ""}
                onClick={() => onUnitSystemChange("metric")}
              >
                Metric
              </button>
              <button
                type="button"
                className={unitSystem === "imperial" ? "is-active" : ""}
                onClick={() => onUnitSystemChange("imperial")}
              >
                Imperial
              </button>
            </div>
          </div>
        </div>
        <ul className="ingredient-list">
          {scaledIngredients.map((ingredient, index) => (
            <li key={`${index}-${ingredient}`}>{ingredient}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Steps</h3>
        <ol className="step-list">
          {recipe.instructions.map((instruction, index) => (
            <li key={`${index}-${instruction}`}>{instruction}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function wrapIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

function parseServings(value?: string) {
  if (!value) return null;
  const match = value.match(/\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\b/);
  if (!match) return null;
  const first = Number.parseInt(match[1], 10);
  const second = match[2] ? Number.parseInt(match[2], 10) : first;
  const servings = Math.round((first + second) / 2);
  return servings >= 1 && servings <= 24 ? servings : null;
}

function scaleIngredientLine(
  line: string,
  baseServings: number,
  targetServings: number,
  unitSystem: "metric" | "imperial",
) {
  const ratio = targetServings / baseServings;
  const temperatureConverted = convertTemperatures(line, unitSystem);
  const parsed = parseLeadingQuantity(temperatureConverted);
  if (!parsed) return temperatureConverted;

  const unitMatch = parsed.rest.match(
    /^\s*(g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters|tsp|teaspoon|teaspoons|tbsp|tablespoon|tablespoons|cup|cups|oz|ounce|ounces|lb|lbs|pound|pounds|fl oz|fluid ounce|fluid ounces)\b\.?/i,
  );
  const scaledQuantity = parsed.quantity * ratio;

  if (!unitMatch) {
    return `${formatQuantity(scaledQuantity)}${parsed.rest}`;
  }

  const unit = canonicalUnit(unitMatch[1]);
  const remainder = parsed.rest.slice(unitMatch[0].length);
  const converted = convertUnit(scaledQuantity, unit, unitSystem);

  if (!converted) {
    return `${formatQuantity(scaledQuantity)} ${unit}${remainder}`;
  }

  return `${formatQuantity(converted.quantity)} ${converted.unit}${remainder}`;
}

function parseLeadingQuantity(line: string) {
  const trimmed = line.trimStart();
  const match = trimmed.match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])(?=\s|[a-zA-Z])/,
  );
  if (!match) return null;
  const quantity = parseQuantity(match[1]);
  if (!quantity) return null;
  return {
    quantity,
    rest: trimmed.slice(match[1].length),
  };
}

function parseQuantity(value: string) {
  const vulgarFractions: Record<string, number> = {
    "¼": 0.25,
    "½": 0.5,
    "¾": 0.75,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
  };
  if (vulgarFractions[value]) return vulgarFractions[value];
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    return (
      Number.parseInt(mixed[1], 10) +
      Number.parseInt(mixed[2], 10) / Number.parseInt(mixed[3], 10)
    );
  }
  const fraction = value.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    return Number.parseInt(fraction[1], 10) / Number.parseInt(fraction[2], 10);
  }
  const decimal = Number.parseFloat(value);
  return Number.isFinite(decimal) ? decimal : 0;
}

function formatQuantity(value: number) {
  if (value >= 10) return String(Math.round(value));
  if (value >= 1) {
    const rounded = Math.round(value * 4) / 4;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
  }
  const rounded = Math.round(value * 8) / 8;
  if (rounded <= 0) return value.toFixed(2).replace(/^0/, "");
  return rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function canonicalUnit(unit: string) {
  const normalized = unit.toLowerCase();
  if (["gram", "grams"].includes(normalized)) return "g";
  if (["kilogram", "kilograms"].includes(normalized)) return "kg";
  if (["milliliter", "milliliters"].includes(normalized)) return "ml";
  if (["liter", "liters"].includes(normalized)) return "l";
  if (["teaspoon", "teaspoons"].includes(normalized)) return "tsp";
  if (["tablespoon", "tablespoons"].includes(normalized)) return "tbsp";
  if (["cup", "cups"].includes(normalized)) return "cups";
  if (["ounce", "ounces"].includes(normalized)) return "oz";
  if (["lb", "lbs", "pound", "pounds"].includes(normalized)) return "lb";
  if (["fluid ounce", "fluid ounces"].includes(normalized)) return "fl oz";
  return normalized;
}

function convertUnit(
  quantity: number,
  unit: string,
  unitSystem: "metric" | "imperial",
) {
  if (unitSystem === "metric") {
    if (unit === "oz") return { quantity: quantity * 28.3495, unit: "g" };
    if (unit === "lb") return { quantity: quantity * 0.453592, unit: "kg" };
    if (unit === "fl oz") return { quantity: quantity * 29.5735, unit: "ml" };
    if (unit === "cups") return { quantity: quantity * 240, unit: "ml" };
    if (unit === "tbsp") return { quantity: quantity * 15, unit: "ml" };
    if (unit === "tsp") return { quantity: quantity * 5, unit: "ml" };
  } else {
    if (unit === "g") return { quantity: quantity / 28.3495, unit: "oz" };
    if (unit === "kg") return { quantity: quantity / 0.453592, unit: "lb" };
    if (unit === "ml") return { quantity: quantity / 29.5735, unit: "fl oz" };
    if (unit === "l") return { quantity: quantity * 1.05669, unit: "qt" };
  }
  return { quantity, unit };
}

function convertTemperatures(line: string, unitSystem: "metric" | "imperial") {
  return line.replace(
    /(\d{2,3})\s*°?\s*([CF])\b/g,
    (_, rawTemperature: string, rawUnit: string) => {
      const value = Number.parseInt(rawTemperature, 10);
      const unit = rawUnit.toUpperCase();
      if (unitSystem === "metric" && unit === "F") {
        return `${Math.round(((value - 32) * 5) / 9)}C`;
      }
      if (unitSystem === "imperial" && unit === "C") {
        return `${Math.round((value * 9) / 5 + 32)}F`;
      }
      return `${value}${unit}`;
    },
  );
}
