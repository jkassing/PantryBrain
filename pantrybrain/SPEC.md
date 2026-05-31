# PantryBrain Spec

PantryBrain is a ChatGPT/GPT recipe helper app built with Skybridge. It helps the user discover real recipes from real websites and inspect the selected recipe inside a single conversational view.

## Product Goal

- The model calls one front-loaded tool when the user asks for cooking ideas.
- The model passes the user's request as language; PantryBrain should infer intent internally instead of exposing form-like fields.
- The tool scrapes a curated set of recipe websites and returns everything the view needs in one response.
- The view shows up to five recipe options as a polished looping carousel with left/right peeking cards and replaces the deck with the complete recipe when the user selects a card.
- User selections are synced back to the model with Skybridge view state and `data-llm`.

## Source Policy

PantryBrain v1 only returns recipes scraped from this active allowlist. Sites that consistently return bot-protection pages are excluded instead of being used as low-quality fallback sources.

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

Recipe pages are parsed from `schema.org/Recipe` JSON-LD when possible. HTML fallback is allowed only when a title, URL, ingredients, and instructions are clearly present. Source-backed nutrition may be parsed from `schema.org/NutritionInformation` or clearly labeled nutrition tables/lists. PantryBrain must not invent recipes, thumbnails, sources, instructions, times, dietary labels, or nutrition values.

## Tool Contract

Tool: `find_recipes`

Inputs:

- `request`: required natural-language recipe request

PantryBrain deterministically classifies the request into internal intent signals: cuisine, meal type, maximum time, diet, pantry ingredients, ingredient exclusions, and servings. These signals are not public tool inputs.

Output:

- `query`: normalized summary used for search/ranking
- `query.matchedIntent`: canonical inferred intent, including broad cuisine family and exact cuisine when detected
- `query.sourceSummary`: per-run source health totals for fetched, blocked, parse-failed, and parsed pages
- `recipes`: up to five real parsed recipes
- `fallbackMessage`: message shown when fewer than five suitable recipes are found
- `sources`: allowlisted source names

Each recipe includes title, URL, source site, thumbnail when found, time/serving metadata when found, tags, ingredients, instructions, optional source-backed nutrition rows, attribution, match note, and confidence notes.

## View Behavior

- `recipe-results` is the only PantryBrain view.
- It renders a branded PantryBrain header using the provided PantryBrain lockup image instead of separate logo and wordmark text.
- It uses a playful AI-chef visual direction: warm food-forward color accents, polished microinteractions, and no extra navigation.
- It renders a cinematic looping recipe carousel inspired by editorial card galleries: one upright active recipe card with a large image cap, clean content block, and softened left/right preview cards peeking from the stage edges.
- The carousel incorporates the logo palette with restrained teal and saffron accents in the active dot, source label, metadata icons, card glow, and side fades.
- The initial view has no expanded recipe.
- Users can move through cards by clicking the visible left/right neighbor cards or by dragging/swiping the active card; card changes animate smoothly as cards slide between preview and active positions and respect reduced-motion preferences.
- Carousel position uses five compact display-only dots below the card stage, with the active dot enlarged.
- Deck cards use fixed responsive dimensions; image ratios, long titles, descriptions, and wrapping tags must not resize individual cards.
- Selecting the front card replaces the deck with the full recipe in the same surface.
- The full recipe view has a compact close button inside the card, polished chef-card typography, a best-effort portion scaler, metric-by-default ingredient display with conservative imperial conversion, and conservatively cleaned steps that preserve all source cooking instructions.
- When source nutrition exists, the expanded card shows `Recipe` and `Nutrition` tabs. Nutrition renders as a clean source-backed table and is not estimated, generated, or scaled with the portion control. If no credible nutrition is parsed, no nutrition tab appears.
- Selection and expansion use `useViewState`.
- The root, deck, and selected recipe region include `data-llm` summaries.
- External source links open with `useOpenExternal`.
- No menus, dashboards, forms, separate detail pages, or lazy-loaded recipe details.

## Filtering

PantryBrain uses balanced filtering:

- Explicit dietary/allergy exclusions are strict when they can be checked from ingredients.
- Cuisine, time, ingredients-on-hand, and meal type affect ranking.
- Cuisine, meal type, quickness, diet, servings, ingredients, and exclusions are inferred from natural language.
- Specific cuisine requests such as Chinese, Thai, Japanese, Korean, Indian, Italian, or Mexican are stricter than broad cuisine-family requests such as Asian.
- Seed recipes are low-priority fallback unless they strongly match the inferred intent.
- Broad requests such as dinner ideas use deterministic daily rotation after relevance filtering so repeated searches on different days surface fresher options.
- Explicit breakfast, snack, and dessert requests should exclude obvious non-matches.
- Ingredient and diet checks use term-aware matching rather than raw substring matching.
- Displayed dietary tags are source-backed only; PantryBrain must not add vegan, vegetarian, dairy-free, or other `*-inferred` tags from the absence of excluded ingredients.
- Missing or uncertain metadata is labeled instead of invented.
- If fewer than five high-confidence matches exist, return fewer recipes with a fallback note.

## Testing

- Build with `npm run build`.
- Test via Skybridge DevTools.
- Scenarios: dinner, Asian recipe, quick vegetarian, ingredients-on-hand, no dairy, breakfast, dinner for 2 under 30 minutes with no chicken, and too-few matches.
- Verify every result has a real URL, ingredients, instructions, source attribution, and selection state visible to the model.
