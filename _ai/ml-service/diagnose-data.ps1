# Diagnose Device Shadow History Data
# Checks what data exists for ML training

param(
    [Parameter(Mandatory=$false)]
    [string]$DeviceUuid = "46b68204-9806-43c5-8d19-18b1f53e3b8a"
)

Write-Host "🔍 Diagnosing Device Shadow History for ML Training`n" -ForegroundColor Cyan

# Step 1: Check if device exists in device_shadows table
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "STEP 1: Checking device_shadows table" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$query1 = @"
SELECT device_uuid, device_name, status, last_updated, 
       jsonb_pretty(reported_state) as reported_state_sample
FROM device_shadows 
WHERE device_uuid = '$DeviceUuid';
"@

Write-Host "`nQuery: " -ForegroundColor Cyan -NoNewline
Write-Host "SELECT * FROM device_shadows WHERE device_uuid = '$DeviceUuid'`n" -ForegroundColor White

docker exec iotistic-postgres psql -U postgres -d iotistic -c "$query1"

# Step 2: Check device_shadow_history table
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "STEP 2: Checking device_shadow_history table" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$query2 = @"
SELECT COUNT(*) as total_records,
       MIN(timestamp) as oldest_record,
       MAX(timestamp) as newest_record
FROM device_shadow_history 
WHERE device_uuid = '$DeviceUuid';
"@

Write-Host "`nQuery: " -ForegroundColor Cyan -NoNewline
Write-Host "SELECT COUNT(*) FROM device_shadow_history WHERE device_uuid = '$DeviceUuid'`n" -ForegroundColor White

docker exec iotistic-postgres psql -U postgres -d iotistic -c "$query2"

# Step 3: Sample data from history table
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "STEP 3: Sample data structure (first 2 records)" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$query3 = @"
SELECT timestamp, jsonb_pretty(reported_state) as reported_state
FROM device_shadow_history 
WHERE device_uuid = '$DeviceUuid'
ORDER BY timestamp DESC
LIMIT 2;
"@

Write-Host "`nQuery: " -ForegroundColor Cyan -NoNewline
Write-Host "SELECT * FROM device_shadow_history ORDER BY timestamp DESC LIMIT 2`n" -ForegroundColor White

docker exec iotistic-postgres psql -U postgres -d iotistic -c "$query3"

# Step 4: Check available JSON fields
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "STEP 4: Available JSON fields in reported_state" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$query4 = @"
SELECT DISTINCT jsonb_object_keys(reported_state) as top_level_keys
FROM device_shadow_history 
WHERE device_uuid = '$DeviceUuid'
LIMIT 10;
"@

Write-Host "`nQuery: " -ForegroundColor Cyan -NoNewline
Write-Host "SELECT DISTINCT jsonb_object_keys(reported_state)`n" -ForegroundColor White

docker exec iotistic-postgres psql -U postgres -d iotistic -c "$query4"

# Step 5: Check if 'system' field exists
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "STEP 5: Checking for 'system' field (required for ML)" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$query5 = @"
SELECT COUNT(*) as records_with_system_field
FROM device_shadow_history 
WHERE device_uuid = '$DeviceUuid'
  AND reported_state ? 'system';
"@

Write-Host "`nQuery: " -ForegroundColor Cyan -NoNewline
Write-Host "SELECT COUNT(*) WHERE reported_state ? 'system'`n" -ForegroundColor White

docker exec iotistic-postgres psql -U postgres -d iotistic -c "$query5"

# Step 6: Check all devices in history table
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "STEP 6: All devices in device_shadow_history" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$query6 = @"
SELECT device_uuid, COUNT(*) as record_count,
       MIN(timestamp) as oldest,
       MAX(timestamp) as newest
FROM device_shadow_history 
GROUP BY device_uuid
ORDER BY record_count DESC;
"@

Write-Host "`nQuery: " -ForegroundColor Cyan -NoNewline
Write-Host "SELECT device_uuid, COUNT(*) FROM device_shadow_history GROUP BY device_uuid`n" -ForegroundColor White

docker exec iotistic-postgres psql -U postgres -d iotistic -c "$query6"

# Summary
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📊 DIAGNOSIS SUMMARY" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host "`n💡 What to look for:" -ForegroundColor Yellow
Write-Host "   1. Does the device exist in device_shadows table?" -ForegroundColor White
Write-Host "   2. Are there records in device_shadow_history?" -ForegroundColor White
Write-Host "   3. Does reported_state have these fields?" -ForegroundColor White
Write-Host "      • system.cpuUsage" -ForegroundColor Gray
Write-Host "      • system.memoryUsed" -ForegroundColor Gray
Write-Host "      • system.memoryTotal" -ForegroundColor Gray
Write-Host "      • system.diskUsed" -ForegroundColor Gray
Write-Host "      • system.diskTotal" -ForegroundColor Gray
Write-Host ""

Write-Host "📋 Common Issues:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Issue 1: No historical data" -ForegroundColor Red
Write-Host "   Solution: Device needs to report data first. Check if device agent is running." -ForegroundColor White
Write-Host ""
Write-Host "   Issue 2: Different field structure" -ForegroundColor Red
Write-Host "   Solution: Update data_fetcher.py to match your actual JSON structure." -ForegroundColor White
Write-Host ""
Write-Host "   Issue 3: Wrong device UUID" -ForegroundColor Red
Write-Host "   Solution: Use a device UUID that exists in the database." -ForegroundColor White
Write-Host ""

Write-Host "🔗 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Review the output above" -ForegroundColor White
Write-Host "   2. If no data: Start your device agent to populate history" -ForegroundColor White
Write-Host "   3. If different fields: Update ml-service/services/data_fetcher.py" -ForegroundColor White
Write-Host "   4. If wrong UUID: Use a device UUID from Step 6 output`n" -ForegroundColor White
