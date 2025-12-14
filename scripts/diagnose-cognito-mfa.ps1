# PowerShell script to diagnose Cognito MFA setup issues
# Usage: .\diagnose-cognito-mfa.ps1 -UserPoolId <pool-id> -Region <region> -User1 <user1> -User2 <user2>

param(
    [string]$UserPoolId = "us-east-1_kpXZ426n8",
    [string]$Region = "us-east-1",
    [string]$User1 = "mohammadh@encryptgate.net",
    [string]$User2 = "contact@encryptgate.net"
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Cognito MFA Diagnostic Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "User Pool ID: $UserPoolId"
Write-Host "Region: $Region"
Write-Host ""

# 1. Check User Pool MFA Configuration
Write-Host "1. Checking User Pool MFA Configuration..." -ForegroundColor Yellow
Write-Host "-------------------------------------------"
aws cognito-idp describe-user-pool `
  --user-pool-id $UserPoolId `
  --region $Region `
  --query 'UserPool.{MfaConfiguration: MfaConfiguration, SoftwareTokenMfaConfiguration: SoftwareTokenMfaConfiguration}' `
  --output json

Write-Host ""
Write-Host "2. Checking User Pool MFA Settings (detailed)..." -ForegroundColor Yellow
Write-Host "-------------------------------------------"
aws cognito-idp describe-user-pool `
  --user-pool-id $UserPoolId `
  --region $Region `
  --query 'UserPool.Policies.{PasswordPolicy: PasswordPolicy}' `
  --output json

Write-Host ""
Write-Host "3. Checking User 1 ($User1)..." -ForegroundColor Yellow
Write-Host "-------------------------------------------"
aws cognito-idp admin-get-user `
  --user-pool-id $UserPoolId `
  --username $User1 `
  --region $Region `
  --query '{Username: Username, UserStatus: UserStatus, Enabled: Enabled, MFAOptions: MFAOptions, UserAttributes: UserAttributes[?Name==`email_verified` || Name==`email`]}' `
  --output json

Write-Host ""
Write-Host "4. Checking User 2 ($User2)..." -ForegroundColor Yellow
Write-Host "-------------------------------------------"
aws cognito-idp admin-get-user `
  --user-pool-id $UserPoolId `
  --username $User2 `
  --region $Region `
  --query '{Username: Username, UserStatus: UserStatus, Enabled: Enabled, MFAOptions: MFAOptions, UserAttributes: UserAttributes[?Name==`email_verified` || Name==`email`]}' `
  --output json

Write-Host ""
Write-Host "5. Listing all MFA devices for User 1..." -ForegroundColor Yellow
Write-Host "-------------------------------------------"
aws cognito-idp admin-list-devices `
  --user-pool-id $UserPoolId `
  --username $User1 `
  --region $Region `
  --output json

Write-Host ""
Write-Host "6. Listing all MFA devices for User 2..." -ForegroundColor Yellow
Write-Host "-------------------------------------------"
aws cognito-idp admin-list-devices `
  --user-pool-id $UserPoolId `
  --username $User2 `
  --region $Region `
  --output json

Write-Host ""
Write-Host "7. Checking User Pool Client Settings..." -ForegroundColor Yellow
Write-Host "-------------------------------------------"
$ClientIds = aws cognito-idp list-user-pool-clients `
  --user-pool-id $UserPoolId `
  --region $Region `
  --query 'UserPoolClients[*].ClientId' `
  --output text

Write-Host "Client IDs found: $ClientIds"
Write-Host ""

foreach ($ClientId in ($ClientIds -split "`t")) {
    if ($ClientId) {
        Write-Host "Client: $ClientId"
        aws cognito-idp describe-user-pool-client `
          --user-pool-id $UserPoolId `
          --client-id $ClientId `
          --region $Region `
          --query '{ClientId: ClientId, ClientName: ClientName, GenerateSecret: GenerateSecret, ExplicitAuthFlows: ExplicitAuthFlows}' `
          --output json
        Write-Host ""
    }
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Diagnostic Complete" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

