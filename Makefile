.DEFAULT_GOAL := help
BACKEND := cd backend &&
FRONTEND := cd frontend &&

.PHONY: help install train migrate seed api web dev test lint format check up down

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[32m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install backend and frontend dependencies
	$(BACKEND) uv sync
	$(FRONTEND) npm ci

train: ## Train the crop model and regenerate crop profiles
	$(BACKEND) uv run python -m app.ml.train

migrate: ## Apply database migrations
	$(BACKEND) uv run alembic upgrade head

seed: ## Create or reset the demo account (demo@agroai.example / agroai-demo-1)
	$(BACKEND) uv run python -m app.seed

api: ## Run the API with auto-reload on http://localhost:8000
	$(BACKEND) uv run uvicorn app.main:app --reload

web: ## Run the web app on http://localhost:5173
	$(FRONTEND) npm run dev

test: ## Run all tests
	$(BACKEND) uv run pytest
	$(FRONTEND) npm test

lint: ## Lint and type-check everything
	$(BACKEND) uv run ruff check . && uv run ruff format --check . && uv run mypy app
	$(FRONTEND) npm run lint && npm run typecheck

format: ## Auto-format backend code
	$(BACKEND) uv run ruff format . && uv run ruff check --fix .

check: lint test ## Everything CI runs

up: ## Build and start the full stack with Docker Compose
	docker compose up --build -d
	@echo "App: http://localhost:8080   API docs: http://localhost:8000/docs"

down: ## Stop the Docker Compose stack
	docker compose down
