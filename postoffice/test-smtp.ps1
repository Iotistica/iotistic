# PostOffice SMTP Test Script
# Tests email sending functionality with your SMTP configuration

Write-Host "🔧 PostOffice SMTP Test Script" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Load environment variables from .env if it exists
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Write-Host "Loading environment from .env file..." -ForegroundColor Yellow
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value, [System.EnvironmentVariableTarget]::Process)
        }
    }
} else {
    Write-Host "⚠️  No .env file found. Using environment variables or defaults." -ForegroundColor Yellow
}

# Get configuration
$smtpHost = $env:SMTP_HOST
$smtpPort = $env:SMTP_PORT
$smtpUser = $env:SMTP_USER
$smtpPass = $env:SMTP_PASS
$smtpSecure = $env:SMTP_SECURE -eq 'true'
$emailFrom = $env:EMAIL_FROM
$emailEnabled = $env:EMAIL_ENABLED -ne 'false'

Write-Host "`n📋 Current Configuration:" -ForegroundColor Cyan
Write-Host "  EMAIL_ENABLED: $emailEnabled" -ForegroundColor White
Write-Host "  EMAIL_FROM: $emailFrom" -ForegroundColor White
Write-Host "  SMTP_HOST: $smtpHost" -ForegroundColor White
Write-Host "  SMTP_PORT: $smtpPort" -ForegroundColor White
Write-Host "  SMTP_SECURE: $smtpSecure" -ForegroundColor White
Write-Host "  SMTP_USER: $smtpUser" -ForegroundColor White
Write-Host "  SMTP_PASS: $(if ($smtpPass) { '***' + $smtpPass.Substring($smtpPass.Length - 4) } else { 'not set' })" -ForegroundColor White

if (-not $smtpHost) {
    Write-Host "`n❌ SMTP_HOST is not configured!" -ForegroundColor Red
    Write-Host "   Please set up your .env file with SMTP credentials." -ForegroundColor Yellow
    Write-Host "   See .env.example for reference." -ForegroundColor Yellow
    exit 1
}

# Get test email recipient
Write-Host "`n📧 Test Email Configuration:" -ForegroundColor Cyan
$testEmail = Read-Host "Enter test recipient email address"

if (-not $testEmail) {
    Write-Host "❌ Email address is required!" -ForegroundColor Red
    exit 1
}

$testName = Read-Host "Enter recipient name (optional, press Enter to skip)"
if (-not $testName) {
    $testName = "Test User"
}

# Get PostOffice service URL
$serviceUrl = $env:POSTOFFICE_URL
if (-not $serviceUrl) {
    $serviceUrl = Read-Host "Enter PostOffice service URL (default: http://localhost:3300)"
    if (-not $serviceUrl) {
        $serviceUrl = "http://localhost:3300"
    }
}

Write-Host "`n🔍 Testing connection to PostOffice service..." -ForegroundColor Cyan

try {
    $healthResponse = Invoke-RestMethod -Uri "$serviceUrl/health" -Method Get -ErrorAction Stop
    Write-Host "✅ Service is healthy" -ForegroundColor Green
    Write-Host "   Email enabled: $($healthResponse.email.enabled)" -ForegroundColor White
    
    if (-not $healthResponse.email.enabled) {
        Write-Host "`n⚠️  Email is disabled in the service!" -ForegroundColor Yellow
        Write-Host "   Check your EMAIL_ENABLED and SMTP configuration." -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Failed to connect to PostOffice service at $serviceUrl" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host "`n   Is the service running? Try:" -ForegroundColor Yellow
    Write-Host "   docker-compose up -d" -ForegroundColor Cyan
    exit 1
}

Write-Host "`n📨 Sending test email..." -ForegroundColor Cyan

# Prepare request body
$body = @{
    user = @{
        email = $testEmail
        name = $testName
    }
    templateName = "VerifyEmail"
    context = @{
        token = "test-token-123456"
        testMode = $true
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$serviceUrl/api/email/send" -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
    
    Write-Host "✅ Email queued successfully!" -ForegroundColor Green
    Write-Host "   Job ID: $($response.jobId)" -ForegroundColor White
    
    Write-Host "`n⏳ Waiting for email to be processed..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5
    
    # Check job status
    try {
        $logResponse = Invoke-RestMethod -Uri "$serviceUrl/api/email/logs/$($response.jobId)" -Method Get -ErrorAction Stop
        
        Write-Host "`n📊 Email Status:" -ForegroundColor Cyan
        Write-Host "   Job ID: $($logResponse.job_id)" -ForegroundColor White
        Write-Host "   Status: $($logResponse.status)" -ForegroundColor $(if ($logResponse.status -eq 'sent') { 'Green' } elseif ($logResponse.status -eq 'failed') { 'Red' } else { 'Yellow' })
        Write-Host "   Template: $($logResponse.template_name)" -ForegroundColor White
        Write-Host "   Queued at: $($logResponse.queued_at)" -ForegroundColor White
        
        if ($logResponse.sent_at) {
            Write-Host "   Sent at: $($logResponse.sent_at)" -ForegroundColor White
        }
        
        if ($logResponse.failed_at) {
            Write-Host "   Failed at: $($logResponse.failed_at)" -ForegroundColor Red
            Write-Host "   Error: $($logResponse.error_message)" -ForegroundColor Red
        }
        
        if ($logResponse.status -eq 'sent') {
            Write-Host "`n✅ SUCCESS! Check your inbox at $testEmail" -ForegroundColor Green
        } elseif ($logResponse.status -eq 'failed') {
            Write-Host "`n❌ Email failed to send. Check the error above." -ForegroundColor Red
        } else {
            Write-Host "`n⏳ Email is still being processed (status: $($logResponse.status))" -ForegroundColor Yellow
            Write-Host "   Check Bull Board UI at $serviceUrl/admin/queues for details" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "`n⚠️  Could not fetch email log (this is normal if job is still processing)" -ForegroundColor Yellow
        Write-Host "   Check Bull Board UI at $serviceUrl/admin/queues for job status" -ForegroundColor Cyan
    }
    
} catch {
    Write-Host "❌ Failed to send email" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   Details: $($errorDetails.error)" -ForegroundColor Red
    }
    
    exit 1
}

Write-Host "`n📊 Additional Commands:" -ForegroundColor Cyan
Write-Host "  View queue stats:  Invoke-RestMethod -Uri '$serviceUrl/api/email/stats' | ConvertTo-Json" -ForegroundColor White
Write-Host "  View recent logs:  Invoke-RestMethod -Uri '$serviceUrl/api/email/logs' | ConvertTo-Json" -ForegroundColor White
Write-Host "  View failed jobs:  Invoke-RestMethod -Uri '$serviceUrl/api/email/failed' | ConvertTo-Json" -ForegroundColor White
Write-Host "  Bull Board UI:     $serviceUrl/admin/queues" -ForegroundColor White

Write-Host "`n✅ Test completed!" -ForegroundColor Green
