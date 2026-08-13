# Auresto — Audit sécurité & isolation multi-tenant
# Prérequis : backend démarré (cd backend; npm run dev) sur localhost:4000,
# OWNER_SECRET défini dans backend/.env.
# Usage : .\test_security_audit.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$baseUrl = if ($env:AURESTO_API_BASE) { $env:AURESTO_API_BASE } else { "http://localhost:4000" }

function Read-OwnerSecretFromEnvFile {
  $envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
  if (-not (Test-Path $envPath)) { return $null }
  foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*OWNER_SECRET\s*=\s*(.+)\s*$') {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

$ownerSecret = $env:OWNER_SECRET
if (-not $ownerSecret) { $ownerSecret = Read-OwnerSecretFromEnvFile }
if (-not $ownerSecret) {
  Write-Host "SKIP: OWNER_SECRET non défini (backend/.env ou variable d'environnement). Tests owner ignorés." -ForegroundColor Yellow
  exit 0
}

Write-Host "=== Auresto Security Audit ===" -ForegroundColor Cyan
Write-Host "API: $baseUrl`n"

$passed = 0
$failed = 0

function Assert($label, $condition) {
  if ($condition) {
    Write-Host "[PASS] $label" -ForegroundColor Green
    $script:passed++
  } else {
    Write-Host "[FAIL] $label" -ForegroundColor Red
    $script:failed++
  }
}

# Health
try {
  $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
  Assert "Health endpoint" ($health.ok -eq $true)
} catch {
  Assert "Health endpoint (serveur démarré)" $false
  Write-Host "Démarrez le backend : cd backend; npm run dev" -ForegroundColor Yellow
  exit 1
}

# --- Console owner ---
$loginBody = @{ secretKey = $ownerSecret } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/login" -Method POST -Body $loginBody -ContentType "application/json"
Assert "Login owner : jeton de session émis" ($null -ne $loginRes.token)
Assert "Le jeton ne contient pas le secret en clair" ($loginRes.token -notmatch [regex]::Escape($ownerSecret))
try {
  $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($loginRes.token))
  Assert "Jeton non réversible (pas un base64 du secret)" ($decoded -notmatch [regex]::Escape($ownerSecret))
} catch {
  Assert "Jeton non réversible (pas un base64 du secret)" $true
}
$sessionToken = $loginRes.token

$statsRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/stats" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Stats owner avec session valide" ($null -ne $statsRes.stats.totalRestaurants)

try {
  Invoke-RestMethod -Uri "$baseUrl/api/owner/stats" -Method GET | Out-Null
  Assert "Stats owner refusées sans jeton" $false
} catch {
  Assert "Stats owner refusées sans jeton" $true
}

# Brute-force : 6 mauvais secrets => la 6e tentative doit être bloquée (429)
$blocked = $false
for ($i = 0; $i -lt 6; $i++) {
  try {
    $badBody = @{ secretKey = "wrong-secret-$i" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/api/owner/login" -Method POST -Body $badBody -ContentType "application/json" | Out-Null
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 429) { $blocked = $true }
  }
}
Assert "Rate limiting login owner (429 après 5 échecs)" $blocked

# --- Isolation multi-tenant ---
$suffix = Get-Random -Minimum 1000 -Maximum 99999
$restA = Invoke-RestMethod -Uri "$baseUrl/api/restaurants" -Method POST -Body (@{ name = "Audit A $suffix"; ownerEmail = "audit-a-$suffix@test.sn" } | ConvertTo-Json) -ContentType "application/json"
$restB = Invoke-RestMethod -Uri "$baseUrl/api/restaurants" -Method POST -Body (@{ name = "Audit B $suffix"; ownerEmail = "audit-b-$suffix@test.sn" } | ConvertTo-Json) -ContentType "application/json"
$idA = $restA.id
$tokenA = $restA.access_token
$idB = $restB.id
$tokenB = $restB.access_token
Assert "Deux restaurants créés" ($idA -ne $idB)

try {
  Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idB/menu" -Method GET -Headers @{ "x-restaurant-token" = $tokenA } | Out-Null
  Assert "Isolation : token A refusé sur le menu de B" $false
} catch {
  Assert "Isolation : token A refusé sur le menu de B" $true
}

try {
  Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idB/orders" -Method GET -Headers @{ "x-restaurant-token" = $tokenA } | Out-Null
  Assert "Isolation : token A refusé sur les commandes de B" $false
} catch {
  Assert "Isolation : token A refusé sur les commandes de B" $true
}

# Le token A ne doit pas pouvoir modifier une commande de B
$orderBody = @{ tableName = "T1"; items = @(@{ name = "Yassa"; price = 3500; qty = 1 }) } | ConvertTo-Json
$order = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idB/orders" -Method POST -Body $orderBody -ContentType "application/json"
try {
  Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idB/orders/$($order.order.id)/status" -Method PATCH -Body (@{ status = "served" } | ConvertTo-Json) -ContentType "application/json" -Headers @{ "x-restaurant-token" = $tokenA } | Out-Null
  Assert "Isolation : token A ne modifie pas les commandes de B" $false
} catch {
  Assert "Isolation : token A ne modifie pas les commandes de B" $true
}

# Récupération de token : un mauvais e-mail doit être refusé
try {
  $bad = @{ restaurantId = $idA; email = "wrong-$suffix@test.sn" } | ConvertTo-Json
  Invoke-RestMethod -Uri "$baseUrl/api/auth/restaurant/token" -Method POST -Body $bad -ContentType "application/json" | Out-Null
  Assert "Token refusé avec un mauvais e-mail" $false
} catch {
  Assert "Token refusé avec un mauvais e-mail" $true
}

# Un restaurant SANS owner_email ne doit pas être revendiquable par e-mail
$restC = Invoke-RestMethod -Uri "$baseUrl/api/restaurants" -Method POST -Body (@{ name = "Audit C $suffix" } | ConvertTo-Json) -ContentType "application/json"
try {
  $claim = @{ restaurantId = $restC.id; email = "intruder-$suffix@test.sn" } | ConvertTo-Json
  Invoke-RestMethod -Uri "$baseUrl/api/auth/restaurant/token" -Method POST -Body $claim -ContentType "application/json" | Out-Null
  Assert "Restaurant sans owner ne peut pas être revendiqué" $false
} catch {
  Assert "Restaurant sans owner ne peut pas être revendiqué" $true
}

# full-state reste public (nécessaire au QR) mais sans secret
$stateB = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idB/full-state" -Method GET
Assert "full-state public (QR) OK" ($null -ne $stateB.restaurant)
Assert "full-state ne fuit pas access_token" (-not ($stateB.restaurant.PSObject.Properties.Name -contains "access_token"))

# Un client anonyme ne peut pas imposer un statut de commande
$orderAnon = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idB/orders" -Method POST -Body (@{ tableName = "T9"; status = "served"; items = @(@{ name = "Dibi"; price = 5000; qty = 1 }) } | ConvertTo-Json) -ContentType "application/json"
Assert "Un client anonyme ne peut pas imposer un statut" ($orderAnon.order.status -eq "new")

Write-Host "`n=== Résumé : $passed réussi(s), $failed échec(s) ===" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }