$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendEnv = Join-Path $projectRoot "backend\.env.local"

if (-not (Test-Path $backendEnv)) {
  Copy-Item (Join-Path $projectRoot "backend\.env.local.example") $backendEnv
  Write-Host "Criado backend\.env.local para testes locais."
}

Write-Host "Abra tres terminais e execute:"
Write-Host "1) cd '$projectRoot\backend'; `$env:IMMUHEN_ENV_FILE='$backendEnv'; npm run dev"
Write-Host "2) cd '$projectRoot\frontend'; `$env:VITE_API_URL='http://localhost:3001'; npm run dev"
Write-Host "3) cd '$projectRoot\vaccinator-app'; `$env:VITE_API_URL='http://localhost:3001'; npm run dev -- --port 5174"
