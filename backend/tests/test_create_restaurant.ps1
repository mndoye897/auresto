$body = @{
    name = "Restaurant Dakar"
    address = "Boulevard de la République"
    city = "Dakar"
    phone = "+221770000000"
    description = "Restaurant sénégalais authentique"
    location = @{
        latitude = 14.6928
        longitude = -17.0469
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/restaurants" -Method Post -ContentType 'application/json' -Body $body
