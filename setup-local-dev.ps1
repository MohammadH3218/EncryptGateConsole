# EncryptGate Console - Local Development Setup Script
# This script helps you set up your local development environment

Write-Host "EncryptGate Console - Local Development Setup" -ForegroundColor Cyan
Write-Host ""

# Check if .env.local exists
if (Test-Path .env.local) {
    Write-Host "[!] .env.local already exists. Skipping creation." -ForegroundColor Yellow
    Write-Host "   If you want to recreate it, delete it first and run this script again." -ForegroundColor Yellow
} else {
    Write-Host "[*] Creating .env.local from template..." -ForegroundColor Green
    Copy-Item .env.local.example .env.local
    Write-Host "[+] Created .env.local" -ForegroundColor Green
    Write-Host "   [!] IMPORTANT: Edit .env.local and add your actual values:" -ForegroundColor Yellow
    Write-Host "      - Replace YOUR_EC2_IP_OR_DOMAIN with your EC2 instance IP" -ForegroundColor Yellow
    Write-Host "      - OPENAI_API_KEY (already configured)" -ForegroundColor Yellow
    Write-Host "      - AWS credentials (already configured)" -ForegroundColor Yellow
    Write-Host "      - Cognito credentials (already configured)" -ForegroundColor Yellow
}

# Check if .env exists
if (Test-Path .env) {
    Write-Host "[!] .env already exists. Skipping creation." -ForegroundColor Yellow
    Write-Host "   If you want to recreate it, delete it first and run this script again." -ForegroundColor Yellow
} else {
    Write-Host "[*] Creating .env from template..." -ForegroundColor Green
    Copy-Item .env.example .env
    Write-Host "[+] Created .env" -ForegroundColor Green
    Write-Host "   [!] IMPORTANT: Edit .env and add your actual values:" -ForegroundColor Yellow
    Write-Host "      - Replace YOUR_EC2_IP_OR_DOMAIN with your EC2 instance IP" -ForegroundColor Yellow
    Write-Host "      - OPENAI_API_KEY (already configured)" -ForegroundColor Yellow
    Write-Host "      - AWS credentials (already configured)" -ForegroundColor Yellow
    Write-Host "      - Cognito credentials (already configured)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[*] Checking dependencies..." -ForegroundColor Cyan

# Check Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "[+] Node.js installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "[-] Node.js not found. Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
}

# Check Python
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonVersion = python --version
    Write-Host "[+] Python installed: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "[-] Python not found. Please install Python 3.10+ from https://python.org" -ForegroundColor Red
}

Write-Host ""
Write-Host "[*] Next steps:" -ForegroundColor Cyan
Write-Host "   1. Install frontend dependencies: npm install" -ForegroundColor White
Write-Host "   2. Create Python virtual environment: python -m venv .venv" -ForegroundColor White
Write-Host "   3. Activate virtual environment: .venv\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "   4. Install backend dependencies: pip install -r requirements.txt" -ForegroundColor White
Write-Host "   5. Edit .env.local and .env - Replace YOUR_EC2_IP_OR_DOMAIN with your EC2 IP" -ForegroundColor White
Write-Host "   6. Configure EC2 security group to allow port 7687 from your IP" -ForegroundColor White
Write-Host "   7. Start backend: python main.py" -ForegroundColor White
Write-Host "   8. Start frontend: npm run dev:local" -ForegroundColor White
Write-Host ""
Write-Host "For detailed instructions, see LOCAL_DEVELOPMENT.md" -ForegroundColor Cyan
Write-Host "For Neo4j EC2 setup, see NEO4J_EC2_SETUP.md" -ForegroundColor Cyan
Write-Host ""
