# Auresto — Test du flux API principal
# Crée un restaurant jetable et valide : création, menu, full-state,
# commande client, changement de statut, avis.
# Prérequis : backend démarré (cd backend; npm run dev) sur localhost:4000
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$baseUrl = if ($env:AURESTO_API_BASE) { $env:AURESTO_API_BASE } else { "http://localhost:4000" }
$suffix = Get-Random -Minimum 1000 -Maximum 99999

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

# 1. Health
try {
  $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
  Assert "Health endpoint" ($health.ok -eq $true)
} catch {
  Assert "Health endpoint (serveur démarré)" $false
  Write-Host "Démarrez le backend : cd backend; npm run dev" -ForegroundColor Yellow
  exit 1
}

# 2. Création restaurant (route publique, renvoie le token UNE seule fois)
$restBody = @{
  name = "Test API $suffix"
  city = "Dakar"
  phone = "+22177000000"
  ownerEmail = "api-test-$suffix@example.sn"
} | ConvertTo-Json
$rest = Invoke-RestMethod -Uri "$baseUrl/api/restaurants" -Method Post -ContentType "application/json" -Body $restBody
Assert "Restaurant créé avec access_token" ($null -ne $rest.access_token)
Assert "owner_email enregistré (camelCase)" ($rest.owner_email -eq "api-test-$suffix@example.sn")
$id = $rest.id
$token = $rest.access_token

# 3. GET restaurant : le token ne doit JAMAIS y figurer
$fetched = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id" -Method Get -Headers @{ "x-restaurant-token" = $token }
Assert "GET restaurant ne fuit pas access_token" (-not ($fetched.PSObject.Properties.Name -contains "access_token"))

# 4. PUT restaurant (mise à jour) : pas de fuite non plus
$updateBody = @{ name = "Test API MAJ $suffix"; city = "Dakar"; phone = "+22177000000"; description = "MAJ" } | ConvertTo-Json
$updated = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id" -Method Put -Headers @{ "x-restaurant-token" = $token } -ContentType "application/json" -Body $updateBody
Assert "PUT restaurant ne fuit pas access_token" (-not ($updated.PSObject.Properties.Name -contains "access_token"))

# 5. Menu : ajout authentifié + lecture authentifiée
$menuBody = @{ name = "Thiéboudienne"; description = "Riz au poisson et légumes"; price = 4500 } | ConvertTo-Json
$item = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id/menu" -Method Post -Headers @{ "x-restaurant-token" = $token } -ContentType "application/json" -Body $menuBody
Assert "Plat ajouté" ($null -ne $item.id)
$menu = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id/menu" -Method Get -Headers @{ "x-restaurant-token" = $token }
Assert "Menu lisible (authentifié)" (@($menu).Count -ge 1)

# 6. Sans token, la lecture du menu doit être refusée
try {
  Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id/menu" -Method Get | Out-Null
  Assert "Menu refusé sans jeton" $false
} catch {
  Assert "Menu refusé sans jeton" $true
}

# 7. full-state public (scan QR) : menu + restaurant, jamais de token
$state = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id/full-state" -Method Get
Assert "full-state public renvoie le restaurant" ($null -ne $state.restaurant)
Assert "full-state ne fuit pas access_token" (-not ($state.restaurant.PSObject.Properties.Name -contains "access_token"))
Assert "full-state renvoie le menu" (@($state.menu.items).Count -ge 1)

# 8. Commande cliente (route publique, total recalculé côté serveur)
$orderBody = @{
  tableName = "T4"
  customerName = "Awa"
  items = @(@{ name = "Thiéboudienne"; price = 4500; qty = 2; category = "Plats" })
} | ConvertTo-Json
$order = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id/orders" -Method Post -ContentType "application/json" -Body $orderBody
Assert "Commande créée (statut new)" ($order.ok -eq $true -and $order.order.status -eq "new")
Assert "Total recalculé serveur (4500 x 2)" ($order.order.total -eq 9000)

# 9. Changement de statut par le staff
$statusBody = @{ status = "preparing" } | ConvertTo-Json
$upd = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id/orders/$($order.order.id)/status" -Method Patch -Headers @{ "x-restaurant-token" = $token } -ContentType "application/json" -Body $statusBody
Assert "Statut mis à jour par le staff" ($upd.order.status -eq "preparing")

# 10. Avis client (public) + lecture (authentifiée)
$reviewBody = @{ rating = 5; comment = "Excellent !"; customerName = "Awa" } | ConvertTo-Json
$rev = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id/reviews" -Method Post -ContentType "application/json" -Body $reviewBody
Assert "Avis déposé" ($rev.ok -eq $true)
$reviews = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/$id/reviews" -Method Get -Headers @{ "x-restaurant-token" = $token }
Assert "Avis lisible par le restaurant" ($reviews.stats.total -ge 1)

Write-Host "`n=== Résumé : $passed réussi(s), $failed échec(s) ===" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }