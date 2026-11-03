# Prospect Studio agent worker for DESKTOP-3APDBKG (Tier 1).
# Run in PowerShell from the repo folder:  powershell -ExecutionPolicy Bypass -File .\scripts\desktop\start-agent-worker.ps1
# Reads secrets from .env.worker (never printed). Loops: claim -> run -> complete -> repeat. Never sends email or spends.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..\..')
$envFile = Join-Path (Get-Location) '.env.worker'
if (-not (Test-Path -LiteralPath $envFile)) {
  Write-Host 'Missing .env.worker. Create it with lines: CONVEX_URL=..., AUTOPILOT_SERVICE_SECRET=..., OWNER_ID=...'
  exit 1
}
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
$env:WORKER = 'desktop:3apdbkg'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'Node.js 22+ is required.'; exit 1 }
if (-not (Test-Path -LiteralPath 'node_modules')) { Write-Host 'Run npm ci first.'; exit 1 }
Write-Host ('Agent worker starting as ' + $env:WORKER + '. Press Ctrl+C to stop.')
& node --import tsx scripts/agent-worker.mts --loop
