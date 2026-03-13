# NGW Core v1

Deterministic lighting-system recommendation engine for portrait photographers.
Scores, ranks, and explains lighting setups with confidence metrics, spatial
diagram specs, and top-3 alternatives.

## Quickstart

```bash
# Clone and set up
cp .env.example .env          # edit if needed
python -m venv .venv && source .venv/bin/activate
make install                   # pip install -r requirements.txt

# Run
make run                       # http://localhost:8000
make test                      # full test suite
```

Open [http://localhost:8000](http://localhost:8000) for the web UI, or
[http://localhost:8000/docs](http://localhost:8000/docs) for interactive API docs.

## Make targets

```
make help        Show all targets
make install     Install dependencies
make run         Dev server with auto-reload (default :8000)
make run-prod    Production server (2 workers, no reload)
make test        Run pytest -v
make test-fast   Run pytest -q
make format      Auto-format with ruff
make lint        Lint check (no fix)
make clean       Remove __pycache__, .pytest_cache, *.pyc
```

Override host/port: `make run HOST=127.0.0.1 PORT=9000`

## Project structure

```
ngw-core-v1/
├── main.py                  FastAPI app, /recommend endpoint, static serving
├── engine/
│   ├── rule_engine.py       Orchestrator: validate → score → select
│   ├── scoring.py           Deterministic scorer + confidence (0-100)
│   ├── selector.py          Ranking, top-3 picks, tie-breaking, reasons
│   ├── diagram.py           Spatial placement spec (angle/distance/height)
│   └── normalizer.py        Gear-name alias resolution
├── models/
│   ├── input_model.py       Request schemas
│   └── output_model.py      NGWResponse envelope
├── data/
│   ├── taxonomy.json        37 enums: gear, modifiers, moods, environments
│   ├── lighting_systems.json 30 pre-built systems
│   └── gear_aliases.json    172 brand/model → canonical ID mappings
├── static/
│   └── index.html           Single-page UI (no frameworks)
├── tests/                   pytest suite (80+ tests)
├── Makefile
├── requirements.txt
└── .env.example
```

## API

**POST /recommend**

```json
{
  "systems": [
    {
      "id": "led-a",
      "name": "ProLight LED",
      "criteria": {
        "brightness": 8000,
        "energy_efficiency": 160,
        "color_accuracy": 95,
        "lifespan_hours": 50000,
        "cost_effectiveness": 82
      },
      "features": { "dimmable": true, "smart_ready": true },
      "modifier": 1.05
    }
  ]
}
```

Response includes: winner breakdown, confidence (0-100), top-3 ranked
alternatives with per-pick reasons, and a spatial diagram spec for
each recommendation.

**GET /health** — returns `{"status": "ok"}`

## Logging

Set `LOG_LEVEL` in `.env` (default: `INFO`). Logs go to stderr in
`timestamp level request_id message` format. Every request logs its
ID, system count, winner, confidence, and processing time.

## Environment variables

See `.env.example`. All are optional with sensible defaults.

# NGW Core

NGW Core is a deterministic recommendation engine for evaluating candidate lighting systems, ranking them, generating confidence, and producing a simple lighting diagram spec.

## What it does

- validates lighting system payloads
- scores systems deterministically
- ranks candidates and selects a winner
- generates confidence and reasons
- produces a diagram spec for key/fill/rim placement
- exposes a FastAPI `/recommend` endpoint

## Project structure

- `engine/scoring.py` — score computation and confidence
- `engine/selector.py` — ranking, tie-breaking, top picks
- `engine/diagram.py` — deterministic diagram generation
- `engine/normalizer.py` — gear and modifier normalization
- `engine/rule_engine.py` — orchestration layer
- `main.py` — FastAPI app

## Run tests

```bash
pytest -q
