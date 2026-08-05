# PowerShell Test Script for Auresto Owner Dashboard & Subscriptions API
# Requires OWNER_SECRET in backend/.env (never hardcode secrets in this file)
Set-StrictMode -Version Latest
$baseUrl = "http://localhost:4000"

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
  Write-Host "ERROR: Set OWNER_SECRET in backend/.env before running tests." -ForegroundColor Red
  exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1. Testing Owner Login" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$loginBody = @{ secretKey = $ownerSecret } | ConvertTo-Json
try {
  $loginRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/login" -Method POST -Body $loginBody -ContentType "application/json"
  $sessionToken = $loginRes.token
  Write-Host "Owner Login Success! Session token issued (not raw secret)." -ForegroundColor Green
} catch {
  Write-Host "Owner Login Failed: $_" -ForegroundColor Red
  exit 1
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "2. Testing Owner Stats API" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

try {
  $statsRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/stats" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
  Write-Host "Owner Stats Success! Total Restaurants: $($statsRes.stats.totalRestaurants)" -ForegroundColor Green
} catch {
  Write-Host "Owner Stats Failed: $_" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "3. Creating a Test Restaurant (Silver Plan)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$createBody = @{
  name = "Le Ngor Terrou Test Senegal"
  address = "Route de la Corniche Ouest"
  city = "Dakar"
  phone = "+221 77 123 45 67"
  description = "Specialites de poissons et fruits de mer"
  owner_email = "owner@ngorterrou.sn"
  owner_phone = "+221 77 123 45 67"
  plan = "SILVER"
} | ConvertTo-Json

try {
  $createRes = Invoke-RestMethod -Uri "$baseUrl/api/restaurants" -Method POST -Body $createBody -ContentType "application/json"
  $testRestId = $createRes.id
  $restToken = $createRes.access_token
  Write-Host "Restaurant Created! ID: $testRestId, Plan: $($createRes.subscription_plan)" -ForegroundColor Green

  Write-Host "`n==========================================" -ForegroundColor Cyan
  Write-Host "4. Testing Owner List Restaurants" -ForegroundColor Cyan
  Write-Host "==========================================" -ForegroundColor Cyan
  $listRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/restaurants?filter=ALL" -Method GET -Headers @{ "x-owner-token" = $sessionToken }
  Write-Host "Found $($listRes.count) restaurants in Owner Dashboard." -ForegroundColor Green

  Write-Host "`n==========================================" -ForegroundColor Cyan
  Write-Host "5. Testing Restaurant Subscription API" -ForegroundColor Cyan
  Write-Host "==========================================" -ForegroundColor Cyan
  $subRes = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$testRestId/subscription" -Method GET -Headers @{ "x-restaurant-token" = $restToken }
  Write-Host "Sub Status: $($subRes.subscription.status), Plan: $($subRes.subscription.plan)" -ForegroundColor Green

  Write-Host "`n==========================================" -ForegroundColor Cyan
  Write-Host "6. Testing Wave Checkout API (expect not configured)" -ForegroundColor Cyan
  Write-Host "==========================================" -ForegroundColor Cyan
  $waveBody = @{
    restaurantId = $testRestId
    type = "SUBSCRIPTION"
    plan = "SILVER"
    amount = 25000
    title = "Abonnement Silver Test"
  } | ConvertTo-Json
  try {
    $waveRes = Invoke-RestMethod -Uri "$baseUrl/api/payments/wave/create-checkout" -Method POST -Body $waveBody -ContentType "application/json" -Headers @{ "x-restaurant-token" = $restToken }
    if ($waveRes.checkoutUrl) {
      Write-Host "Unexpected checkoutUrl without WAVE_API_KEY" -ForegroundColor Red
    } else {
      Write-Host "Wave correctly not configured: $($waveRes.message)" -ForegroundColor Green
    }
  } catch {
    Write-Host "Wave endpoint protected / not configured (expected): $_" -ForegroundColor Yellow
  }

  Write-Host "`n==========================================" -ForegroundColor Cyan
  Write-Host "7. Testing Owner Suspend Action" -ForegroundColor Cyan
  Write-Host "==========================================" -ForegroundColor Cyan
  $suspendBody = @{ suspend = $true; reason = "Test suspension" } | ConvertTo-Json
  $suspendRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/restaurants/$testRestId/suspend" -Method POST -Headers @{ "x-owner-token" = $sessionToken } -Body $suspendBody -ContentType "application/json"
  Write-Host "Suspend Action Success! Message: $($suspendRes.message)" -ForegroundColor Green

  $subRes2 = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$testRestId/subscription" -Method GET -Headers @{ "x-restaurant-token" = $restToken }
  Write-Host "Verified Suspended Status: $($subRes2.subscription.status)" -ForegroundColor Green

  $reactivateBody = @{ suspend = $false } | ConvertTo-Json
  $reactivateRes = Invoke-RestMethod -Uri "$baseUrl/api/owner/restaurants/$testRestId/suspend" -Method POST -Headers @{ "x-owner-token" = $sessionToken } -Body $reactivateBody -ContentType "application/json"
  Write-Host "Reactivated Success! Status: $($reactivateRes.restaurant.status)" -ForegroundColor Green

  Write-Host "`nALL BACKEND API TESTS COMPLETED." -ForegroundColor Green
} catch {
  Write-Host "Test execution error: $_" -ForegroundColor Red
}
