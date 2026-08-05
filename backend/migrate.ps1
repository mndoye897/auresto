# Apply SQL migrations to the DATABASE_URL found in .env and start the backend
Set-StrictMode -Version Latest
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$envFile = Join-Path $scriptDir '.env'
if (-not (Test-Path $envFile)) {
  Write-Host "No .env file found in $scriptDir. Copy .env.example to .env and update DATABASE_URL." -ForegroundColor Yellow
  exit 1
}

$content = Get-Content $envFile | Where-Object { $_ -match '=' }
$dbLine = $content | Where-Object { $_ -match '^DATABASE_URL=' }
if (-not $dbLine) { Write-Host "DATABASE_URL not found in .env" -ForegroundColor Red; exit 1 }
$databaseUrl = $dbLine -replace '^DATABASE_URL=', ''

Write-Host "Applying migrations to $databaseUrl" -ForegroundColor Cyan
try {
  Get-ChildItem -Path (Join-Path $scriptDir 'migrations') -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    Write-Host "Running migration $_..." -ForegroundColor Cyan
    & psql $databaseUrl -f $_.FullName
    if ($LASTEXITCODE -ne 0) { Write-Host "psql reported errors on $_." -ForegroundColor Red; exit $LASTEXITCODE }
  }
  Write-Host "Migrations applied successfully." -ForegroundColor Green
} catch {
  Write-Host "Failed to run psql. Ensure psql is installed and in PATH." -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host "Installing backend dependencies and starting server (dev)..." -ForegroundColor Cyan
Push-Location $scriptDir
try {
  if (-not (Test-Path 'node_modules')) { npm install }
  npm run dev
} finally {
  Pop-Location
}
