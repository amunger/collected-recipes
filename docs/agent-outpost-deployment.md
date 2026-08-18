# Private Agent Outpost deployment

Collected Recipes may run as a separate, unprivileged workload on the shared
Agent Outpost VM. It is not part of Agent Outpost and must keep its own
workspace, process lifecycle, data directory, secrets, and deployment history.

## Required request path

```text
Owner browser on the tailnet
  -> dedicated private HTTPS origin
  -> Tailscale Serve (verified identity header)
  -> VM loopback on a dedicated port
  -> Collected Recipes
```

Use a dedicated HTTPS origin, not a path beneath the Agent Outpost origin. Set:

```text
NODE_ENV=production
RECIPE_PUBLIC_BASE_URL=https://<private-tailnet-origin>
RECIPE_REQUIRE_TAILSCALE_IDENTITY=true
RECIPE_DATABASE_PATH=<persistent-recipe-data-path>/recipes.db
```

`RECIPE_PUBLIC_BASE_URL` must contain only the scheme and host. Production
startup traffic fails closed at the recipe API when this value is missing, is
not HTTPS, or when identity enforcement is not exactly `true`.

Tailscale Serve supplies `Tailscale-User-Login`. The application accepts that
header as trusted only because the application port is unreachable from the
network. Bind the workload to `127.0.0.1` on a dedicated host port, and make
that loopback address the Serve target. Do not publish the container on
`0.0.0.0`, a public IP, or a shared reverse-proxy route that permits clients to
supply the identity header directly.

All `/api/recipes` reads require the identity header. POST and PUT requests
also require an `Origin` exactly equal to `RECIPE_PUBLIC_BASE_URL`; forwarded
host and origin headers are deliberately ignored. `GET /api/health` is outside
the protected route and remains suitable for a loopback health probe.

## Shared-VM boundaries

- Do not run `deploy/deploy-azure-vm.ps1` against the Agent Outpost VM.
- Do not use `deploy/compose.azure.yml`; its `80:3000` public host-port mapping
  is for its standalone-VM design and violates the shared VM boundary.
- Do not add Collected Recipes behavior to Agent Outpost's existing
  self-deployment controller, slot units, or nginx configuration. The reviewed
  host installation uses a separate fixed request watcher, systemd service, and
  rootless-Podman identities maintained with the VM operations code.
- Keep the SQLite directory persistent and writable only by the Collected
  Recipes workload. Keep Copilot temporary storage bounded as in the existing
  container design.
- Preserve the existing private-network URL checks, upload limits, tool-free
  Copilot sessions, and secret-safe logging.

Deployment and Tailscale Service configuration are privileged VM changes; this
repository intentionally provides no privileged installation scripts.
