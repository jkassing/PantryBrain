# PantryBrain

PantryBrain is a GPT app for finding real recipes from real cooking websites. It is built with [Skybridge](https://docs.skybridge.tech/) as a conversational MCP app: the model handles navigation, PantryBrain handles recipe search and parsing, and the UI gives the user a polished recipe-browsing surface inside the chat.

The core idea is simple: ask naturally, get trustworthy recipe cards. No forms, no dashboards, no generated fake recipes.

## What It Does

- Accepts one natural-language request, such as `Chinese dinner recipes`, `quick vegetarian lunch`, or `I have chickpeas, rice, and spinach`.
- Internally classifies intent for meal type, cuisine, time, diet, ingredients, exclusions, and servings.
- Searches a curated allowlist of real recipe websites.
- Parses recipe pages, preferring `schema.org/Recipe` JSON-LD.
- Returns up to five complete recipes with source URLs, thumbnails, metadata, ingredients, steps, and optional source-backed nutrition.
- Renders a cinematic card carousel with peeking neighbors, swipe/click navigation, and an in-place expanded recipe view.
- Keeps the model in the loop with Skybridge view state and `data-llm` context.

## Product Principles

PantryBrain is designed specifically as a GPT app, not a ported web app.

- Language over forms: the public tool input is only `request`.
- Front-load data: one tool call returns everything the view needs.
- Real sources only: no invented recipes, thumbnails, steps, nutrition, or dietary labels.
- Single flow: recipe cards and full recipe details live in one view.
- Model-visible state: selected recipe, active card, expanded state, servings display, unit system, and active recipe tab are exposed back to the model.

## Demo Flow

Example prompts:

```text
Give me a recipe for dinner
I want Chinese dinner recipes
I want a quick vegetarian recipe
I have chickpeas, rice, and spinach
Chicken lunch recipe
Dinner for 2 under 30 minutes, no chicken
```

PantryBrain shows a carousel of up to five recipe cards. The user can swipe the active card or click the visible left/right neighbor cards. Clicking the active card opens the full recipe in place.

The expanded recipe view includes:

- Hero image, title, description, metadata, and source link.
- Ingredients with portion scaling.
- Metric-by-default display with conservative imperial conversion.
- Cleaned cooking steps.
- Optional `Nutrition` tab when nutrition was parsed from the source.

Nutrition is never estimated and is not scaled by the portion controls.

## Recipe Sources

PantryBrain currently uses this active curated allowlist:

- Budget Bytes
- Minimalist Baker
- Love and Lemons
- Cookie and Kate
- BBC Good Food
- Smitten Kitchen
- RecipeTin Eats
- Pinch of Yum
- Tasty
- Korean Bapsang
- The Woks of Life

Sites with persistent bot protection were removed rather than used as unreliable filler. If a source page cannot be fetched or parsed into a complete recipe, PantryBrain skips it.

## Relevance Strategy

PantryBrain favors fewer high-confidence results over filling the carousel with weak matches.

- Specific cuisines, such as Chinese or Korean, are stricter than broad families such as Asian.
- Meal type conflicts are filtered when obvious.
- Ingredient requests require a requested ingredient match.
- Dietary and allergy exclusions are strict when they can be checked from ingredients.
- Vegan and vegetarian display tags are source-backed only.
- Broad searches use deterministic daily rotation so repeated dinner searches can feel fresh over time.

## Architecture

```text
src/
├── server.ts                    # Skybridge MCP server and find_recipes tool
├── recipes.ts                   # Intent parsing, scraping, extraction, ranking, filtering
├── types.ts                     # Tool and recipe data contracts
├── views/
│   ├── recipe-results.tsx       # GPT app view: carousel + expanded recipe card
│   └── images/
│       └── pantrybrain-lockup.png
├── helpers.ts                   # View/tool helper utilities
└── index.css                    # Product UI styling
```

The public tool contract is intentionally small:

```ts
find_recipes({
  request: "quick vegetarian dinner with rice"
})
```

The returned `structuredContent` contains the normalized query summary, matched intent, source diagnostics, recipe results, fallback message, and source list.

## Tech Stack

- Skybridge for GPT/MCP app structure and view binding.
- React for the app view.
- TypeScript for server and frontend code.
- Cheerio for HTML parsing.
- Lucide React for UI icons.
- Alpic deployment support.

## Local Development

### Prerequisites

- Node.js `>=24.14.1`
- npm

### Install

```bash
npm install
```

### Run DevTools

```bash
npm run dev
```

This starts the local Skybridge server and DevTools UI. Open the printed local URL, select `find_recipes`, enter a natural-language request, and run the tool.

To test with a remote-accessible tunnel:

```bash
npm run dev:tunnel
```

### Build

```bash
npm run build
```

### Start Production Build

```bash
npm run start
```

### Deploy

```bash
npm run deploy
```

## Testing Checklist

Use Skybridge DevTools with these requests:

- `dinner recipes`
- `Chinese dinner recipes`
- `Asian dinner recipes`
- `quick vegetarian recipe`
- `I have chickpeas, rice, and spinach`
- `breakfast recipe`
- `chicken lunch recipe`
- `dinner for 2 under 30 minutes, no chicken`

Verify:

- Only the `request` field is exposed.
- Recipes have real source URLs.
- Ingredients and steps are complete enough to cook from.
- Specific cuisine requests do not drift into unrelated cuisines.
- Diet tags are not inferred from missing ingredients.
- The carousel opens recipes in place and keeps view state synchronized.
- Nutrition tabs appear only when source nutrition was parsed.

## Limitations

- Scraping is best-effort and source pages can change.
- Nutrition is shown only when the source provides parseable nutrition data.
- Ingredient scaling and unit conversion are conservative and leave ambiguous text unchanged.
- PantryBrain uses deterministic local intent parsing, not an external recipe API or LLM classifier.

## Project Notes

`SPEC.md` is the product source of truth for implementation decisions, UX constraints, source policy, and testing expectations.
