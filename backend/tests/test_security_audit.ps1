# Auresto security & API audit (requires backend running on localhost:4000)
# Usage: set OWNER_SECRET in backend/.env, then: .\test_security_audit.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$baseUrl = if ($env:AURESTO_API_BASE) { $env:AURESTO_API_BASE } else { "http://localhost:4000" }

function Read-OwnerSecretFromEnvFile {
  $envPath = Join-Path $PSScriptRoot ".env"
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
  Write-Host "SKIP: OWNER_SECRET not set (backend/.env or env var). Owner tests skipped." -ForegroundColor Yellow
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
  Assert "Health endpoint (server running)" $false
  Write-Host "Start backend: cd backend; npm run dev" -ForegroundColor Yellow
  exit 1
}

# Owner login returns session token (not the raw secret)
$loginBody = @{ secretKey = $ownerSecret } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/login" -Method POST -Body $loginBody -ContentType "application/json"
Assert "Owner login ok" ($loginRes.ok -eq $true)
Assert "Owner token is not raw secret" ($loginRes.token -ne $ownerSecret)
$sessionToken = $loginRes.token

# Owner stats with session token
$statsRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/stats" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
Assert "Owner stats with session token" ($statsRes.ok -eq $true)

# Owner stats without token must fail
try {
  Invoke-RestMethod -Uri "$baseUrl/api/owner/stats" -Method GET | Out-Null
  Assert "Owner stats rejects anonymous" $false
} catch {
  Assert "Owner stats rejects anonymous" $true
}

# Create two restaurants
$r1Body = @{ name = "Audit Rest A"; owner_email = "owner-a@test.sn"; plan = "SILVER" } | ConvertTo-Json
$r2Body = @{ name = "Audit Rest B"; owner_email = "owner-b@test.sn"; plan = "FREE" } | ConvertTo-Json
$restA = Invoke-RestMethod -Uri "$baseUrl/api/restaurants" -Method POST -Body $r1Body -ContentType "application/json"
$restB = Invoke-RestMethod -Uri "$baseUrl/api/restaurants" -Method POST -Body $r2Body -ContentType "application/json"
Assert "Restaurant A created with access_token" ($null -ne $restA.access_token)
Assert "Restaurant B created with access_token" ($null -ne $restB.access_token)

$idA = $restA.id
$idB = $restB.id
$tokenA = $restA.access_token
$tokenB = $restB.access_token

# Multi-tenant: A cannot read B full-state
try {
  Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idB/full-state" -Method GET -Headers @{ "x-restaurant-token" = $tokenA } | Out-Null
  Assert "Multi-tenant full-state blocked (A token on B)" $false
} catch {
  Assert "Multi-tenant full-state blocked (A token on B)" $true
}

# Authorized full-state
$stateA = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idA/full-state" -Method GET -Headers @{ "x-restaurant-token" = $tokenA }
Assert "Authorized full-state for A" ($null -ne $stateA.restaurant)

# Subscription protected
try {
  Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idA/subscription" -Method GET | Out-Null
  Assert "Subscription requires auth" $false
} catch {
  Assert "Subscription requires auth" $true
}

$subA = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idA/subscription" -Method GET -Headers @{ "x-restaurant-token" = $tokenA }
Assert "Subscription SILVER plan price context" ($subA.subscription.plan -eq "SILVER")

# Bootstrap access with wrong email fails
try {
  $bootBad = @{ email = "wrong@test.sn" } | ConvertTo-Json
  Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idA/bootstrap-access" -Method POST -Body $bootBad -ContentType "application/json" | Out-Null
  Assert "Bootstrap rejects wrong email" $false
} catch {
  Assert "Bootstrap rejects wrong email" $true
}

$bootGood = @{ email = "owner-a@test.sn" } | ConvertTo-Json
$bootRes = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$idA/bootstrap-access" -Method POST -Body $bootGood -ContentType "application/json"
Assert "Bootstrap accepts owner email" ($bootRes.access_token -eq $tokenA)

# Wave checkout without auth fails
try {
  $waveBody = @{ restaurantId = $idA; type = "SUBSCRIPTION"; plan = "SILVER"; amount = 25000 } | ConvertTo-Json
  Invoke-RestMethod -Uri "$baseUrl/api/payments/wave/create-checkout" -Method POST -Body $waveBody -ContentType "application/json" | Out-Null
  Assert "Wave checkout requires restaurant auth" $false
} catch {
  Assert "Wave checkout requires restaurant auth" $true
}

# Wave not configured returns WAVE_NOT_CONFIGURED (no fake success)
$waveAuthBody = @{ restaurantId = $idA; type = "SUBSCRIPTION"; plan = "SILVER"; amount = 25000 } | ConvertTo-Json
try {
  $waveRes = Invoke-RestMethod -Uri "$baseUrl/api/payments/wave/create-checkout" -Method POST -Body $waveAuthBody -ContentType "application/json" -Headers @{ "x-restaurant-token" = $tokenA }
  Assert "Wave without API key does not return checkoutUrl" ($null -eq $waveRes.checkoutUrl)
} catch {
  $errJson = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
  Assert "Wave without API key returns error" ($errJson.error -eq "WAVE_NOT_CONFIGURED" -or $_.Exception.Message -match "400")
}

Write-Host "`n=== Summary: $passed passed, $failed failed ===" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
