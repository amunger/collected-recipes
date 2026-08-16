# Collected Recipes product requirements

## Implementation status

Implemented and verified:

- optional special instructions on fresh extraction
- preview-only alteration of reopened recipes
- named SQLite save/reopen/update flow
- USDA FoodData Central macro rows and totals with explicit uncertainty states
- deterministic, live service, and browser-level coverage

Documented but intentionally deferred:

- deployment platform, persistence adapter, cold-start, and access-control
  decisions described in `deployment-options.md`

## Current MVP

Given a public recipe URL, the app safely loads the page, extracts authoritative
recipe-card data, asks a tool-free GPT-5.6 Luna session for a validated recipe,
and presents a copyable ingredient list and ordered instructions.

## Product increment

### 1. Special instructions

The URL form must accept optional natural-language instructions such as:

- `Double this recipe.`
- `Use Kodiak pancake mix instead.`
- `Make this dairy free and explain substitutions in the ingredient notes.`

The model must apply the special instructions to the structured ingredient list
and directions it returns. The page remains untrusted input: only the
separately supplied user instructions may direct the model.

Acceptance criteria:

- Blank instructions preserve the source recipe.
- A transformation changes all affected quantities, ingredients, and
  instruction text consistently.
- The response remains inside the existing strict recipe JSON contract.
- The result records the applied instruction so it is visible when saved and
  reopened.
- Invalid or empty model output is rejected rather than silently falling back.

### 2. Named saved recipes

The result widget must offer **Save**. Saving requires a non-empty display name
and creates a durable recipe entry.

Each entry stores:

- stable identifier
- display name
- source URL when available
- the current validated recipe snapshot
- the latest applied special instruction when available
- nutrition calculation and provenance
- creation and modification timestamps

The app must list saved entries. Selecting one reopens its latest snapshot
without refetching the source page.

Acceptance criteria:

- A named entry survives process restart when persistent storage is configured.
- Duplicate names are allowed; stable identifiers disambiguate entries.
- Missing entries return a clear not-found response.
- Storage failures are surfaced and logged.

### 3. Altering reopened recipes

A reopened recipe must expose the same special-instructions input. Applying it
uses the saved structured snapshot as the source and produces a new current
snapshot.

Acceptance criteria:

- The transformation is applied to the currently saved version, not the
  original website.
- The user may preview the transformed recipe before saving it.
- Saving updates the named entry and modification timestamp.
- The prior saved snapshot is not overwritten until Save succeeds.

Recipe revision history is out of scope for this increment.

### 4. Macro nutrition

Below the recipe, show a macro table aligned to the generated ingredient list.
Each row must show:

- ingredient description and quantity
- estimated grams used in the calculation
- carbohydrate grams
- protein grams
- fat grams
- match/source status

The bottom row must total carbohydrates, protein, and fat for the entire recipe.
Values are estimates and must be labeled as such.

The preferred data source is USDA FoodData Central. Model output may estimate
ingredient gram weights after a transformation, but the model must not invent
macro values. A server-side nutrition provider retrieves nutrients per 100 g;
the app performs the arithmetic.

Acceptance criteria:

- Each model-generated ingredient includes a positive estimated gram weight, or
  `null` when weight cannot be estimated.
- Provider matches retain a FoodData Central identifier and description.
- Macro values are calculated from provider values and estimated grams.
- Unmatched or unweighed rows show `unavailable` and are excluded from totals.
- Totals disclose how many ingredients were included and omitted.
- Provider network/authentication failures produce an explicit unavailable
  nutrition state without disguising it as complete data.
- Nutrition is recalculated after every transformation.

### 5. Deployment

The deployed application needs:

- a Node.js runtime capable of running Next.js and spawning the bundled Copilot
  runtime child process
- writable temporary space for per-request Copilot state
- outbound HTTPS and DNS access for recipe pages, Copilot, and nutrition data
- `COPILOT_GITHUB_TOKEN` and nutrition credentials stored as secrets
- request durations long enough for page loading and a model response
- durable recipe storage
- structured log collection

No hosting platform is selected yet. Conventional short-lived function
platforms must not be assumed compatible until child-process, executable,
timeout, and writable-filesystem behavior is proven. Container and VM options
are evaluated in `docs/deployment-options.md`.

Because saved recipes and Copilot usage are not yet authenticated, deployment
must remain owner-restricted until an authentication decision is made.

## Non-goals for this increment

- user accounts or sharing permissions
- multi-user authorization
- recipe revision history
- micronutrients or calorie targets
- medical or dietary advice
- model or data-provider values represented as laboratory-accurate facts
- automatic deployment before the hosting and persistence choice is approved

## Security and privacy invariants

- The Copilot SDK and all tokens remain server-side.
- Recipe page content is always treated as untrusted data.
- Existing private-network blocking, redirect validation, byte limits, and
  timeouts remain in place.
- Copilot sessions remain tool-free.
- Logs do not include tokens, full fetched pages, full prompts, or full model
  responses.
- Special instructions are stored only when the user saves the result.
