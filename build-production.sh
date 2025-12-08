#!/bin/bash

# Production Build Script for Lifelong Dashboard
# This script builds both frontend and backend for production deployment

set -e  # Exit on error

echo "=========================================="
echo "Lifelong Dashboard Production Build"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if .env files exist
print_info "Checking environment files..."
if [ ! -f ".env.local" ]; then
    print_error ".env.local not found! Please create from .env.example"
    exit 1
fi

if [ ! -f "backend/.env" ]; then
    print_error "backend/.env not found! Please create from backend/.env.example"
    exit 1
fi
print_success "Environment files found"

# Build Frontend
print_info "Building frontend..."
npm ci --only=production
npm run type-check
npm run lint:fix
npm run production:build
print_success "Frontend build completed"

# Build Backend
print_info "Building backend..."
cd backend
npm ci --only=production
npx prisma generate
npm run build
print_success "Backend build completed"
cd ..

# Create logs directory
mkdir -p logs
mkdir -p backend/logs

print_success "Build completed successfully!"
echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Start frontend: npm start"
echo "2. Start backend: cd backend && npm run start:prod"
echo "3. Or use PM2: pm2 start ecosystem.config.js"
echo "=========================================="
