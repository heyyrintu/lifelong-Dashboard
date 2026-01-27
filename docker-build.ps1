# ============================================
# Lifelong Dashboard - Docker Build Script (Windows)
# ============================================

param(
    [Parameter(Position=0)]
    [ValidateSet("build", "up", "down", "restart", "logs", "status", "clean", "migrate", "prisma-studio")]
    [string]$Action = "build"
)

function Write-Info { param($msg) Write-Host "→ $msg" -ForegroundColor Yellow }
function Write-Success { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Err { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Lifelong Dashboard - Docker Build" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check for .env file
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.docker") {
        Write-Info "No .env file found. Creating from .env.docker..."
        Copy-Item ".env.docker" ".env"
        Write-Success "Created .env file. Please update with your values."
    } else {
        Write-Err "No .env or .env.docker file found!"
        exit 1
    }
}

switch ($Action) {
    "build" {
        Write-Info "Building Docker images..."
        docker-compose build --no-cache
        if ($LASTEXITCODE -eq 0) { Write-Success "Build completed!" }
    }
    
    "up" {
        Write-Info "Starting services..."
        docker-compose up -d
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Services started!"
            Write-Host ""
            Write-Host "Frontend: http://localhost:3000"
            Write-Host "Backend:  http://localhost:3001"
            Write-Host "Postgres: localhost:5432"
        }
    }
    
    "down" {
        Write-Info "Stopping services..."
        docker-compose down
        if ($LASTEXITCODE -eq 0) { Write-Success "Services stopped!" }
    }
    
    "restart" {
        Write-Info "Restarting services..."
        docker-compose down
        docker-compose up -d
        if ($LASTEXITCODE -eq 0) { Write-Success "Services restarted!" }
    }
    
    "logs" {
        docker-compose logs -f
    }
    
    "status" {
        docker-compose ps
    }
    
    "clean" {
        Write-Info "Cleaning up Docker resources..."
        docker-compose down -v --rmi local
        if ($LASTEXITCODE -eq 0) { Write-Success "Cleanup completed!" }
    }
    
    "migrate" {
        Write-Info "Running database migrations..."
        docker-compose exec backend npx prisma migrate deploy
        if ($LASTEXITCODE -eq 0) { Write-Success "Migrations completed!" }
    }
    
    "prisma-studio" {
        Write-Info "Opening Prisma Studio..."
        docker-compose exec backend npx prisma studio
    }
}

Write-Host ""
Write-Host "Usage: .\docker-build.ps1 {build|up|down|restart|logs|status|clean|migrate|prisma-studio}" -ForegroundColor Gray
