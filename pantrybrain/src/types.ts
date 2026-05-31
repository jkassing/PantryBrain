export type RecipeQuery = {
  request: string;
};

export type NutritionRow = {
  label: string;
  value: string;
};

export type RecipeResult = {
  id: string;
  title: string;
  url: string;
  source: string;
  thumbnail?: string;
  description?: string;
  cuisine?: string;
  mealType?: string;
  totalTimeMinutes?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: string;
  tags: string[];
  ingredients: string[];
  instructions: string[];
  nutrition?: NutritionRow[];
  attribution: string;
  matchNote: string;
  confidenceNotes: string[];
  score: number;
};

export type RecipeSearchOutput = {
  query: {
    original: string;
    normalizedTerms: string[];
    appliedFilters: string[];
    matchedIntent?: {
      cuisineFamily?: string;
      specificCuisine?: string;
      mealType?: string;
      maxTimeMinutes?: number;
      diet?: string;
      ingredients?: string[];
      excludeIngredients?: string[];
      servings?: number;
    };
    sourceSummary?: {
      activeSources: string[];
      degradedSources: string[];
      fetched: number;
      blocked: number;
      parseFailed: number;
      parsed: number;
    };
    diversity?: {
      rotationDay: string;
      rotationMode: "broad" | "focused";
    };
  };
  recipes: RecipeResult[];
  fallbackMessage?: string;
  sources: string[];
};
