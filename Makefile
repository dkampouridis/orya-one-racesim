PYTHON ?= python3
PIP ?= $(PYTHON) -m pip

.PHONY: setup install-api install-web train-model dev-api dev-web test lint-web build-web check historical-normalize historical-backtest historical-report

setup: install-api install-web

install-api:
	$(PIP) install -r apps/api/requirements.txt
	$(PIP) install -e packages/sim-core

install-web:
	npm install

train-model:
	$(PYTHON) -m racesim.model.train

dev-api:
	cd apps/api && uvicorn app.main:app --reload --port 8000

dev-web:
	npm run dev:web

test:
	pytest

lint-web:
	cd apps/web && npm run lint

build-web:
	cd apps/web && npm run build

check: test lint-web build-web

historical-normalize:
	$(PYTHON) -m racesim.historical.cli normalize --season 2024

historical-backtest:
	$(PYTHON) -m racesim.historical.cli backtest --season 2024 --runs 250

historical-report:
	$(PYTHON) -m racesim.historical.cli report --season 2024 --runs 250
