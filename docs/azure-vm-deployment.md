# Azure single-VM deployment

> **Legacy standalone deployment:** this procedure and
> `deploy/compose.azure.yml` use a public `80:3000` host-port mapping. They must
> never be used on the shared Agent Outpost VM. Current production builds also
> require a private HTTPS Tailscale Serve identity path; this script does not
> configure one. Use
> [Private Agent Outpost deployment](agent-outpost-deployment.md) for the shared
> VM, or add an equivalent private Serve front end before using this standalone
> design.

This deployment runs one Linux container on a low-cost Azure VM and stores
SQLite on a separate managed data disk.

## Architecture

```text
Owner browser
  -> Azure Standard public IP, port 80
     (NSG permits only the deploying public IP/CIDR)
  -> Standard_B1ms Ubuntu 24.04 VM
  -> Docker Compose
  -> Collected Recipes container, Node.js 22
  -> /mnt/recipes bind mount
  -> 4 GiB Standard SSD managed disk
```

The VM has 1 vCPU and 2 GiB RAM. The bootstrap adds 2 GiB swap so the initial
native dependency install and Next.js build fit reliably. This is an economical
personal deployment, not a high-concurrency configuration.

## Security model

- SSH and HTTP are restricted by an Azure Network Security Group to one source
  CIDR, defaulting to the public IP that runs the deployment script.
- The app runs as the non-root `node` user.
- The container drops Linux capabilities and enables `no-new-privileges`.
- The root filesystem contains no production `.env` file at image-build time.
- Copilot temporary state uses a bounded in-memory `/tmp`.
- Recipe data is on a separate disk mounted at `/mnt/recipes`.
- Production secrets are uploaded over SSH to a root-owned mode-600 file.

The first deployment uses HTTP because an IP address has no automatically
trusted TLS certificate. Do not broaden port 80 to the public internet. A
future public deployment needs a domain, TLS reverse proxy, authentication, and
rate limiting.

## Prerequisites

- Azure CLI authenticated to the target tenant
- permission to create a resource group, network resources, disks, and VM
- an available `Standard_B1ms` quota in `westus2`
- OpenSSH `ssh`, `scp`, and `ssh-keygen`
- a production GitHub token with Copilot Requests permission
- preferably a FoodData Central API key

Azure CLI is installed on the current workstation at:

```text
C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd
```

## Secret file

Copy the ignored template:

```powershell
Copy-Item deploy\.env.azure.example deploy\.env.azure
```

Fill in:

```text
COPILOT_GITHUB_TOKEN=<fine-grained token>
FDC_API_KEY=<data.gov FoodData Central key>
RECIPE_PUBLIC_BASE_URL=https://<private-tailnet-origin>
RECIPE_REQUIRE_TAILSCALE_IDENTITY=true
```

Never commit `deploy/.env.azure`. The deployment script refuses to proceed
without a non-empty Copilot token.

## Authenticate

```powershell
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" login --use-device-code
```

## Deploy

```powershell
.\deploy\deploy-azure-vm.ps1 `
  -SubscriptionId "805823c0-a7d1-4d48-9fc5-5571b60dcfb3"
```

Defaults:

| Setting | Value |
|---|---|
| Resource group | `collected-recipes-rg` |
| Region | `westus2` |
| VM | `collected-recipes-vm` |
| Size | `Standard_B1ms` |
| OS disk | Standard SSD |
| Data disk | 4 GiB Standard SSD |
| Admin user | `azureuser` |
| Allowed CIDR | current public IP `/32` |

Override any default with the corresponding PowerShell parameter. Use
`-AllowedCidr` when deploying from a VPN or a stable office/home range.

The script is rerunnable. It reuses the resource group, VM, network, public IP,
and disk, then uploads the current working tree and rebuilds the container.

## Verification

The bootstrap waits for:

```text
GET /api/health -> 200 {"status":"ok"}
```

The deployment script then verifies the same endpoint through the public IP.
That health result does not prove the protected recipe API is reachable.
Configure private Tailscale Serve HTTPS and remove direct network access before
manually testing:

1. open the printed URL from the allowed network
2. extract a real recipe
3. save a named entry
4. restart the VM or container
5. reopen the entry to verify disk persistence

## Operations

### View logs

```powershell
ssh -i "$HOME\.ssh\collected-recipes-azure" azureuser@<public-ip> `
  "cd /opt/collected-recipes && sudo docker compose -f deploy/compose.azure.yml logs --tail=200"
```

### Restart

```powershell
ssh -i "$HOME\.ssh\collected-recipes-azure" azureuser@<public-ip> `
  "cd /opt/collected-recipes && sudo docker compose -f deploy/compose.azure.yml restart"
```

### Database backup

Stop writes before copying the SQLite database:

```powershell
ssh -i "$HOME\.ssh\collected-recipes-azure" azureuser@<public-ip> `
  "cd /opt/collected-recipes && sudo docker compose -f deploy/compose.azure.yml stop"

scp -i "$HOME\.ssh\collected-recipes-azure" `
  azureuser@<public-ip>:/mnt/recipes/recipes.db .\recipes-backup.db
```

Start the container again after backup. For recurring backups, configure Azure
managed-disk snapshots rather than copying live SQLite files.

### Stop compute charges temporarily

```powershell
& $AzCli vm deallocate `
  --resource-group collected-recipes-rg `
  --name collected-recipes-vm
```

The public IP and disks continue to incur small storage/IP charges.

### Remove everything

This permanently deletes the VM and recipe disk:

```powershell
& $AzCli group delete `
  --name collected-recipes-rg `
  --yes `
  --no-wait
```

Take a database backup first.
