#!/bin/bash
# ============================================
# Lifelong Dashboard - Docker Build Script
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}=========================================="
echo "Lifelong Dashboard - Docker Build"
echo -e "==========================================${NC}"
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.docker" ]; then
        echo -e "${YELLOW}→ No .env file found. Creating from .env.docker...${NC}"
        cp .env.docker .env
        echo -e "${GREEN}✓ Created .env file. Please update with your values.${NC}"
    else
        echo -e "${RED}✗ No .env or .env.docker file found!${NC}"
        exit 1
    fi
fi

# Parse command line arguments
ACTION=${1:-"build"}

case $ACTION in
    "build")
        echo -e "${YELLOW}→ Building Docker images...${NC}"
        docker-compose build --no-cache
        echo -e "${GREEN}✓ Build completed!${NC}"
        ;;
    
    "up")
        echo -e "${YELLOW}→ Starting services...${NC}"
        docker-compose up -d
        echo -e "${GREEN}✓ Services started!${NC}"
        echo ""
        echo "Frontend: http://localhost:3000"
        echo "Backend:  http://localhost:3001"
        echo "Postgres: localhost:5432"
        ;;
    
    "down")
        echo -e "${YELLOW}→ Stopping services...${NC}"
        docker-compose down
        echo -e "${GREEN}✓ Services stopped!${NC}"
        ;;
    
    "restart")
        echo -e "${YELLOW}→ Restarting services...${NC}"
        docker-compose down
        docker-compose up -d
        echo -e "${GREEN}✓ Services restarted!${NC}"
        ;;
    
    "logs")
        docker-compose logs -f
        ;;
    
    "status")
        docker-compose ps
        ;;
    
    "clean")
        echo -e "${YELLOW}→ Cleaning up Docker resources...${NC}"
        docker-compose down -v --rmi local
        echo -e "${GREEN}✓ Cleanup completed!${NC}"
        ;;
    
    "migrate")
        echo -e "${YELLOW}→ Running database migrations...${NC}"
        docker-compose exec backend npx prisma migrate deploy
        echo -e "${GREEN}✓ Migrations completed!${NC}"
        ;;
    
    "prisma-studio")
        echo -e "${YELLOW}→ Opening Prisma Studio...${NC}"
        docker-compose exec backend npx prisma studio
        ;;
    
    *)
        echo "Usage: $0 {build|up|down|restart|logs|status|clean|migrate|prisma-studio}"
        echo ""
        echo "Commands:"
        echo "  build        - Build Docker images"
        echo "  up           - Start all services"
        echo "  down         - Stop all services"
        echo "  restart      - Restart all services"
        echo "  logs         - View service logs"
        echo "  status       - Show service status"
        echo "  clean        - Remove containers, volumes, and images"
        echo "  migrate      - Run database migrations"
        echo "  prisma-studio - Open Prisma Studio"
        exit 1
        ;;
esac
