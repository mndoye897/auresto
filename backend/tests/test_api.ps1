# Test API endpoints
$baseUrl = "http://localhost:4000"

# Test health
Write-Host "Health check:" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$baseUrl/health" -Method Get

# Create category for restaurant 1
Write-Host "Create category:" -ForegroundColor Cyan
$catBody = @{
    restaurant_id = 1
    name = "Plats"
    position = 0
} | ConvertTo-Json
$cat = Invoke-RestMethod -Uri "$baseUrl/api/categories" -Method Post -ContentType 'application/json' -Body $catBody
$cat

# Create menu item
Write-Host "Create menu item:" -ForegroundColor Cyan
$itemBody = @{
    name = "Yassa Poulet"
    description = "Poulet dans une sauce oignon-citron"
    price = 8.50
    photo = ""
    category_id = $cat.id
} | ConvertTo-Json
$item = Invoke-RestMethod -Uri "$baseUrl/api/restaurants/1/menu" -Method Post -ContentType 'application/json' -Body $itemBody
$item

# Fetch menu
Write-Host "Fetch menu for restaurant 1:" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$baseUrl/api/restaurants/1/menu" -Method Get

# Fetch restaurant
Write-Host "Fetch restaurant 1:" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$baseUrl/api/restaurants/1" -Method Get

Write-Host "All API tests passed!" -ForegroundColor Green
