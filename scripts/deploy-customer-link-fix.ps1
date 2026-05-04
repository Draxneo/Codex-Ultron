# PowerShell deployment script for customer link enforcement
# Deploys the three updated Edge Functions that now populate related_customer_id

$projectRef = "tqkqqjvddfrcxrxfvzvz"

Write-Host "Deploying customer link enforcement fix..." -ForegroundColor Green

# Deploy voice-webhook
Write-Host "Deploying voice-webhook..." -ForegroundColor Cyan
npx supabase functions deploy voice-webhook --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: voice-webhook deployment failed" -ForegroundColor Red
  exit 1
}

# Deploy sms-webhook
Write-Host "Deploying sms-webhook..." -ForegroundColor Cyan
npx supabase functions deploy sms-webhook --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: sms-webhook deployment failed" -ForegroundColor Red
  exit 1
}

# Deploy send-sms
Write-Host "Deploying send-sms..." -ForegroundColor Cyan
npx supabase functions deploy send-sms --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: send-sms deployment failed" -ForegroundColor Red
  exit 1
}

Write-Host "All deployments completed successfully!" -ForegroundColor Green
