[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SubscriptionId,

  [string]$ResourceGroup = "collected-recipes-rg",
  [string]$Location = "westus2",
  [string]$VmName = "collected-recipes-vm",
  [string]$VmSize = "Standard_B1ms",
  [string]$AdminUsername = "azureuser",
  [string]$AllowedCidr,
  [string]$EnvironmentFile = (Join-Path $PSScriptRoot ".env.azure"),
  [string]$SshPrivateKey = (Join-Path $env:USERPROFILE ".ssh\collected-recipes-azure"),
  [string]$AzCli = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$publicKey = "$SshPrivateKey.pub"
$archive = Join-Path ([System.IO.Path]::GetTempPath()) "collected-recipes-$([guid]::NewGuid()).tgz"

function Invoke-Az {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $output = & $AzCli @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed: az $($Arguments -join ' ')"
  }
  return $output
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE."
  }
}

if (-not (Test-Path $AzCli)) {
  throw "Azure CLI was not found at $AzCli. Install Microsoft.AzureCLI with winget."
}
if (-not (Test-Path $EnvironmentFile)) {
  throw "Create $EnvironmentFile from deploy\.env.azure.example and add COPILOT_GITHUB_TOKEN."
}
$environmentText = Get-Content -Raw $EnvironmentFile
if ($environmentText -notmatch "(?m)^COPILOT_GITHUB_TOKEN=.+$") {
  throw "$EnvironmentFile must contain a non-empty COPILOT_GITHUB_TOKEN."
}

if (-not $AllowedCidr) {
  $publicAddress = (Invoke-RestMethod -Uri "https://api.ipify.org").Trim()
  $AllowedCidr = "$publicAddress/32"
}
if ($AllowedCidr -notmatch "^[0-9a-fA-F:.]+/\d{1,3}$") {
  throw "AllowedCidr must be a single IPv4 or IPv6 CIDR."
}

$sshDirectory = Split-Path $SshPrivateKey -Parent
New-Item -ItemType Directory -Path $sshDirectory -Force | Out-Null
if (-not (Test-Path $publicKey)) {
  Invoke-External ssh-keygen -t ed25519 -f $SshPrivateKey -N '""' -C "collected-recipes-azure"
}

Invoke-Az account set --subscription $SubscriptionId
$account = Invoke-Az account show --subscription $SubscriptionId --output json | ConvertFrom-Json
Write-Host "Deploying to subscription '$($account.name)' ($SubscriptionId)."
Invoke-Az provider register --namespace Microsoft.Compute --wait --output none
Invoke-Az provider register --namespace Microsoft.Network --wait --output none

$nsgName = "$VmName-nsg"
$vnetName = "$VmName-vnet"
$subnetName = "default"
$publicIpName = "$VmName-ip"
$nicName = "$VmName-nic"
$dataDiskName = "$VmName-data"

Invoke-Az group create --name $ResourceGroup --location $Location --output none
Invoke-Az network nsg create --resource-group $ResourceGroup --name $nsgName --location $Location --output none
Invoke-Az network nsg rule create `
  --resource-group $ResourceGroup `
  --nsg-name $nsgName `
  --name AllowSshFromOwner `
  --priority 1000 `
  --access Allow `
  --protocol Tcp `
  --direction Inbound `
  --source-address-prefixes $AllowedCidr `
  --destination-port-ranges 22 `
  --output none
Invoke-Az network nsg rule create `
  --resource-group $ResourceGroup `
  --nsg-name $nsgName `
  --name AllowWebFromOwner `
  --priority 1010 `
  --access Allow `
  --protocol Tcp `
  --direction Inbound `
  --source-address-prefixes $AllowedCidr `
  --destination-port-ranges 80 `
  --output none
Invoke-Az network vnet create `
  --resource-group $ResourceGroup `
  --name $vnetName `
  --location $Location `
  --address-prefixes 10.20.0.0/16 `
  --subnet-name $subnetName `
  --subnet-prefixes 10.20.1.0/24 `
  --output none
Invoke-Az network public-ip create `
  --resource-group $ResourceGroup `
  --name $publicIpName `
  --location $Location `
  --sku Standard `
  --allocation-method Static `
  --output none
Invoke-Az network nic create `
  --resource-group $ResourceGroup `
  --name $nicName `
  --location $Location `
  --vnet-name $vnetName `
  --subnet $subnetName `
  --network-security-group $nsgName `
  --public-ip-address $publicIpName `
  --output none

$vmExists = & $AzCli vm show --resource-group $ResourceGroup --name $VmName --output none 2>$null
if ($LASTEXITCODE -ne 0) {
  Invoke-Az vm create `
    --resource-group $ResourceGroup `
    --name $VmName `
    --location $Location `
    --nics $nicName `
    --image Ubuntu2404 `
    --size $VmSize `
    --admin-username $AdminUsername `
    --ssh-key-values $publicKey `
    --os-disk-name "$VmName-os" `
    --storage-sku StandardSSD_LRS `
    --security-type Standard `
    --output none
}

$diskExists = & $AzCli disk show --resource-group $ResourceGroup --name $dataDiskName --output none 2>$null
if ($LASTEXITCODE -ne 0) {
  Invoke-Az disk create `
    --resource-group $ResourceGroup `
    --name $dataDiskName `
    --location $Location `
    --size-gb 4 `
    --sku StandardSSD_LRS `
    --output none
}

$attachedLun = Invoke-Az vm show `
  --resource-group $ResourceGroup `
  --name $VmName `
  --query "storageProfile.dataDisks[?name=='$dataDiskName'].lun | [0]" `
  --output tsv
if (-not $attachedLun) {
  Invoke-Az vm disk attach `
    --resource-group $ResourceGroup `
    --vm-name $VmName `
    --name $dataDiskName `
    --lun 0 `
    --output none
} elseif ($attachedLun -ne "0") {
  throw "Data disk '$dataDiskName' is attached at LUN $attachedLun; expected LUN 0."
}

$publicIp = Invoke-Az network public-ip show `
  --resource-group $ResourceGroup `
  --name $publicIpName `
  --query ipAddress `
  --output tsv

$locationPushed = $false
try {
  Push-Location $repoRoot
  $locationPushed = $true
  Invoke-External tar `
    -czf $archive `
    --exclude=.git `
    --exclude=.next `
    --exclude=node_modules `
    --exclude=data `
    --exclude=deploy/.env.azure `
    .
  Pop-Location
  $locationPushed = $false

  $sshTarget = "$AdminUsername@$publicIp"
  $sshOptions = @("-i", $SshPrivateKey, "-o", "StrictHostKeyChecking=accept-new")
  Invoke-External scp @sshOptions $archive "$sshTarget`:/tmp/collected-recipes.tgz"
  Invoke-External scp @sshOptions $EnvironmentFile "$sshTarget`:/tmp/collected-recipes.env"
  Invoke-External scp @sshOptions (Join-Path $PSScriptRoot "bootstrap-vm.sh") "$sshTarget`:/tmp/bootstrap-vm.sh"
  Invoke-External ssh @sshOptions $sshTarget "sudo bash /tmp/bootstrap-vm.sh"
} finally {
  if ($locationPushed) {
    Pop-Location
  }
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
}

$health = Invoke-RestMethod -Uri "http://$publicIp/api/health" -TimeoutSec 30
if ($health.status -ne "ok") {
  throw "The deployed application did not report healthy."
}

Write-Host ""
Write-Host "Collected Recipes is available at http://$publicIp"
Write-Host "Ingress is restricted to $AllowedCidr."
Write-Host "Persistent recipes are stored on Azure disk '$dataDiskName'."
