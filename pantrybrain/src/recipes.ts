import { createHash } from "node:crypto";
import { load, type CheerioAPI } from "cheerio";
import type {
  NutritionRow,
  RecipeQuery,
  RecipeResult,
  RecipeSearchOutput,
} from "./types.js";

type RecipeSource = {
  name: string;
  origin: string;
  status: "active" | "degraded" | "disabled";
  searchUrl: (query: string) => string;
  seedUrls: string[];
};

type RecipeCandidate = {
  source: RecipeSource;
  url: string;
  isSeed: boolean;
};

type SourceDiagnostics = {
  fetched: number;
  blocked: number;
  parseFailed: number;
  parsed: number;
};

type RecipeIntent = RecipeQuery & {
  cuisineFamily?: string;
  specificCuisine?: string;
  mealType?: string;
  maxTimeMinutes?: number;
  diet?: string;
  ingredients?: string[];
  excludeIngredients?: string[];
  servings?: number;
};

type ScoredRecipe = RecipeResult & {
  isSeed?: boolean;
  sourceStatus?: RecipeSource["status"];
  diversityKey: string;
};

type RotationContext = {
  dayKey: string;
  dayIndex: number;
  mode: "broad" | "focused";
  queryKey: string;
};

const SOURCES: RecipeSource[] = [
  {
    name: "Budget Bytes",
    origin: "https://www.budgetbytes.com",
    status: "active",
    searchUrl: (query) =>
      `https://www.budgetbytes.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://www.budgetbytes.com/spicy-noodles/",
      "https://www.budgetbytes.com/black-bean-quesadillas/",
      "https://www.budgetbytes.com/easy-sesame-chicken/",
      "https://www.budgetbytes.com/creamy-coconut-curry-lentils-with-spinach/",
      "https://www.budgetbytes.com/hearty-black-bean-quesadillas/",
      "https://www.budgetbytes.com/banana-pancakes/",
      "https://www.budgetbytes.com/freezer-breakfast-burritos/",
    ],
  },
  {
    name: "Minimalist Baker",
    origin: "https://minimalistbaker.com",
    status: "active",
    searchUrl: (query) =>
      `https://minimalistbaker.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://minimalistbaker.com/creamy-vegan-spinach-artichoke-pasta-1-pot/",
      "https://minimalistbaker.com/kabocha-chickpea-miso-soup/",
      "https://minimalistbaker.com/gingery-smashed-cucumber-salad-asian-inspired/",
      "https://minimalistbaker.com/easy-mango-cucumber-salad/",
      "https://minimalistbaker.com/1-pot-red-lentil-chili/",
      "https://minimalistbaker.com/1-bowl-vegan-banana-oat-pancakes/",
      "https://minimalistbaker.com/easy-vegan-scrambled-eggs/",
    ],
  },
  {
    name: "Love and Lemons",
    origin: "https://www.loveandlemons.com",
    status: "active",
    searchUrl: (query) =>
      `https://www.loveandlemons.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://www.loveandlemons.com/vegetarian-chili-recipe/",
      "https://www.loveandlemons.com/asian-slaw/",
      "https://www.loveandlemons.com/creamed-spinach/",
      "https://www.loveandlemons.com/homemade-pasta-recipe/",
      "https://www.loveandlemons.com/buddha-bowl-recipe/",
      "https://www.loveandlemons.com/breakfast-burrito/",
      "https://www.loveandlemons.com/overnight-oats-recipe/",
    ],
  },
  {
    name: "Cookie and Kate",
    origin: "https://cookieandkate.com",
    status: "active",
    searchUrl: (query) =>
      `https://cookieandkate.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://cookieandkate.com/best-lentil-soup-recipe/",
      "https://cookieandkate.com/vegetable-soup-recipe/",
      "https://cookieandkate.com/crispy-baked-potato-wedges-recipe/",
      "https://cookieandkate.com/thai-red-curry-recipe/",
      "https://cookieandkate.com/roasted-cauliflower-recipe/",
      "https://cookieandkate.com/healthy-banana-bread-recipe/",
      "https://cookieandkate.com/simple-breakfast-quesadillas-recipe/",
    ],
  },
  {
    name: "BBC Good Food",
    origin: "https://www.bbcgoodfood.com",
    status: "active",
    searchUrl: (query) =>
      `https://www.bbcgoodfood.com/search?q=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://www.bbcgoodfood.com/recipes/chicken-tikka-masala",
      "https://www.bbcgoodfood.com/recipes/easy-vegetable-curry",
      "https://www.bbcgoodfood.com/recipes/vegan-chilli",
      "https://www.bbcgoodfood.com/recipes/quick-chicken-hummus-bowl",
      "https://www.bbcgoodfood.com/recipes/easy-pancakes",
      "https://www.bbcgoodfood.com/recipes/overnight-oats",
      "https://www.bbcgoodfood.com/recipes/breakfast-burrito",
    ],
  },
  {
    name: "Smitten Kitchen",
    origin: "https://smittenkitchen.com",
    status: "active",
    searchUrl: (query) =>
      `https://smittenkitchen.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://smittenkitchen.com/2022/04/simplest-mushroom-pasta/",
      "https://smittenkitchen.com/2025/05/one-pan-ditalini-and-peas/",
      "https://smittenkitchen.com/2010/02/thick-chewy-granola-bars/",
      "https://smittenkitchen.com/2016/09/perfect-blueberry-muffins/",
      "https://smittenkitchen.com/2021/02/baked-feta-with-tomatoes-and-chickpeas/",
    ],
  },
  {
    name: "RecipeTin Eats",
    origin: "https://www.recipetineats.com",
    status: "active",
    searchUrl: (query) =>
      `https://www.recipetineats.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://www.recipetineats.com/chicken-stir-fry-chop-suey/",
      "https://www.recipetineats.com/chicken-fried-rice/",
      "https://www.recipetineats.com/vegetarian-chili/",
      "https://www.recipetineats.com/quick-broccoli-pasta/",
      "https://www.recipetineats.com/pancakes-recipe/",
      "https://www.recipetineats.com/beef-tacos/",
      "https://www.recipetineats.com/thai-red-curry-with-chicken/",
    ],
  },
  {
    name: "Pinch of Yum",
    origin: "https://pinchofyum.com",
    status: "active",
    searchUrl: (query) =>
      `https://pinchofyum.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://pinchofyum.com/creamy-garlic-sun-dried-tomato-pasta",
      "https://pinchofyum.com/best-easy-shrimp-tacos",
      "https://pinchofyum.com/15-minute-meal-prep-sesame-noodle-bowls",
      "https://pinchofyum.com/vegetarian-shepherds-pie",
      "https://pinchofyum.com/fluffiest-blueberry-pancakes",
      "https://pinchofyum.com/chicken-tinga-tacos",
      "https://pinchofyum.com/instant-pot-wild-rice-soup",
    ],
  },
  {
    name: "Tasty",
    origin: "https://tasty.co",
    status: "active",
    searchUrl: (query) =>
      `https://tasty.co/search?q=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://tasty.co/recipe/one-pot-garlic-parmesan-pasta",
      "https://tasty.co/recipe/weekday-meal-prep-chicken-burrito-bowls",
      "https://tasty.co/recipe/veggie-garlic-noodles",
      "https://tasty.co/recipe/easy-chicken-fajitas",
      "https://tasty.co/recipe/fluffy-perfect-pancakes",
      "https://tasty.co/recipe/the-best-ever-vegan-brownies",
      "https://tasty.co/recipe/chinese-take-away-style-lemon-chicken",
    ],
  },
  {
    name: "Korean Bapsang",
    origin: "https://www.koreanbapsang.com",
    status: "active",
    searchUrl: (query) =>
      `https://www.koreanbapsang.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://www.koreanbapsang.com/bibimbap/",
      "https://www.koreanbapsang.com/kimchi-fried-rice/",
      "https://www.koreanbapsang.com/dak-galbi/",
      "https://www.koreanbapsang.com/japchae-korean-stir-fried-starch/",
      "https://www.koreanbapsang.com/mandu-korean-dumplings/",
      "https://www.koreanbapsang.com/baechu-kimchi-napa-cabbage-kimchi/",
    ],
  },
  {
    name: "The Woks of Life",
    origin: "https://thewoksoflife.com",
    status: "active",
    searchUrl: (query) =>
      `https://thewoksoflife.com/?s=${encodeURIComponent(query)}`,
    seedUrls: [
      "https://thewoksoflife.com/chicken-lo-mein/",
      "https://thewoksoflife.com/vegetable-fried-rice/",
      "https://thewoksoflife.com/kung-pao-chicken/",
      "https://thewoksoflife.com/mapo-tofu/",
      "https://thewoksoflife.com/chinese-broccoli-stir-fry/",
      "https://thewoksoflife.com/scallion-pancakes/",
      "https://thewoksoflife.com/egg-drop-soup/",
    ],
  },
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "from",
  "give",
  "have",
  "i",
  "in",
  "me",
  "of",
  "on",
  "or",
  "recipe",
  "recipes",
  "the",
  "to",
  "want",
  "with",
]);

const DIET_KEYWORDS: Record<string, string[]> = {
  vegan: ["vegan", "plant-based"],
  vegetarian: ["vegetarian", "meatless"],
  "dairy-free": ["dairy-free", "dairy free", "no dairy"],
  "gluten-free": ["gluten-free", "gluten free"],
};

const DIET_EXCLUSIONS: Record<string, string[]> = {
  vegan: [
    "anchovies",
    "anchovy",
    "bacon",
    "beef",
    "buttermilk",
    "butter",
    "cheddar",
    "cheese",
    "chicken",
    "cream",
    "dairy",
    "egg",
    "eggs",
    "feta",
    "fish",
    "fish sauce",
    "gelatin",
    "ghee",
    "goat cheese",
    "honey",
    "lamb",
    "lard",
    "mayo",
    "mayonnaise",
    "meatball",
    "meatballs",
    "milk",
    "mozzarella",
    "oyster sauce",
    "parmesan",
    "pork",
    "salmon",
    "sausage",
    "shrimp",
    "sour cream",
    "turkey",
    "whey",
    "yogurt",
  ],
  vegetarian: [
    "anchovies",
    "anchovy",
    "bacon",
    "beef",
    "chicken",
    "fish",
    "fish sauce",
    "lamb",
    "lard",
    "meatball",
    "meatballs",
    "oyster sauce",
    "pork",
    "salmon",
    "sausage",
    "shrimp",
    "turkey",
  ],
  "dairy-free": [
    "buttermilk",
    "butter",
    "cheddar",
    "cheese",
    "cream",
    "dairy",
    "feta",
    "ghee",
    "goat cheese",
    "milk",
    "mozzarella",
    "parmesan",
    "sour cream",
    "whey",
    "yogurt",
  ],
  "gluten-free": ["barley", "bread", "flour", "pasta", "soy sauce", "wheat"],
};

const DIRECT_INGREDIENT_KEYWORDS = [
  "beef",
  "broccoli",
  "carrot",
  "cauliflower",
  "cheese",
  "chicken",
  "chickpeas",
  "egg",
  "eggs",
  "fish",
  "lentils",
  "mushroom",
  "mushrooms",
  "noodles",
  "pasta",
  "pork",
  "potato",
  "potatoes",
  "rice",
  "salmon",
  "shrimp",
  "spinach",
  "tofu",
  "turkey",
];

const MEAL_TYPE_KEYWORDS: Record<string, string[]> = {
  breakfast: [
    "breakfast",
    "brunch",
    "morning",
    "pancake",
    "waffle",
    "oat",
    "oats",
    "oatmeal",
    "granola",
    "muffin",
    "toast",
    "egg",
    "eggs",
    "frittata",
    "omelet",
    "omelette",
    "smoothie",
    "porridge",
    "cereal",
  ],
  lunch: ["lunch", "salad", "sandwich", "wrap", "bowl", "soup"],
  dinner: ["dinner", "supper", "main", "entree", "entrée", "pasta", "curry"],
  snack: ["snack", "dip", "bite", "bar", "chips"],
  dessert: ["dessert", "cake", "cookie", "brownie", "pie", "pudding"],
};

const CUISINE_FAMILY_KEYWORDS: Record<string, string[]> = {
  Asian: ["asian"],
  Mediterranean: ["mediterranean"],
  "Middle Eastern": ["middle eastern"],
};

const SPECIFIC_CUISINE_KEYWORDS: Record<string, string[]> = {
  Chinese: [
    "chinese",
    "chinese-inspired",
    "sesame chicken",
    "lo mein",
    "chow mein",
    "fried rice",
    "dumpling",
    "wonton",
    "kung pao",
    "mapo",
    "sichuan",
    "szechuan",
    "dan dan",
    "char siu",
    "bao",
  ],
  Thai: ["thai", "red curry", "green curry", "pad thai", "tom yum"],
  Japanese: ["japanese", "miso", "ramen", "teriyaki", "sushi", "udon"],
  Korean: [
    "korean",
    "kimchi",
    "gochujang",
    "bibimbap",
    "bulgogi",
    "dak galbi",
    "dak-galbi",
    "japchae",
    "mandu",
    "tteokbokki",
  ],
  Vietnamese: ["vietnamese", "pho", "banh mi"],
  Indian: ["indian", "dal", "masala", "tikka", "chhole", "vindaloo"],
  Italian: ["italian", "pasta", "risotto", "gnocchi", "zuppa"],
  Mexican: ["mexican", "taco", "tacos", "burrito", "quesadilla", "enchilada"],
  Greek: ["greek"],
  Lebanese: ["lebanese"],
  Turkish: ["turkish"],
  American: ["american", "bbq", "barbecue"],
  French: ["french"],
  Spanish: ["spanish", "paella"],
};

const CUISINE_FAMILIES: Record<string, string> = {
  Chinese: "Asian",
  Thai: "Asian",
  Japanese: "Asian",
  Korean: "Asian",
  Vietnamese: "Asian",
  Indian: "Asian",
  Greek: "Mediterranean",
  Lebanese: "Middle Eastern",
  Turkish: "Middle Eastern",
};

const COMMON_RECIPE_PENALTY: Record<string, number> = {
  "easy sesame chicken": 6,
  "thai red curry with vegetables": 6,
  "best buddha bowl": 4,
  "spicy sriracha noodles": 4,
  "miso-glazed salmon & veggie sheet pan dinner": 4,
  "vegan ginger sesame noodles with crispy tofu": 4,
  "asian slaw": 4,
  "creamy coconut curry lentils with spinach": 8,
  "1-pot kabocha chickpea miso soup": 8,
  "chicken tikka masala": 5,
  "quick chicken hummus bowl": 4,
  "homemade pasta": 4,
  "creamed spinach": 4,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const REQUEST_TIMEOUT_MS = 9000;
const MAX_RESULTS = 5;
const DIVERSITY_POOL_SIZE = 32;
const MAX_FETCH_CANDIDATES = 96;

class FetchError extends Error {
  isBlocked: boolean;

  constructor(url: string, status: number) {
    super(`Failed to fetch ${url}: ${status}`);
    this.isBlocked = status === 401 || status === 403 || status === 429;
  }
}

export async function findRecipes(
  query: RecipeQuery,
): Promise<RecipeSearchOutput> {
  const intent = classifyRecipeIntent(query.request);
  const normalized = normalizeQuery(intent);
  const searchTerms = buildSearchTerms(intent, normalized);
  const rotation = rotationContext(intent, normalized);
  const candidates = await discoverRecipeUrls(searchTerms);
  const { recipes: parsed, diagnostics } = await fetchRecipeCandidates(candidates);
  const scored = parsed
    .filter((recipe) => passesStrictFilters(recipe, intent))
    .map((recipe) => scoreRecipe(recipe, intent, normalized, rotation))
    .filter((recipe) => passesRelevanceFloor(recipe, intent, normalized))
    .sort((a, b) => b.score - a.score)
    .slice(0, DIVERSITY_POOL_SIZE);
  const ranked = diversifyRecipes(scored);

  return {
    query: {
      original: query.request,
      normalizedTerms: normalized,
      appliedFilters: describeFilters(intent),
      matchedIntent: {
        cuisineFamily: intent.cuisineFamily,
        specificCuisine: intent.specificCuisine,
        mealType: intent.mealType,
        maxTimeMinutes: intent.maxTimeMinutes,
        diet: intent.diet,
        ingredients: intent.ingredients,
        excludeIngredients: intent.excludeIngredients,
        servings: intent.servings,
      },
      sourceSummary: {
        activeSources: SOURCES.filter((source) => source.status === "active").map(
          (source) => source.name,
        ),
        degradedSources: SOURCES.filter((source) => source.status === "degraded").map(
          (source) => source.name,
        ),
        ...diagnostics,
      },
      diversity: {
        rotationDay: rotation.dayKey,
        rotationMode: rotation.mode,
      },
    },
    recipes: ranked,
    fallbackMessage:
      ranked.length < 5
        ? `Found ${ranked.length} real recipe${ranked.length === 1 ? "" : "s"} from the curated source list. I skipped pages that did not expose a complete recipe.`
        : undefined,
    sources: SOURCES.filter((source) => source.status === "active").map(
      (source) => source.name,
    ),
  };
}

function classifyRecipeIntent(request: string): RecipeIntent {
  const diet = inferDiet(request);
  const excludeIngredients = inferExclusions(request).filter(
    (item) =>
      !(
        (diet === "dairy-free" && item === "dairy") ||
        (diet === "gluten-free" && item === "gluten")
      ),
  );

  return {
    request,
    ...inferCuisineIntent(request),
    mealType: inferMealType(request),
    maxTimeMinutes: inferMaxTimeMinutes(request),
    diet,
    ingredients: inferIngredients(request, excludeIngredients),
    excludeIngredients,
    servings: inferServings(request),
  };
}

function inferMealType(request: string) {
  const lower = request.toLowerCase();
  return Object.entries(MEAL_TYPE_KEYWORDS).find(([mealType, keywords]) =>
    keywords.some((keyword) => includesTerm(lower, keyword) || includesTerm(lower, mealType)),
  )?.[0];
}

function inferCuisineIntent(request: string) {
  const lower = request.toLowerCase();
  const specificCuisine = Object.entries(SPECIFIC_CUISINE_KEYWORDS).find(([, keywords]) =>
    keywords.some((keyword) => includesTerm(lower, keyword)),
  )?.[0];
  const explicitFamily = Object.entries(CUISINE_FAMILY_KEYWORDS).find(([, keywords]) =>
    keywords.some((keyword) => includesTerm(lower, keyword)),
  )?.[0];
  const cuisineFamily =
    explicitFamily || (specificCuisine ? CUISINE_FAMILIES[specificCuisine] : undefined);

  return {
    cuisineFamily,
    specificCuisine,
  };
}

function inferDiet(request: string) {
  const lower = request.toLowerCase();
  if (hasPhrase(lower, ["vegan", "plant based", "plant-based"])) return "vegan";
  if (hasPhrase(lower, ["vegetarian", "meatless"])) return "vegetarian";
  if (hasPhrase(lower, ["dairy free", "dairy-free", "no dairy", "without dairy"])) {
    return "dairy-free";
  }
  if (
    hasPhrase(lower, [
      "gluten free",
      "gluten-free",
      "no gluten",
      "without gluten",
    ])
  ) {
    return "gluten-free";
  }
  return undefined;
}

function inferMaxTimeMinutes(request: string) {
  const lower = request.toLowerCase();
  const explicit = lower.match(
    /(?:under|less than|within|in|max|maximum|up to)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:minutes?|mins?|m)\b/,
  );
  if (explicit) return numberFromText(explicit[1]);

  const minuteRecipe = lower.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[-\s]*(?:minutes?|mins?|m)\b/,
  );
  if (minuteRecipe) return numberFromText(minuteRecipe[1]);

  if (hasPhrase(lower, ["half hour", "half-hour"])) return 30;
  if (hasPhrase(lower, ["quick", "fast", "speedy"])) return 30;
  return undefined;
}

function inferServings(request: string) {
  const lower = request.toLowerCase();
  const servingMatch =
    lower.match(/\bfor\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/) ||
    lower.match(/\bserves?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  return servingMatch ? numberFromText(servingMatch[1]) : undefined;
}

function inferExclusions(request: string) {
  const lower = request.toLowerCase();
  const exclusions: string[] = [];
  const patterns = [
    /\b(?:no|without|avoid|exclude)\s+([^.;!?]+)/g,
    /\b(?:don't|dont|do not)\s+(?:include|use|want)\s+([^.;!?]+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of lower.matchAll(pattern)) {
      exclusions.push(...splitIngredientList(stopAtIntentBoundary(match[1])));
    }
  }

  return uniqueTerms(exclusions);
}

function inferIngredients(request: string, exclusions: string[]) {
  const lower = request.toLowerCase();
  const ingredients: string[] = [];
  const cleaned = lower
    .replace(/\b(?:no|without|avoid|exclude)\s+[^.;!?]+/g, " ")
    .replace(/\b(?:under|less than|within|in|max|maximum|up to)\s+\w+\s*(?:minutes?|mins?|m)\b/g, " ");
  const patterns = [
    /\b(?:i have|we have|got|have)\s+([^.;!?]+)/g,
    /\b(?:with|using|use|made with|based on)\s+([^.;!?]+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern)) {
      ingredients.push(...splitIngredientList(stopAtIntentBoundary(match[1])));
    }
  }

  const excluded = new Set(exclusions.map((item) => item.toLowerCase()));
  for (const ingredient of DIRECT_INGREDIENT_KEYWORDS) {
    if (includesTerm(cleaned, ingredient) && !excluded.has(ingredient)) {
      ingredients.push(ingredient);
    }
  }

  return uniqueTerms(ingredients).filter((ingredient) => !excluded.has(ingredient));
}

function stopAtIntentBoundary(value: string) {
  return value
    .split(
      /\b(?:for\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)|under|less than|within|max|maximum|up to|quick|fast|vegan|vegetarian|dairy-free|gluten-free|no|without|avoid|exclude)\b/,
    )[0]
    .trim();
}

function splitIngredientList(value: string) {
  return value
    .replace(/\b(?:ingredients?|recipes?|recipe|meal|dinner|lunch|breakfast)\b/g, " ")
    .split(/,|&|\band\b|\bplus\b|\bwith\b/)
    .map((item) => cleanIntentTerm(item))
    .filter((item) => item.length > 1 && !STOP_WORDS.has(item));
}

function cleanIntentTerm(value: string) {
  return value
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\b(?:some|any|fresh|canned|cooked|raw|leftover|leftovers)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTerms(values: string[]) {
  return [...new Set(values.map(cleanIntentTerm).filter(Boolean))];
}

function numberFromText(value: string) {
  return NUMBER_WORDS[value.toLowerCase()] ?? Number.parseInt(value, 10);
}

function hasPhrase(value: string, phrases: string[]) {
  return phrases.some((phrase) => includesTerm(value, phrase));
}

function normalizeQuery(query: RecipeIntent) {
  const terms = [
    query.request,
    query.specificCuisine,
    query.cuisineFamily,
    query.mealType,
    query.diet,
    ...(query.ingredients ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));

  return [...new Set(terms)].slice(0, 12);
}

function buildSearchTerms(query: RecipeIntent, normalized: string[]) {
  const terms = [
    ...normalized,
    query.specificCuisine,
    query.cuisineFamily,
    query.mealType,
    query.diet,
    ...(query.ingredients ?? []),
    "recipe",
  ].filter((term): term is string => Boolean(term));

  return [...new Set(terms.map((term) => term.toLowerCase()))].join(" ").trim() ||
    "dinner recipe";
}

function rotationContext(
  query: RecipeIntent,
  normalized: string[],
): RotationContext {
  const date = rotationDate();
  const dayKey = date.toISOString().slice(0, 10);
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  const focusedIntent = Boolean(
    query.specificCuisine ||
      query.cuisineFamily ||
      query.diet ||
      query.maxTimeMinutes ||
      query.ingredients?.length ||
      query.excludeIngredients?.length,
  );

  return {
    dayKey,
    dayIndex,
    mode: focusedIntent ? "focused" : "broad",
    queryKey: normalized.join(" ") || cleanIntentTerm(query.request) || "recipe",
  };
}

function rotationDate() {
  const configured = process.env.PANTRYBRAIN_ROTATION_DATE;
  if (configured) {
    const parsed = new Date(`${configured}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function describeFilters(query: RecipeIntent) {
  return [
    query.specificCuisine ? `Cuisine: ${query.specificCuisine}` : undefined,
    !query.specificCuisine && query.cuisineFamily
      ? `Cuisine family: ${query.cuisineFamily}`
      : undefined,
    query.mealType ? `Meal: ${query.mealType}` : undefined,
    query.maxTimeMinutes ? `Max time: ${query.maxTimeMinutes} minutes` : undefined,
    query.diet ? `Diet: ${query.diet}` : undefined,
    query.servings ? `Servings: ${query.servings}` : undefined,
    query.ingredients?.length
      ? `Ingredients: ${query.ingredients.join(", ")}`
      : undefined,
    query.excludeIngredients?.length
      ? `Avoid: ${query.excludeIngredients.join(", ")}`
      : undefined,
  ].filter((filter): filter is string => Boolean(filter));
}

async function discoverRecipeUrls(searchTerms: string) {
  const groups = await Promise.all(
    SOURCES.filter((source) => source.status !== "disabled").map(async (source) => {
      const seedCandidates = prioritizeSeedCandidates(
        source.seedUrls.map((url) => ({ source, url, isSeed: true })),
        searchTerms,
      );
      try {
        const html = await fetchText(source.searchUrl(searchTerms));
        const $ = load(html);
        const urls = new Set<string>();
        $("a[href]").each((_, element) => {
          const href = $(element).attr("href");
          const url = normalizeSourceUrl(href, source);
          if (url && looksLikeRecipeUrl(url)) {
            urls.add(url);
          }
        });
        const discovered = [...urls].map((url) => ({ source, url, isSeed: false }));
        return [
          ...seedCandidates.slice(0, 4),
          ...discovered.slice(0, 4),
          ...seedCandidates.slice(4),
          ...discovered.slice(4, 8),
        ];
      } catch {
        return seedCandidates;
      }
    }),
  );

  const seen = new Set<string>();
  const interleaved: RecipeCandidate[] = [];
  const longestGroup = Math.max(...groups.map((group) => group.length));

  for (let index = 0; index < longestGroup; index += 1) {
    for (const group of groups) {
      const candidate = group[index];
      if (!candidate || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      interleaved.push(candidate);
    }
  }

  return interleaved;
}

function prioritizeSeedCandidates(
  candidates: RecipeCandidate[],
  searchTerms: string,
) {
  const terms = searchTerms
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2 && term !== "recipe");

  return [...candidates].sort(
    (a, b) => scoreCandidateUrl(b.url, terms) - scoreCandidateUrl(a.url, terms),
  );
}

function scoreCandidateUrl(url: string, terms: string[]) {
  const lower = url.toLowerCase().replace(/[-_]/g, " ");
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

async function fetchRecipeCandidates(
  candidates: RecipeCandidate[],
) {
  const diagnostics: SourceDiagnostics = {
    fetched: 0,
    blocked: 0,
    parseFailed: 0,
    parsed: 0,
  };
  const batches = await Promise.all(
    candidates.slice(0, MAX_FETCH_CANDIDATES).map(async (candidate) => {
      try {
        const html = await fetchText(candidate.url);
        diagnostics.fetched += 1;
        const recipe = parseRecipe(html, candidate.url, candidate.source);
        if (!recipe) {
          diagnostics.parseFailed += 1;
          return null;
        }
        diagnostics.parsed += 1;
        return {
          ...recipe,
          isSeed: candidate.isSeed,
          sourceStatus: candidate.source.status,
        };
      } catch (error) {
        diagnostics.fetched += 1;
        if (error instanceof FetchError && error.isBlocked) {
          diagnostics.blocked += 1;
        } else {
          diagnostics.parseFailed += 1;
        }
        return null;
      }
    }),
  );

  const seen = new Set<string>();
  const recipes = batches.filter((recipe): recipe is RecipeResult & {
    isSeed: boolean;
    sourceStatus: RecipeSource["status"];
  } => {
    if (!recipe || seen.has(recipe.url)) return false;
    seen.add(recipe.url);
    return true;
  });

  return { recipes, diagnostics };
}

function diversifyRecipes(recipes: ScoredRecipe[]) {
  const ordered = [...recipes].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });
  const selected: RecipeResult[] = [];
  const sourceCounts = new Map<string, number>();
  const diversityCounts = new Map<string, number>();

  for (const recipe of ordered) {
    if (selected.length >= MAX_RESULTS) break;
    if (!canSelectRecipe(recipe, sourceCounts, diversityCounts, 1)) continue;
    selectRecipe(recipe, selected, sourceCounts, diversityCounts);
  }

  for (const recipe of ordered) {
    if (selected.length >= MAX_RESULTS) break;
    if (selected.some((item) => item.id === recipe.id)) continue;
    if (!canSelectRecipe(recipe, sourceCounts, diversityCounts, 2)) continue;
    selectRecipe(recipe, selected, sourceCounts, diversityCounts);
  }

  return selected;
}

function canSelectRecipe(
  recipe: ScoredRecipe,
  sourceCounts: Map<string, number>,
  diversityCounts: Map<string, number>,
  sourceLimit: number,
) {
  const sourceCount = sourceCounts.get(recipe.source) ?? 0;
  if (sourceCount >= sourceLimit) return false;
  const diversityCount = diversityCounts.get(recipe.diversityKey) ?? 0;
  return diversityCount < 1 || sourceLimit > 1;
}

function selectRecipe(
  recipe: ScoredRecipe,
  selected: RecipeResult[],
  sourceCounts: Map<string, number>,
  diversityCounts: Map<string, number>,
) {
  selected.push(recipe);
  sourceCounts.set(recipe.source, (sourceCounts.get(recipe.source) ?? 0) + 1);
  diversityCounts.set(
    recipe.diversityKey,
    (diversityCounts.get(recipe.diversityKey) ?? 0) + 1,
  );
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "PantryBrain/0.1 (+https://example.com; recipe discovery bot)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new FetchError(url, response.status);
  }

  return response.text();
}

function normalizeSourceUrl(href: string | undefined, source: RecipeSource) {
  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.includes('"')
  ) {
    return null;
  }
  try {
    const url = new URL(href, source.origin);
    if (url.origin !== source.origin) return null;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function looksLikeRecipeUrl(url: string) {
  const lower = url.toLowerCase();
  if (
    lower.endsWith(".jpg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".pdf") ||
    lower.includes("%22") ||
    lower.includes("/about") ||
    lower.includes("/contact") ||
    lower.includes("/faq") ||
    lower.includes("/join") ||
    lower.includes("/shop") ||
    lower.includes("/subscribe") ||
    lower.includes("/category/") ||
    lower.includes("/collection/") ||
    lower.includes("/feature/") ||
    lower.includes("/howto/") ||
    lower.includes("/index/") ||
    lower.includes("/news") ||
    lower.includes("/premium/") ||
    lower.includes("/random") ||
    lower.includes("/recipe-index") ||
    lower.includes("/tag/") ||
    lower.includes("/author/") ||
    lower.includes("/page/")
  ) {
    return false;
  }

  return lower.split("/").filter(Boolean).length >= 3;
}

function parseRecipe(
  html: string,
  url: string,
  source: RecipeSource,
): RecipeResult | null {
  const $ = load(html);
  const jsonRecipe = extractJsonLdRecipe($);
  const recipe = jsonRecipe
    ? parseJsonLdRecipe(jsonRecipe, $, url, source)
    : parseHtmlFallback($, url, source);

  if (
    !recipe ||
    !recipe.title ||
    recipe.ingredients.length < 3 ||
    recipe.instructions.length < 2
  ) {
    return null;
  }

  return recipe;
}

function extractJsonLdRecipe($: CheerioAPI) {
  const scripts = $('script[type="application/ld+json"]')
    .map((_, element) => $(element).text())
    .get();

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script);
      const recipe = findRecipeNode(parsed);
      if (recipe) return recipe as Record<string, unknown>;
    } catch {
      continue;
    }
  }

  return null;
}

function findRecipeNode(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }

  const object = value as Record<string, unknown>;
  const type = object["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => String(item).toLowerCase() === "recipe")) {
    return object;
  }

  return findRecipeNode(object["@graph"]);
}

function parseJsonLdRecipe(
  node: Record<string, unknown>,
  $: CheerioAPI,
  url: string,
  source: RecipeSource,
): RecipeResult {
  const title = textFromUnknown(node.name) || $("h1").first().text();
  const image = imageFromUnknown(node.image) || metaImage($);
  const ingredients = arrayFromUnknown(node.recipeIngredient);
  const instructions = sanitizeInstructionList(
    instructionsFromUnknown(node.recipeInstructions),
  );
  const totalTimeMinutes = durationToMinutes(textFromUnknown(node.totalTime));
  const prepTimeMinutes = durationToMinutes(textFromUnknown(node.prepTime));
  const cookTimeMinutes = durationToMinutes(textFromUnknown(node.cookTime));
  const cuisine = textFromUnknown(node.recipeCuisine);
  const mealType = textFromUnknown(node.recipeCategory);
  const description = cleanText(textFromUnknown(node.description));
  const nutrition = nutritionFromUnknown(node.nutrition);
  const tags = buildTags({
    title,
    description,
    cuisine,
    mealType,
    totalTimeMinutes,
    ingredients,
    keywords: arrayFromUnknown(node.keywords),
  });

  return {
    id: stableId(url),
    title: cleanText(title),
    url,
    source: source.name,
    thumbnail: normalizeThumbnailUrl(absoluteUrl(image, source.origin)),
    description,
    cuisine: cleanText(cuisine),
    mealType: cleanText(mealType),
    totalTimeMinutes,
    prepTimeMinutes,
    cookTimeMinutes,
    servings: textFromUnknown(node.recipeYield),
    tags,
    ingredients,
    instructions,
    nutrition: nutrition.length ? nutrition : undefined,
    attribution: `${source.name} recipe`,
    matchNote: "Matched from recipe metadata.",
    confidenceNotes: [
      "Parsed from schema.org Recipe data.",
      ...missingMetadataNotes({ image, totalTimeMinutes, cuisine, mealType }),
    ],
    score: 0,
  };
}

function parseHtmlFallback(
  $: CheerioAPI,
  url: string,
  source: RecipeSource,
): RecipeResult | null {
  const title = cleanText(
    $("h1").first().text() || $("meta[property='og:title']").attr("content"),
  );
  const ingredients = collectListText($, [
    "[class*='ingredient'] li",
    "[id*='ingredient'] li",
  ]);
  const listInstructions = collectListText($, [
    "[class*='instruction'] li",
    "[class*='direction'] li",
    "[class*='method'] li",
    "[id*='instruction'] li",
    "[id*='method'] li",
  ], 900);
  const instructions = sanitizeInstructionList(
    listInstructions.length >= 2
      ? listInstructions
      : collectInstructionText($, [
          "[class*='recipe-directions']",
          "[class*='recipe-instructions']",
          "[class*='instruction']",
          "[class*='direction']",
          "[class*='method']",
        ]),
  );

  if (!title || ingredients.length < 3 || instructions.length < 2) return null;

  const image = metaImage($);
  const description = cleanText($("meta[name='description']").attr("content"));
  const nutrition = collectNutritionRows($);
  const tags = buildTags({ title, description, ingredients, keywords: [] });

  return {
    id: stableId(url),
    title,
    url,
    source: source.name,
    thumbnail: normalizeThumbnailUrl(absoluteUrl(image, source.origin)),
    description,
    tags,
    ingredients,
    instructions,
    nutrition: nutrition.length ? nutrition : undefined,
    attribution: `${source.name} recipe`,
    matchNote: "Matched from visible recipe content.",
    confidenceNotes: [
      "Parsed from page HTML because Recipe JSON-LD was unavailable.",
      ...missingMetadataNotes({ image }),
    ],
    score: 0,
  };
}

function collectInstructionText($: CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const steps: string[] = [];
    $(selector).each((_, element) => {
      const children = $(element).find("li, p").toArray();
      if (children.length) {
        children.forEach((child) => {
          const text = cleanText($(child).text());
          if (text.length > 8 && text.length < 900) steps.push(text);
        });
        return;
      }

      splitInstructionBlock(cleanText($(element).text())).forEach((step) =>
        steps.push(step),
      );
    });

    const unique = sanitizeInstructionList(steps);
    if (unique.length >= 2) return unique.slice(0, 40);
  }

  return [];
}

function splitInstructionBlock(value: string) {
  return value
    .split(/(?<=\.)\s+(?=(?:Step\s*)?\d+\.?\s+|[A-Z])|\n+/)
    .map(cleanText)
    .filter((step) => step.length > 8 && step.length < 900);
}

function sanitizeInstructionList(steps: string[]) {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const step of steps) {
    for (const candidate of splitInstructionBlock(step)) {
      const normalized = cleanInstructionStep(candidate);
      if (!normalized) continue;
      const key = normalized.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cleaned.push(normalized);
    }
  }

  return cleaned.slice(0, 40);
}

function cleanInstructionStep(value: string) {
  let step = cleanText(value)
    .replace(/^(?:instructions?|directions?|method|preparation|steps?|notes?)\s*:?\s*/i, "")
    .replace(/^(?:step\s*)?\d+[\).:-]?\s*/i, "")
    .replace(/\s*\(?\s*see notes?\s*\)?\.?$/i, "")
    .trim();

  step = step.replace(/^(?:instructions?|directions?|method|preparation|steps?)\s*:?\s*/i, "");
  if (step.length < 8 || step.length > 700) return "";
  if (isBoilerplateInstruction(step)) return "";
  return step;
}

function isBoilerplateInstruction(step: string) {
  const lower = step.toLowerCase();
  if (
    /\b(nutrition|calories|rating|reviews?|subscribe|newsletter|advertisement|sponsored|privacy policy|affiliate|comment|video above|recipe video|jump to recipe|pin this|share this|print recipe)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  if (/^(notes?|tips?|serves?|yield|prep time|cook time|total time)\b/.test(lower)) {
    return true;
  }
  return false;
}

function collectListText($: CheerioAPI, selectors: string[], maxLength = 260) {
  const values = new Set<string>();
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const text = cleanText($(element).text());
      if (text.length > 3 && text.length < maxLength) {
        values.add(text);
      }
    });
    if (values.size >= 3) break;
  }
  return [...values].slice(0, 40);
}

function nutritionFromUnknown(value: unknown): NutritionRow[] {
  if (!value) return [];

  const rows: NutritionRow[] = [];
  const seen = new Set<string>();
  const node = Array.isArray(value) ? value[0] : value;
  if (!node || typeof node !== "object") return [];

  const object = node as Record<string, unknown>;
  for (const [key, rawValue] of Object.entries(object)) {
    if (key.startsWith("@")) continue;
    addNutritionRow(rows, seen, key, nutritionValueFromUnknown(rawValue));
  }

  return rows;
}

function collectNutritionRows($: CheerioAPI): NutritionRow[] {
  const rows: NutritionRow[] = [];
  const seen = new Set<string>();
  const selectors = [
    "[class*='nutrition'] tr",
    "[id*='nutrition'] tr",
    "[class*='nutrition'] li",
    "[id*='nutrition'] li",
    "[class*='nutrient'] li",
    "[class*='nutrition'] dl",
    "[id*='nutrition'] dl",
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const row = $(element);
      if (row.is("tr")) {
        const cells = row.find("th, td").toArray().map((cell) => cleanText($(cell).text()));
        if (cells.length >= 2) {
          addNutritionRow(rows, seen, cells[0], cells.slice(1).join(" "));
        }
        return;
      }

      if (row.is("dl")) {
        const terms = row.find("dt").toArray();
        terms.forEach((term) => {
          const label = cleanText($(term).text());
          const value = cleanText($(term).next("dd").text());
          addNutritionRow(rows, seen, label, value);
        });
        return;
      }

      const label =
        cleanText(row.find("[class*='label'], [class*='name'], strong, b").first().text()) ||
        cleanText(row.find("span").first().text());
      const value =
        cleanText(row.find("[class*='value'], [class*='amount']").first().text()) ||
        cleanText(row.find("span").slice(1).text());

      if (label && value && label !== value) {
        addNutritionRow(rows, seen, label, value);
        return;
      }

      const text = cleanText(row.text());
      const pair = text.match(/^([^:–—-]{3,34})\s*[:–—-]\s*(.{1,42})$/);
      if (pair) addNutritionRow(rows, seen, pair[1], pair[2]);
    });

    if (rows.length >= 3) break;
  }

  return rows.slice(0, 14);
}

function addNutritionRow(
  rows: NutritionRow[],
  seen: Set<string>,
  rawLabel: string,
  rawValue: string,
) {
  const label = normalizeNutritionLabel(rawLabel);
  const value = cleanText(rawValue)
    .replace(/^[:–—-]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const key = label.toLowerCase();

  if (!label || !value || seen.has(key)) return;
  if (/^(0|n\/a|na|unknown)$/i.test(value)) return;
  seen.add(key);
  rows.push({ label, value });
}

function nutritionValueFromUnknown(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return cleanText(String(value));
  }
  if (Array.isArray(value)) {
    return value.map(nutritionValueFromUnknown).filter(Boolean)[0] ?? "";
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const amount =
      textFromUnknown(object.value) ||
      textFromUnknown(object.amount) ||
      textFromUnknown(object.name) ||
      textFromUnknown(object.text);
    const unit = textFromUnknown(object.unitText) || textFromUnknown(object.unitCode);
    return amount && unit ? `${amount} ${unit}` : amount;
  }
  return "";
}

function normalizeNutritionLabel(value: string) {
  const cleaned = cleanText(value)
    .replace(/Content$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();
  const labels: Record<string, string> = {
    serving: "Serving size",
    "serving size": "Serving size",
    servingsize: "Serving size",
    calories: "Calories",
    calorie: "Calories",
    protein: "Protein",
    fat: "Fat",
    "total fat": "Fat",
    saturatedfat: "Saturated fat",
    "saturated fat": "Saturated fat",
    transfat: "Trans fat",
    "trans fat": "Trans fat",
    unsaturatedfat: "Unsaturated fat",
    "unsaturated fat": "Unsaturated fat",
    carbohydrate: "Carbs",
    carbohydrates: "Carbs",
    carb: "Carbs",
    carbs: "Carbs",
    sugar: "Sugar",
    sugars: "Sugar",
    fiber: "Fiber",
    fibre: "Fiber",
    sodium: "Sodium",
    salt: "Salt",
    cholesterol: "Cholesterol",
  };

  if (labels[lower]) return labels[lower];
  const compact = lower.replace(/[^a-z]/g, "");
  if (labels[compact]) return labels[compact];
  if (
    !/\b(serving|calories?|protein|fat|carbs?|carbohydrates?|sugars?|fiber|fibre|sodium|salt|cholesterol)\b/i.test(
      cleaned,
    )
  ) {
    return "";
  }

  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean)[0] ?? "";
  return "";
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

function arrayFromUnknown(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(",")
      .map(cleanText)
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.map(textFromUnknown).map(cleanText).filter(Boolean);
}

function instructionsFromUnknown(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/\n+|(?<=\.)\s+(?=[A-Z])/)
      .map(cleanText)
      .filter((step) => step.length > 8);
  }
  if (!Array.isArray(value)) {
    return instructionEntriesFromUnknown(value)
      .map(cleanText)
      .filter((step) => step.length > 8);
  }

  return value
    .flatMap(instructionEntriesFromUnknown)
    .map(cleanText)
    .filter((step) => step.length > 8);
}

function instructionEntriesFromUnknown(step: unknown): string[] {
  if (typeof step === "string") return [step];
  if (!step || typeof step !== "object") return [];

  const object = step as Record<string, unknown>;
  const nested = object.itemListElement ?? object.steps;
  const directText = textFromUnknown(object.text);

  if (Array.isArray(nested)) {
    const nestedSteps = nested.flatMap(instructionEntriesFromUnknown);
    return directText ? [directText, ...nestedSteps] : nestedSteps;
  }

  const name = textFromUnknown(object.name);
  return directText || name ? [directText || name] : [];
}

function imageFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => ({
        url: imageFromUnknown(item),
        score: imageCandidateScore(item),
      }))
      .filter((item) => item.url)
      .sort((a, b) => b.score - a.score)[0]?.url ?? "";
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return textFromUnknown(object.url) || textFromUnknown(object.contentUrl);
  }
  return "";
}

function imageCandidateScore(value: unknown) {
  if (typeof value === "string") return imageUrlScore(value);
  if (!value || typeof value !== "object") return 0;

  const object = value as Record<string, unknown>;
  const width = numberFromUnknown(object.width);
  const height = numberFromUnknown(object.height);
  const url = textFromUnknown(object.url) || textFromUnknown(object.contentUrl);
  return width * height || imageUrlScore(url);
}

function imageUrlScore(value: string) {
  const widths = [...value.matchAll(/(?:^|[-_/=])(\d{3,4})(?:x\d{3,4})?(?=[-_.?/]|$)/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);
  return widths.length ? Math.max(...widths) : 0;
}

function metaImage($: CheerioAPI) {
  return (
    $("meta[property='og:image']").attr("content") ||
    $("meta[name='twitter:image']").attr("content") ||
    ""
  );
}

function durationToMinutes(value: string) {
  if (!value) return undefined;
  const iso = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso) {
    return Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0);
  }

  const hours = value.match(/(\d+)\s*(?:hours?|hrs?|h)/i);
  const minutes = value.match(/(\d+)\s*(?:minutes?|mins?|m)/i);
  const total = Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0);
  return total || undefined;
}

function buildTags(input: {
  title: string;
  description?: string;
  cuisine?: string;
  mealType?: string;
  totalTimeMinutes?: number;
  ingredients: string[];
  keywords: string[];
}) {
  const explicitDietText = [
    input.title,
    input.description,
    input.cuisine,
    input.mealType,
    ...input.keywords,
  ]
    .join(" ")
    .toLowerCase();
  const tags = new Set<string>();

  if (input.cuisine) tags.add(cleanText(input.cuisine));
  if (input.mealType) tags.add(cleanText(input.mealType));
  if (input.totalTimeMinutes && input.totalTimeMinutes <= 30) tags.add("quick");

  for (const [diet, keywords] of Object.entries(DIET_KEYWORDS)) {
    if (keywords.some((keyword) => includesTerm(explicitDietText, keyword))) {
      tags.add(diet);
    }
  }

  return [...tags].filter(Boolean).slice(0, 8);
}

function passesStrictFilters(recipe: RecipeResult, query: RecipeIntent) {
  const haystack = recipeText(recipe);
  const excluded = (query.excludeIngredients ?? []).map((item) => item.toLowerCase());
  if (excluded.some((item) => includesTerm(haystack, item))) return false;

  const diet = query.diet?.toLowerCase();
  if (diet && DIET_EXCLUSIONS[diet]) {
    return !hasAnyTerm(haystack, DIET_EXCLUSIONS[diet]);
  }

  return true;
}

function scoreRecipe(
  recipe: RecipeResult & {
    isSeed?: boolean;
    sourceStatus?: RecipeSource["status"];
  },
  query: RecipeIntent,
  normalizedTerms: string[],
  rotation: RotationContext,
) {
  const haystack = recipeText(recipe);
  let score = 10;
  const notes: string[] = [];

  for (const term of normalizedTerms) {
    if (includesTerm(haystack, term)) score += 2;
  }

  for (const ingredient of query.ingredients ?? []) {
    if (recipeHasRequestedIngredient(recipe, ingredient)) score += 7;
  }

  if (query.specificCuisine) {
    if (specificCuisineMatches(recipe, query.specificCuisine)) score += 24;
    else score -= 30;
  } else if (query.cuisineFamily) {
    if (cuisineFamilyMatches(recipe, query.cuisineFamily)) score += 12;
    else score -= 10;
  }
  if (query.mealType) {
    if (mealTypeMatches(recipe, query.mealType)) score += 18;
    else score -= isStrictMealType(query.mealType) ? 22 : 4;
  }
  if (query.maxTimeMinutes && recipe.totalTimeMinutes) {
    if (recipe.totalTimeMinutes <= query.maxTimeMinutes) score += 8;
    else score -= 6;
  }
  if (query.diet && includesTerm(haystack, query.diet.toLowerCase())) score += 5;
  if (recipe.thumbnail) score += 1;
  if (recipe.totalTimeMinutes) score += 1;
  if (recipe.isSeed) score -= seedPenalty(recipe, query);
  if (recipe.sourceStatus === "degraded") score -= 4;
  score -= COMMON_RECIPE_PENALTY[recipe.title.toLowerCase()] ?? 0;
  score += dailyRotationScore(recipe, rotation);

  if (query.specificCuisine && specificCuisineMatches(recipe, query.specificCuisine)) {
    notes.push(`${query.specificCuisine}${query.mealType ? ` ${query.mealType}` : ""} match.`);
  } else if (query.cuisineFamily && cuisineFamilyMatches(recipe, query.cuisineFamily)) {
    notes.push(`${query.cuisineFamily}${query.mealType ? ` ${query.mealType}` : ""} match.`);
  } else if (query.ingredients?.length) {
    const matched = query.ingredients.filter((ingredient) =>
      recipeHasRequestedIngredient(recipe, ingredient),
    );
    notes.push(
      matched.length
        ? `Uses ${matched.join(", ")}.`
        : "No requested pantry ingredients were clearly listed.",
    );
  }

  if (query.maxTimeMinutes) {
    notes.push(
      recipe.totalTimeMinutes
        ? `${recipe.totalTimeMinutes} minutes total.`
        : "Total time was not published by the source.",
    );
  }

  if (query.mealType) {
    notes.push(
      mealTypeMatches(recipe, query.mealType)
        ? `Fits ${query.mealType}.`
        : `${query.mealType} fit is unclear from the source metadata.`,
    );
  }

  return {
    ...recipe,
    score,
    matchNote: notes[0] ?? recipe.matchNote,
    confidenceNotes: [...recipe.confidenceNotes, ...notes.slice(1)],
    diversityKey: diversityKey(recipe),
  };
}

function passesRelevanceFloor(
  recipe: RecipeResult,
  query: RecipeIntent,
  normalizedTerms: string[],
) {
  const hasStructuredIntent = Boolean(
    query.specificCuisine ||
      query.cuisineFamily ||
      query.mealType ||
      query.diet ||
      query.maxTimeMinutes ||
      query.ingredients?.length,
  );
  const broadTerms = new Set([
    "breakfast",
    "dinner",
    "lunch",
    "quick",
    "easy",
    "healthy",
    "meal",
    "snack",
  ]);
  const specificTerms = normalizedTerms.filter((term) => !broadTerms.has(term));

  if (query.mealType && contradictsMealType(recipe, query.mealType)) {
    return false;
  }

  if (
    query.specificCuisine &&
    (!specificCuisineMatches(recipe, query.specificCuisine) ||
      conflictsWithSpecificCuisine(recipe, query.specificCuisine))
  ) {
    return false;
  }

  if (
    !query.specificCuisine &&
    query.cuisineFamily &&
    !cuisineFamilyMatches(recipe, query.cuisineFamily)
  ) {
    return false;
  }

  if (
    query.ingredients?.length &&
    !query.ingredients.some((ingredient) => recipeHasRequestedIngredient(recipe, ingredient))
  ) {
    return false;
  }

  if (query.mealType === "dinner" && isSideOnly(recipe)) {
    return false;
  }

  if (
    query.maxTimeMinutes &&
    recipe.totalTimeMinutes &&
    recipe.totalTimeMinutes > query.maxTimeMinutes
  ) {
    return false;
  }

  if (hasStructuredIntent || specificTerms.length < 3) {
    return !query.mealType || !isStrictMealType(query.mealType)
      ? true
      : mealTypeMatches(recipe, query.mealType);
  }

  return countTermMatches(recipeText(recipe), specificTerms) >= 2;
}

function specificCuisineMatches(recipe: RecipeResult, cuisine: string) {
  const haystack = recipeMealText(recipe);
  const keywords = SPECIFIC_CUISINE_KEYWORDS[cuisine] ?? [cuisine];
  return keywords.some((keyword) => includesTerm(haystack, keyword));
}

function conflictsWithSpecificCuisine(recipe: RecipeResult, cuisine: string) {
  const title = recipe.title.toLowerCase();
  const conflictTerms: Record<string, string[]> = {
    Chinese: [
      "bibimbap",
      "bulgogi",
      "dak galbi",
      "dak-galbi",
      "gochujang",
      "japchae",
      "kimchi",
      "korean",
      "mandu",
      "miso",
      "pad thai",
      "ramen",
      "sushi",
      "teriyaki",
      "thai",
      "tteokbokki",
      "udon",
    ],
    Thai: ["ramen", "miso", "sushi", "teriyaki", "chinese", "kung pao"],
    Japanese: ["thai", "kung pao", "chinese", "tikka", "masala"],
    Korean: ["thai", "ramen", "tikka", "masala"],
    Indian: ["thai", "ramen", "miso", "sushi", "teriyaki"],
    Italian: ["thai", "miso", "sushi", "tikka", "masala", "taco", "burrito"],
    Mexican: ["thai", "miso", "sushi", "tikka", "masala", "pasta"],
  };

  return (conflictTerms[cuisine] ?? []).some((term) => includesTerm(title, term));
}

function cuisineFamilyMatches(recipe: RecipeResult, cuisineFamily: string) {
  const haystack = recipeMealText(recipe);
  const familyKeywords = CUISINE_FAMILY_KEYWORDS[cuisineFamily] ?? [cuisineFamily];
  if (familyKeywords.some((keyword) => includesTerm(haystack, keyword))) return true;

  return Object.entries(CUISINE_FAMILIES).some(
    ([specificCuisine, family]) =>
      family === cuisineFamily && specificCuisineMatches(recipe, specificCuisine),
  );
}

function recipeHasRequestedIngredient(recipe: RecipeResult, ingredient: string) {
  const normalized = ingredient.toLowerCase().trim();
  if (!normalized) return false;

  const title = recipe.title.toLowerCase();
  if (includesTerm(title, normalized)) return true;

  return recipe.ingredients.some((line) =>
    ingredientLineMatches(line.toLowerCase(), normalized),
  );
}

function ingredientLineMatches(line: string, ingredient: string) {
  if (!includesTerm(line, ingredient) && !ingredientVariantMatches(line, ingredient)) {
    return false;
  }

  if (ingredient === "chicken") {
    return (
      !hasPhrase(line, ["chicken broth", "chicken stock", "chicken bouillon"]) &&
      !includesTerm(line, "optional")
    );
  }

  return true;
}

function ingredientVariantMatches(line: string, ingredient: string) {
  if (ingredient.endsWith("s")) {
    return includesTerm(line, ingredient.slice(0, -1));
  }
  return includesTerm(line, `${ingredient}s`);
}

function dailyRotationScore(recipe: RecipeResult, rotation: RotationContext) {
  const cohortCount = rotation.mode === "broad" ? 4 : 6;
  const recipeCohort = hashNumber(
    `${rotation.queryKey}|${diversityKey(recipe)}`,
  ) % cohortCount;
  const todayCohort = rotation.dayIndex % cohortCount;
  const yesterdayCohort = (rotation.dayIndex + cohortCount - 1) % cohortCount;
  const stableJitter =
    hashNumber(`${rotation.dayKey}|${rotation.queryKey}|${recipe.id}`) / 0xffffffff;

  if (rotation.mode === "broad") {
    const cohortScore =
      recipeCohort === todayCohort
        ? 16
        : recipeCohort === yesterdayCohort
          ? -12
          : 0;
    return cohortScore + stableJitter * 8;
  }

  const cohortScore =
    recipeCohort === todayCohort ? 4 : recipeCohort === yesterdayCohort ? -3 : 0;
  return cohortScore + stableJitter * 3;
}

function seedPenalty(recipe: RecipeResult, query: RecipeIntent) {
  const strongMatch =
    (query.specificCuisine && specificCuisineMatches(recipe, query.specificCuisine)) ||
    (query.cuisineFamily && cuisineFamilyMatches(recipe, query.cuisineFamily)) ||
    (query.mealType && mealTypeMatches(recipe, query.mealType)) ||
    query.ingredients?.some((ingredient) => recipeHasRequestedIngredient(recipe, ingredient));

  return strongMatch ? 1 : 8;
}

function diversityKey(recipe: RecipeResult) {
  return [
    detectSpecificCuisine(recipe) ?? detectCuisineFamily(recipe) ?? "general",
    canonicalMealType(recipe) ?? "meal",
    normalizeTitleForDiversity(recipe.title),
  ].join("|");
}

function normalizeTitleForDiversity(title: string) {
  return title
    .toLowerCase()
    .replace(/\b(?:easy|best|quick|simple|homemade|vegan|vegetarian)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
}

function detectSpecificCuisine(recipe: RecipeResult) {
  return Object.keys(SPECIFIC_CUISINE_KEYWORDS).find((cuisine) =>
    specificCuisineMatches(recipe, cuisine),
  );
}

function detectCuisineFamily(recipe: RecipeResult) {
  return Object.keys(CUISINE_FAMILY_KEYWORDS).find((family) =>
    cuisineFamilyMatches(recipe, family),
  );
}

function canonicalMealType(recipe: RecipeResult) {
  return Object.keys(MEAL_TYPE_KEYWORDS).find((mealType) =>
    mealTypeMatches(recipe, mealType),
  );
}

function isSideOnly(recipe: RecipeResult) {
  const text = recipeMealText(recipe);
  const side = hasPhrase(text, ["side", "side dish", "salad", "dressing"]);
  const main = hasPhrase(text, ["dinner", "main", "entree", "entrée", "main course"]);
  return side && !main;
}

function mealTypeMatches(recipe: RecipeResult, mealType: string) {
  const normalizedMealType = mealType.toLowerCase();
  const haystack = recipeMealText(recipe);
  const keywords = MEAL_TYPE_KEYWORDS[normalizedMealType] ?? [normalizedMealType];
  return keywords.some((keyword) => includesTerm(haystack, keyword));
}

function contradictsMealType(recipe: RecipeResult, mealType: string) {
  const normalizedMealType = mealType.toLowerCase();
  const haystack = recipeMealText(recipe);

  if (
    normalizedMealType === "dinner" &&
    mealTypeMatches(recipe, "breakfast") &&
    !hasPhrase(haystack, ["dinner", "supper"])
  ) {
    return true;
  }

  const conflictingMealTypes = Object.keys(MEAL_TYPE_KEYWORDS).filter(
    (item) => item !== normalizedMealType,
  );
  const softMealTypes = new Set(["lunch", "dinner"]);

  return conflictingMealTypes.some((conflict) => {
    if (softMealTypes.has(conflict)) return false;
    return mealTypeMatches(recipe, conflict) && !mealTypeMatches(recipe, mealType);
  });
}

function isStrictMealType(mealType: string) {
  return ["breakfast", "dessert", "snack"].includes(mealType.toLowerCase());
}

function countTermMatches(value: string, terms: string[]) {
  return terms.reduce((count, term) => count + (value.includes(term) ? 1 : 0), 0);
}

function recipeText(recipe: RecipeResult) {
  return [
    recipe.title,
    recipe.description,
    recipe.cuisine,
    recipe.mealType,
    recipe.source,
    ...recipe.tags,
    ...recipe.ingredients,
  ]
    .join(" ")
    .toLowerCase();
}

function recipeMealText(recipe: RecipeResult) {
  return [
    recipe.title,
    recipe.description,
    recipe.cuisine,
    recipe.mealType,
    ...recipe.tags,
  ]
    .join(" ")
    .toLowerCase();
}

function includesTerm(value: string, term: string) {
  const normalized = term.toLowerCase().trim();
  if (!normalized) return false;
  if (normalized.includes(" ")) return value.includes(normalized);
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`).test(
    value,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function missingMetadataNotes(input: {
  image?: string;
  totalTimeMinutes?: number;
  cuisine?: string;
  mealType?: string;
}) {
  return [
    !input.image ? "No thumbnail was published in recipe metadata." : undefined,
    !input.totalTimeMinutes ? "Total time was not published in recipe metadata." : undefined,
    !input.cuisine ? "Cuisine is inferred or unspecified." : undefined,
    !input.mealType ? "Meal type is inferred or unspecified." : undefined,
  ].filter((note): note is string => Boolean(note));
}

function cleanText(value: string | undefined) {
  const compact = (value ?? "").replace(/\s+/g, " ").trim();
  if (!compact.includes("&")) return compact;
  return load(`<span>${compact}</span>`)("span").text().replace(/\s+/g, " ").trim();
}

function absoluteUrl(value: string, origin: string) {
  if (!value) return undefined;
  try {
    return new URL(value, origin).toString();
  } catch {
    return undefined;
  }
}

function normalizeThumbnailUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const resize = url.searchParams.get("resize");
    if (resize) {
      const [width = 0, height = 0] = resize
        .split(",")
        .map((part) => Number.parseInt(part, 10) || 0);
      if (width && width < 900) {
        url.searchParams.set("resize", height ? "900,820" : "900:*");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function stableId(url: string) {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

function hashNumber(value: string) {
  return Number.parseInt(
    createHash("sha1").update(value).digest("hex").slice(0, 8),
    16,
  );
}

function hasAnyTerm(value: string, needles: string[]) {
  return needles.some((needle) => includesTerm(value, needle));
}
