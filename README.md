# Collected Recipes

A mobile-first site that uses
[GitHub Copilot SDK](https://github.com/github/copilot-sdk) and GPT-5.6 Luna to
turn a recipe page into a clean, copyable ingredient list and instructions.

## Setup

Requirements:

- Node.js 20.19+ or 22.12+
- GitHub Copilot access

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. When no token is configured, the SDK uses the
locally signed-in Copilot user. For a hosted environment, set
`COPILOT_GITHUB_TOKEN`. A FoodData Central key is recommended for nutrition;
local development falls back to USDA's heavily rate-limited `DEMO_KEY`.

Production is private-only. Set `RECIPE_PUBLIC_BASE_URL` to the exact HTTPS
origin and `RECIPE_REQUIRE_TAILSCALE_IDENTITY=true`, then expose the process
only through Tailscale Serve. Production recipe requests fail closed when
either setting is missing or unsafe. Tailscale identity is required for every
`/api/recipes` request, and mutations also require an exact browser `Origin`.
`GET /api/health` remains available to loopback health checks.

## How it works

1. The browser posts either a recipe URL to `POST /api/recipes/extract` or one
   or two recipe images to `POST /api/recipes/extract-images`, with optional
   special instructions.
2. The server rejects local/private addresses, follows up to three validated
   redirects, and reads at most 2 MB of HTML.
3. For URLs, the server prefers authoritative JSON-LD or recipe-card
   ingredients and instruction steps, then adds bounded structured data and
   visible text as context. Image uploads are validated as JPEG, PNG, GIF, or
   WebP, limited to 8 MB each, and attached directly to the model request.
4. A tool-free Copilot session pinned to `gpt-5.6-luna` translates that content
   into a strict ingredient contract.
5. Runtime validation rejects malformed JSON, missing ingredients or
   instructions, unexpected fields, and invalid field types.
6. The browser renders ingredient groups as they appear in the source recipe,
   followed by numbered directions. Copy and Download preserve those groups in
   clean Markdown.
7. The server estimates ingredient weights, retrieves macro values from USDA
   FoodData Central, and calculates per-ingredient and total macros.
8. Named recipe snapshots, nutrition, and custom notes are stored in SQLite.
   Transformations and notes remain local until the user chooses Save or
   Save as.
9. Up to three recently viewed unsaved recipes remain available in local
   browser history.

The extraction API returns a request ID, recipe, and nutrition result. Saved
recipe endpoints are available at `GET|POST /api/recipes`,
`GET|PUT /api/recipes/:id`, and `POST /api/recipes/:id/transform`.

```json
{
  "ingredients": [
    {
      "amount": "1",
      "estimatedGrams": 106,
      "group": null,
      "unit": "cup",
      "ingredient": "Kodiak Cakes buttermilk waffle mix",
      "notes": "*"
    }
  ],
  "instructions": [
    "Add all ingredients to a high speed blender and blend until smooth, scraping down the sides as necessary."
  ],
  "name": "Protein Waffles",
  "servings": 4,
  "requestId": "f62088aa-e71b-48dc-b7e5-800888765a6f"
}
```

`amount`, `group`, `unit`, and `notes` may be `null`. `ingredient` and every
instruction are non-empty strings. `name` is the extracted recipe title or
`null`, and `servings` is the extracted positive serving count or `null`.

Do not expose this application directly to the public internet. The trusted
identity header is safe only when direct access to the app port is blocked.

## Commands

```powershell
npm run dev
npm test
npm run lint
npm run build
```

### Live integration test

The normal suite is deterministic and does not call third-party services. To
verify the entire real flow against
[Kennabang's Favorite Protein Waffles Recipe](https://www.thewellnourishedmama.com/blog/kennabangs-favorite-protein-waffles-recipe),
including a real GPT-5.6 Luna request:

```powershell
$env:RUN_LIVE_RECIPE_TESTS = "1"
npm run test:live
```

This requires internet access and either a locally signed-in Copilot user or
`COPILOT_GITHUB_TOKEN`. It verifies these seven normalized ingredients:

1. 1 cup Kodiak Cakes buttermilk waffle mix (`*`)
2. 1 cup low fat cottage cheese (`2% milkfat`)
3. 2 large eggs
4. 1/3 cup liquid egg whites (`**`)
5. 1/4 cup unsweetened almond milk
6. 1 teaspoon vanilla
7. Cinnamon (`to taste`)

It also verifies the recipe card's three instruction steps verbatim and in
order.

The test fails rather than silently falling back if `gpt-5.6-luna` is
unavailable.

## Logging

Each API request receives a correlation ID. The server emits one-line JSON logs
for URL and DNS validation, fetch status/redirects/timing, byte counts, parsing
strategy, source ingredient and instruction counts, Copilot
lifecycle/timing/model, contract validation, cleanup, and final status.

Logs deliberately exclude tokens, authorization values, full fetched pages,
full prompts, and full model responses.

## Useful next additions

- SQLite plus Drizzle ORM for a searchable recipe collection
- Playwright for mobile browser coverage
- A background job queue for slow recipe sites
- OpenTelemetry for SDK and request diagnostics

See [the product requirements](docs/product-requirements.md) for the
special-instructions, saved-recipe, nutrition, and deployment increment.
See [nutrition data](docs/nutrition-data.md) for calculation provenance and
[deployment options](docs/deployment-options.md) for the pending hosting
decision.
The supported shared-VM shape is documented in
[Private Agent Outpost deployment](docs/agent-outpost-deployment.md).
The selected single-VM Azure procedure is in
[Azure VM deployment](docs/azure-vm-deployment.md); that legacy standalone
procedure is not for the shared Agent Outpost VM.
