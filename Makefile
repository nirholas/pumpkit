# PumpKit Makefile
# Run `make help` to see available targets.

.PHONY: help install build dev typecheck lint clean test docker-monitor docker-tracker

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	npm install

build: ## Build all packages
	npm run build

dev: ## Run all packages in dev mode
	npm run dev

dev-monitor: ## Run monitor bot in dev mode
	npm run dev --workspace=@pumpkit/monitor

dev-tracker: ## Run tracker bot in dev mode
	npm run dev --workspace=@pumpkit/tracker

dev-channel: ## Run channel bot in dev mode
	npm run dev --workspace=@pumpkit/channel

dev-claim: ## Run claim bot in dev mode
	npm run dev --workspace=@pumpkit/claim

typecheck: ## Type-check all packages
	npm run typecheck

lint: ## Lint all packages
	npm run lint

test: ## Run all tests
	npm test

clean: ## Clean all build outputs
	npm run clean

docker-monitor: ## Build monitor Docker image
	docker build -t pumpkit-monitor -f packages/monitor/Dockerfile .

docker-tracker: ## Build tracker Docker image
	docker build -t pumpkit-tracker -f packages/tracker/Dockerfile .

docker-channel: ## Build channel Docker image
	docker build -t pumpkit-channel -f packages/channel/Dockerfile .

docker-claim: ## Build claim Docker image
	docker build -t pumpkit-claim -f packages/claim/Dockerfile .

verify: typecheck lint test ## Run all checks (typecheck + lint + test)
