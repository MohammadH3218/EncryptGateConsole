# Set DistilBERT Configuration
# Run this AFTER Elastic Beanstalk environment is in "Ready" state

Write-Host "Setting DistilBERT configuration..." -ForegroundColor Cyan

# Set Parameter Store
Write-Host "`n1. Setting Parameter Store..." -ForegroundColor Yellow
$distilbertUrl = "http://127.0.0.1:8001/predict"
aws ssm put-parameter `
  --region us-east-1 `
  --name "/encryptgate/distilbert-url" `
  --value "$distilbertUrl" `
  --type "String" `
  --overwrite `
  --description "DistilBERT phishing detection service URL"

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Parameter Store updated" -ForegroundColor Green
} else {
    Write-Host "   ✗ Failed to update Parameter Store" -ForegroundColor Red
}

# Set Elastic Beanstalk Environment Variable
Write-Host "`n2. Setting Elastic Beanstalk environment variable..." -ForegroundColor Yellow
aws elasticbeanstalk update-environment `
  --region us-east-1 `
  --application-name EncryptGateConsole `
  --environment-name EncryptGateConsole-env `
  --option-settings "Namespace=aws:elasticbeanstalk:application:environment,OptionName=DISTILBERT_URL,Value=$distilbertUrl"

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Environment variable updated" -ForegroundColor Green
    Write-Host "   ⏳ Environment update in progress..." -ForegroundColor Yellow
} else {
    Write-Host "   ✗ Failed to update environment variable" -ForegroundColor Red
    Write-Host "   (Environment might not be in Ready state)" -ForegroundColor Yellow
}

Write-Host "`n✅ Configuration complete!" -ForegroundColor Green
Write-Host "`nNext: Deploy your code to Elastic Beanstalk" -ForegroundColor Cyan

