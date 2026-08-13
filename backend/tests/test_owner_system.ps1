# Auresto — Console owner : login, stats, listes, suspension, abonnements
# Prérequis : backend démarré (cd backend; npm run dev) sur localhost:4000,
# OWNER_SECRET défini dans backend/.env.
# Usage : .\test_owner_system.ps1
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
  Write-Host "SKIP: OWNER_SECRET non défini (backend/.env). Tests owner ignorés." -ForegroundColor Yellow
  exit 0
}

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

# 1. Login owner -> session token
try {
  $loginBody = @{ secretKey = $ownerSecret } | ConvertTo-Json
  $loginRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/login" -Method POST -Body $loginBody -ContentType "application/json"
  Assert "Login owner : session token émis" ($null -ne $loginRes.token)
  $sessionToken = $loginRes.token
} catch {
  Assert "Login owner" $false
  Write-Host "Échec du login owner : $_" -ForegroundColor Red
  exit 1
}

# 2. Stats
$statsRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/stats" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Stats owner (totalRestaurants >= 0)" ($statsRes.stats.totalRestaurants -ge 0)

# 3. Création d'un restaurant de test (route publique)
$suffix = Get-Random -Minimum 1000 -Maximum 99999
$createBody = @{
  name = "Ngor Terrou Test $suffix"
  address = "Route de la Corniche Ouest"
  city = "Dakar"
  phone = "+221 77 123 45 67"
  description = "Specialites de poissons et fruits de mer"
  ownerEmail = "owner-$suffix@ngorterrou.sn"
} | ConvertTo-Json
$createRes = Invoke-RestMethod -Uri "$baseUrl/api/restaurants" -Method POST -Body $createBody -ContentType "application/json"
Assert "Restaurant créé avec access_token" ($null -ne $createRes.access_token)
$testRestId = $createRes.id
$restToken = $createRes.access_token

# 4. Liste des restaurants (owner)
$listRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/restaurants?filter=ALL&search=Ngor" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Liste owner : restaurant trouvé" ($listRes.count -ge 1)
Assert "Liste owner : le secret n'est pas exposé" (-not ($listRes.restaurants[0].PSObject.Properties.Name -contains "access_token"))

# 5. Suspension puis réactivation
$suspendBody = @{ suspend = $true; reason = "Test suspension" } | ConvertTo-Json
$suspendRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/restaurants/$testRestId/suspend" -Method POST -Headers @{ "x-owner-token" = $sessionToken } -Body $suspendBody -ContentType "application/json"
Assert "Restaurant suspendu" ($suspendRes.restaurant.status -eq "SUSPENDED")

$reactivateBody = @{ suspend = $false } | ConvertTo-Json
$reactivateRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/restaurants/$testRestId/suspend" -Method POST -Headers @{ "x-owner-token" = $sessionToken } -Body $reactivateBody -ContentType "application/json"
Assert "Restaurant réactivé" ($reactivateRes.restaurant.status -eq "ACTIVE")

# 6. Abonnements, échéances, journal d'audit, paiements, revenus
$subsRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/subscriptions" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Liste des abonnements" ($null -ne $subsRes.subscriptions)

$deadRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/deadlines" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Échéances (deadlines)" ($null -ne $deadRes.deadlines)

$auditRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/audit-logs" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Journal d'audit" ($null -ne $auditRes.logs)

$payRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/payments" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Paiements" ($null -ne $payRes.payments)

$revRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/revenue" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Revenus (total >= 0)" ($revRes.total -ge 0)

Write-Host "`n=== Résumé : $passed réussi(s), $failed échec(s) ===" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }