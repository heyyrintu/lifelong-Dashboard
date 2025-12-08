# Production Build Script for Lifelong Dashboard (Windows)
# Run this script with: .\build-production.ps1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Lifelong Dashboard Production Build" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Function to print colored output
function Print-Success {
    param($message)
    Write-Host "✓ $message" -ForegroundColor Green
}

function Print-Info {
    param($message)
    Write-Host "→ $message" -ForegroundColor Yellow
}

function Print-Error {
    param($message)
    Write-Host "✗ $message" -ForegroundColor Red
}

# Check if .env files exist
Print-Info "Checking environment files..."
if (-not (Test-Path ".env.local")) {
    Print-Error ".env.local not found! Please create from .env.example"
    exit 1
}

if (-not (Test-Path "backend\.env")) {
    Print-Error "backend\.env not found! Please create from backend\.env.example"
    exit 1
}
Print-Success "Environment files found"

# Build Frontend
Print-Info "Building frontend..."
npm ci --only=production
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run type-check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run lint:fix
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run production:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Print-Success "Frontend build completed"

# Build Backend
Print-Info "Building backend..."
Set-Location backend

npm ci --only=production
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Print-Success "Backend build completed"
Set-Location ..

# Create logs directory
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
}
if (-not (Test-Path "backend\logs")) {
    New-Item -ItemType Directory -Path "backend\logs" | Out-Null
}

Write-Host ""
Print-Success "Build completed successfully!"
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1. Start frontend: npm start"
Write-Host "2. Start backend: cd backend; npm run start:prod"
Write-Host "3. Or use PM2: pm2 start ecosystem.config.js"
Write-Host "==========================================" -ForegroundColor Cyan
