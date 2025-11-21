# Test Device Flow Extraction
# This script triggers extraction by posting flows to the storage API

Write-Host "Fetching current flows from storage API..." -ForegroundColor Cyan

$apiKey = "5317a772-c8dc-b8af-af76-fce09c973db0034da53b-e5e3-1d36-93a7-ec53de09c4af"
$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

# Get flows
$response = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/nr/storage/flows" -Headers $headers -Method Get
Write-Host "✓ Fetched $($response.flows.Count) flow objects" -ForegroundColor Green

# Re-save flows to trigger extraction
Write-Host "`nTriggering device flow extraction by re-saving flows..." -ForegroundColor Cyan
$body = $response.flows | ConvertTo-Json -Depth 100 -Compress
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/nr/storage/flows" -Headers $headers -Method Post -Body $body | Out-Null

Write-Host "✓ Flows saved, extraction triggered" -ForegroundColor Green

# Wait for processing
Start-Sleep -Seconds 2

# Check device_flows table
Write-Host "`nChecking device_flows table..." -ForegroundColor Cyan
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT device_uuid, subflow_id, subflow_name, hash, version, created_at, deployed_at FROM device_flows ORDER BY created_at DESC"

Write-Host "`nChecking API logs for extraction messages..." -ForegroundColor Cyan
docker logs iotistic-api --tail 50 | Select-String -Pattern "device flow|Device flow|extraction|subflow" | Select-Object -Last 10
