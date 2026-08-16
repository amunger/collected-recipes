# Nutrition data approach

## Decision

Use the USDA FoodData Central API as the macro source for the MVP.

FoodData Central is an official U.S. Department of Agriculture data service.
Its data is public domain under CC0, the API is free, and its default
authenticated limit is 1,000 requests per hour per IP address. `DEMO_KEY` is
limited to 30 requests per hour and 50 per day, so it is only suitable for
development.

Sources:

- [FoodData Central API guide](https://fdc.nal.usda.gov/api-guide/)
- [FoodData Central API key signup](https://fdc.nal.usda.gov/api-key-signup)
- [FoodData Central data type documentation](https://fdc.nal.usda.gov/data-documentation.html)
- [FoodData Central API specification](https://fdc.nal.usda.gov/api-spec/fdc_api.html)

## Calculation pipeline

1. GPT-5.6 Luna produces the transformed recipe and estimates the edible gram
   weight of each complete ingredient quantity.
2. The model does **not** produce carbohydrate, protein, or fat values.
3. The server searches FoodData Central using the normalized ingredient and
   relevant notes.
4. The server reads the official nutrient IDs:
   - `1003`: Protein
   - `1004`: Total lipid (fat)
   - `1005`: Carbohydrate, by difference
5. The server scales FoodData Central's normalized values by:

   `ingredient estimated grams / 100`

6. The server rounds each macro to 0.1 g and sums matched rows.
7. Every row retains the FDC ID and matched description for provenance.

## Error and uncertainty model

Nutrition is an estimate, not medical guidance.

Uncertainty comes from:

- model-estimated volume-to-weight conversion
- differences between brands and preparations
- the first FoodData Central search match not always being the exact product
- ingredient phrases that represent several foods
- quantities such as `to taste`

Rows are therefore explicit:

- `matched`: an FDC food and gram estimate were available
- `unweighed`: the model could not estimate grams
- `unmatched`: FDC returned no complete macro match
- `provider-error`: FDC could not be queried

Totals include only `matched` rows and disclose included/omitted counts. A
provider failure never produces success-shaped zeroes for the affected row.

## Data types

FoodData Central includes:

- Foundation Foods: detailed USDA analytical data for generic foods
- SR Legacy: the historical USDA reference database
- Survey (FNDDS): prepared foods used in dietary surveys
- Branded: manufacturer-supplied packaged-food data
- Experimental: research foods, generally not useful here

The search endpoint ranks matches across these data types. This is helpful for
both generic ingredients and products such as Kodiak mix, but exact product
selection remains an MVP limitation.

## Why not the alternatives yet?

Edamam's
[Nutrition Analysis API](https://developer.edamam.com/edamam-nutrition-api)
and Spoonacular's
[food APIs](https://spoonacular.com/food-api) add natural-language ingredient
parsing and product matching, but introduce commercial quotas, attribution or
storage terms, and another interpretation layer. The app already uses Luna to
normalize quantities, so FoodData Central offers the best authoritative,
low-cost base.

## Production configuration

Set:

```text
FDC_API_KEY=<data.gov FoodData Central key>
```

The app falls back to `DEMO_KEY` only to make local development possible.
Production deployment must provide a real key and monitor HTTP 429 responses
and the `X-RateLimit-Remaining` response header.

## Future accuracy improvements

1. Cache matches by normalized ingredient and selected FDC ID.
2. Prefer exact branded matches when a brand is present.
3. Prefer Foundation/SR/FNDDS for generic ingredients.
4. Let users correct an FDC match or gram estimate.
5. Store corrections and reuse them for future recipes.
6. Use FDC food portions to reduce model-based household-unit conversion.
