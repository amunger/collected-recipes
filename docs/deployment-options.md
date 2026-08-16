# Deployment options

## Executive recommendation

The application can use a serverless architecture, but not a conventional
code-only function architecture.

The best Azure-shaped option is **Azure Container Apps on the Consumption
plan**: deploy the full container, allow it to scale to zero, and use an
external durable database. For the absolute simplest single-user deployment
with the current SQLite implementation, use a single container or small VM with
a persistent volume.

No deployment resources are created yet because the final choice affects the
database adapter and operating cost.

The current app has no user authentication. A public deployment must either be
network-restricted to the owner or add authentication and request rate limiting
before exposing Copilot-backed endpoints and saved recipes to the internet.

## Runtime constraints

The Copilot SDK is not an ordinary HTTP client:

- `@github/copilot-sdk` controls a platform-native Copilot CLI executable.
- The default SDK transport launches that executable with
  `node:child_process`.
- The native Linux binary must be present in the deployed `node_modules`; a
  JavaScript bundler cannot recreate it.
- This app uses a per-request writable temporary directory as the Copilot
  `baseDirectory`.
- Model calls have a 90-second timeout, so total requests can approach 100
  seconds.
- Headless deployment requires `COPILOT_GITHUB_TOKEN`; a server cannot rely on
  a locally signed-in developer.
- Node.js 20.19+ or 22.12+ is required.
- Outbound DNS and HTTPS must reach recipe sites, GitHub Copilot, and USDA
  FoodData Central.

Relevant sources:

- [Copilot SDK repository and documentation](https://github.com/github/copilot-sdk)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Azure Functions Flex Consumption](https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan)
- [Azure Container Apps scaling](https://learn.microsoft.com/azure/container-apps/scale-app)
- [Azure Container Apps billing](https://learn.microsoft.com/azure/container-apps/billing)
- [Fly.io pricing](https://fly.io/docs/about/pricing/)

## Why code-only functions are not recommended

### Vercel Functions

Request duration and writable `/tmp` can be sufficient on some plans, but the
native Copilot executable and native SDK dependencies must survive dependency
tracing and function bundle limits. This is fragile and removes the usual
zero-configuration advantage. A Vercel-hosted container could work, but then it
should be compared as a container platform.

### Azure Functions Consumption/Flex

Flex Consumption is designed around code packages rather than arbitrary
containers. The native executable, child process, and long request make it a
poor target. Premium/Dedicated container plans can work, but their baseline
cost is unnecessary for a personal recipe app.

### Edge runtimes

Cloudflare Workers and other edge isolates do not provide Node child processes
or a normal writable filesystem, so they cannot host this SDK path.

## Option A: Azure Container Apps Consumption

Recommended if keeping the deployment in Azure.

Suggested shape:

```text
GitHub Actions
  -> build Linux Node 22 container
  -> push to GHCR (or ACR)
  -> Azure Container App
       0.5 vCPU / 1 GiB
       min replicas 0
       max replicas 1 initially
       secrets: COPILOT_GITHUB_TOKEN, FDC_API_KEY, database credentials
       external ingress on port 3000
       writable /tmp
```

Benefits:

- full container includes the Copilot native executable
- scale-to-zero behavior and free monthly consumption grants
- managed HTTPS, revisions, logs, secrets, and health checks
- no OS patching

Tradeoffs:

- a cold container plus Copilot startup adds noticeable first-request latency
- SQLite inside the container is ephemeral
- an Azure Files-mounted SQLite database is possible for one replica but a
  network filesystem is not the preferred long-term database architecture

Persistence recommendation:

- retain the `SavedRecipeStore` interface
- replace the local SQLite adapter with Turso/libSQL or managed PostgreSQL
  before an Azure Container Apps deployment
- alternatively constrain to one replica and deliberately validate Azure Files
  locking/backup behavior

Likely light personal usage fits within Container Apps' published free grants,
but current regional pricing must be checked before creation.

## Option B: single container with persistent volume

Examples include Fly.io, Railway, or another low-cost container host.

Suggested shape:

```text
Linux Node 22 container
  -> one instance / one region
  -> auto-start/auto-stop if supported
  -> persistent volume mounted at /data
  -> RECIPE_DATABASE_PATH=/data/recipes.db
```

Benefits:

- works with the SQLite implementation already in this repository
- minimal infrastructure
- often only a few dollars per month at personal usage
- faster path to deployment

Tradeoffs:

- the volume is tied to one region/instance
- scale-out requires a database migration
- platform pricing and free allowances change frequently

This is the lowest-effort deployment if Azure is not a requirement.

## Option C: Azure App Service or modest Azure VM

### Azure App Service

A Basic Linux App Service can run the container or managed Node process and has
a persistent filesystem. It is always on and easier than maintaining a VM, but
has a monthly baseline even when unused.

### Azure VM

A B-series Linux VM with 1 GiB or more memory can run Node, the native Copilot
binary, SQLite, and a reverse proxy.

Benefits:

- complete control
- local SQLite works directly
- predictable always-on behavior

Tradeoffs:

- OS security updates, firewalling, TLS/reverse proxy, backup, monitoring, and
  deployment are the owner's responsibility
- always-on cost

A VM is technically straightforward but operationally the least serverless
choice.

## Required deployment decisions

1. Azure preference:
   - Azure Container Apps
   - a cheaper single-container provider
   - always-on Azure App Service/VM
2. Cold starts:
   - scale to zero
   - keep one warm replica
3. Persistence:
   - current SQLite plus a single persistent volume
   - Turso/libSQL
   - managed PostgreSQL
4. Container registry:
   - GitHub Container Registry
   - Azure Container Registry
5. Region and backup/retention requirements.
6. Access control:
   - private/network-restricted personal app
   - authenticated public endpoint

## Work after the decision

- add a multi-stage Node 22 Dockerfile
- add a health endpoint
- configure `RECIPE_DATABASE_PATH` or swap the store adapter
- configure platform secrets
- add GitHub Actions image build/deploy
- verify the Linux Copilot binary is present in the final image
- run the live extraction/transformation and USDA probes in staging
- configure structured log retention and database backups
- configure ingress restrictions or add authentication and rate limiting
