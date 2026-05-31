import { McpServer } from "skybridge/server";
import { z } from "zod";
import { findRecipes } from "./recipes.js";

const recipeDomains = [
  "https://www.budgetbytes.com",
  "https://minimalistbaker.com",
  "https://www.loveandlemons.com",
  "https://cookieandkate.com",
  "https://www.bbcgoodfood.com",
  "https://smittenkitchen.com",
  "https://www.recipetineats.com",
  "https://pinchofyum.com",
  "https://tasty.co",
  "https://www.koreanbapsang.com",
  "https://thewoksoflife.com",
  "https://images.immediate.co.uk",
  "https://cdn.loveandlemons.com",
  "https://cdn.minimalistbaker.com",
  "https://img.buzzfeed.com",
];

const server = new McpServer(
  {
    name: "pantrybrain",
    version: "0.1.0",
  },
  { capabilities: {} },
).registerTool(
  {
    name: "find_recipes",
    title: "Find real recipes",
    description:
      "Find up to five real recipes from curated cooking websites and show them in an interactive PantryBrain recipe view. Pass the user's full natural-language request as-is; PantryBrain internally infers cuisine, meal type, time, diet, ingredients, exclusions, and servings.",
    inputSchema: {
      request: z
        .string()
        .min(1)
        .describe(
          "The user's full natural-language recipe request, including any cuisine, meal, time, diet, ingredients, exclusions, or servings.",
        ),
    },
    annotations: {
      title: "Find recipes",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    _meta: {
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Searching real recipe sites...",
      "openai/toolInvocation/invoked": "Recipe options ready.",
    },
    view: {
      component: "recipe-results",
      description: "PantryBrain recipe recommendations",
      prefersBorder: true,
      csp: {
        resourceDomains: [
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
          ...recipeDomains,
        ],
        connectDomains: recipeDomains,
        redirectDomains: recipeDomains,
      },
    },
  },
  async (input) => {
    const result = await findRecipes(input);
    const summary =
      result.recipes.length > 0
        ? `Found ${result.recipes.length} real recipe option${result.recipes.length === 1 ? "" : "s"}: ${result.recipes.map((recipe) => recipe.title).join(", ")}.`
        : "I could not find complete real recipes from the curated source list for that request.";

    return {
      structuredContent: result,
      content: [
        {
          type: "text",
          text: `${summary} ${result.fallbackMessage ?? ""}`.trim(),
        },
      ],
      isError: false,
    };
  },
);

if (process.env.NODE_ENV === "production") {
  const { default: manifest } = await import("./vite-manifest.js");
  server.setViteManifest(manifest);
}

export default await server.run();

export type AppType = typeof server;
