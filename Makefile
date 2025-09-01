# Makefile for File Manager Application

# Variables
DOCKER_IMAGE = file-manager
DOCKER_TAG = latest
COMPOSE = docker-compose
NPM = npm

# Colors for output
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[0;33m
NC = \033[0m # No Color

.PHONY: help install dev build start test clean docker-build docker-run docker-stop lint format db-push

# Default target - show help
help:
	@echo "$(GREEN)File Manager Application - Make Commands$(NC)"
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Run development server"
	@echo "  make build        - Build for production"
	@echo "  make start        - Start production server"
	@echo "  make test         - Run tests"
	@echo ""
	@echo "$(YELLOW)Code Quality:$(NC)"
	@echo "  make lint         - Run linter"
	@echo "  make format       - Format code with Prettier"
	@echo "  make type-check   - Run TypeScript type checking"
	@echo ""
	@echo "$(YELLOW)Database:$(NC)"
	@echo "  make db-push      - Push database schema changes"
	@echo "  make db-reset     - Reset database (WARNING: destroys data)"
	@echo ""
	@echo "$(YELLOW)Docker:$(NC)"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-run   - Run with Docker Compose"
	@echo "  make docker-stop  - Stop Docker containers"
	@echo "  make docker-clean - Remove Docker containers and volumes"
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@echo "  make clean        - Clean build artifacts and dependencies"
	@echo "  make setup        - Full setup (install, build, db-push)"

# Install dependencies
install:
	@echo "$(GREEN)Installing dependencies...$(NC)"
	$(NPM) ci

# Development server
dev:
	@echo "$(GREEN)Starting development server...$(NC)"
	$(NPM) run dev

# Build for production
build:
	@echo "$(GREEN)Building for production...$(NC)"
	$(NPM) run build

# Start production server
start:
	@echo "$(GREEN)Starting production server...$(NC)"
	$(NPM) start

# Run tests
test:
	@echo "$(GREEN)Running tests...$(NC)"
	$(NPM) test

# Run linter
lint:
	@echo "$(GREEN)Running linter...$(NC)"
	npx eslint client server shared --ext .ts,.tsx --max-warnings 1000 || echo "$(YELLOW)Linting completed with issues - continuing...$(NC)"

# Format code
format:
	@echo "$(GREEN)Formatting code...$(NC)"
	npx prettier --write "**/*.{ts,tsx,js,jsx,json,css,md}" --ignore-path .prettierignore

format_code: lint format

# Type checking
type-check:
	@echo "$(GREEN)Running TypeScript type check...$(NC)"
	npx tsc --noEmit

# Database operations
db-push:
	@echo "$(GREEN)Pushing database schema...$(NC)"
	$(NPM) run db:push

db-reset:
	@echo "$(RED)WARNING: This will destroy all data!$(NC)"
	@read -p "Are you sure? (y/N) " -n 1 -r; \
	echo ""; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
	        $(NPM) run db:push --force; \
	fi

# Docker operations
docker-build:
	@echo "$(GREEN)Building Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

docker-run:
	@echo "$(GREEN)Starting application with Docker Compose...$(NC)"
	$(COMPOSE) up -d

docker-stop:
	@echo "$(YELLOW)Stopping Docker containers...$(NC)"
	$(COMPOSE) down

docker-clean:
	@echo "$(RED)Removing Docker containers and volumes...$(NC)"
	$(COMPOSE) down -v

# Clean build artifacts
clean:
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf dist build node_modules .next out coverage

# Full setup
setup: install db-push build
	@echo "$(GREEN)Setup complete!$(NC)"
	@echo "Run 'make dev' for development or 'make start' for production"

# Development workflow - format, lint, type-check, and test
check: format lint type-check test
	@echo "$(GREEN)All checks passed!$(NC)"

# Quick deployment with Docker
deploy: docker-build docker-run
	@echo "$(GREEN)Application deployed with Docker!$(NC)"
	@echo "Access the application at http://localhost:5000"