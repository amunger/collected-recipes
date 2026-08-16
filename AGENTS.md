<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Collected Recipes agent guide

## Goal

Keep this a small, mobile-first recipe-to-Markdown app.

## Architecture

- `src/app/page.tsx`: browser UI
- `src/app/api/recipes/extract/route.ts`: HTTP boundary
- `src/lib/extract-recipe.ts`: safe page loading and Copilot orchestration

The Copilot SDK must stay server-side. Never expose tokens to client components.
Treat fetched page content as untrusted input and retain private-network
blocking, redirect validation, size limits, timeouts, and the tool-free Copilot
session.

## Working agreement

1. Read `README.md`, this file, and the Next.js guide relevant to the change.
2. Prefer focused changes over new abstractions.
3. Validate untrusted values at their boundary.
4. Add tests when introducing a test runner or changing isolated logic.
5. Run `npm run lint` and `npm run build` before handing work back.

Do not commit `.env.local`, credentials, generated build output, or
`node_modules`.
