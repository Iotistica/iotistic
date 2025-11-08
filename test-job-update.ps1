# Test MQTT Jobs Update to debug jobId extraction

$deviceUuid = "df7c51d3-a3b7-4c73-babd-eef214efae59"
$jobId = "test-job-123"
$topic = "iot/device/$deviceUuid/jobs/$jobId/update"

$payload = @{
    status = "IN_PROGRESS"
    statusDetails = @{
        message = "Test job execution"
        progress = 50
    }
} | ConvertTo-Json -Compress

Write-Host "Publishing to topic: $topic"
Write-Host "Payload: $payload"

# Publish using admin credentials (superuser)
# The admin user bypasses ACLs so can publish to any topic
docker run --rm --network zemfyre-sensor_default `
    eclipse-mosquitto `
    mosquitto_pub `
    -h mosquitto `
    -p 1883 `
    -u admin `
    -P admin `
    -t $topic `
    -m $payload `
    -q 1

Write-Host "Message published. Check API logs for debug output."
