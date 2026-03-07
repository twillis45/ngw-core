.PHONY: run test format lint clean install help

HOST   ?= 0.0.0.0
PORT   ?= 8000
PYARGS ?=

help: ## Show this help
	@grep -E '^[a-z][a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies into active env
	pip install -r requirements.txt

run: ## Start dev server (auto-reload)
	uvicorn main:app --host $(HOST) --port $(PORT) --reload

run-prod: ## Start production server (no reload)
	uvicorn main:app --host $(HOST) --port $(PORT) --workers 2

test: ## Run full test suite
	python -m pytest tests/ -v --tb=short $(PYARGS)

test-fast: ## Run tests without verbose output
	python -m pytest tests/ -q $(PYARGS)

format: ## Format code with ruff
	python -m ruff format .
	python -m ruff check --fix .

lint: ## Lint without fixing
	python -m ruff check .

clean: ## Remove caches and build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null; true
	find . -name '*.pyc' -delete 2>/dev/null; true
