# NeuroGuide FastAPI Backend

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and adjust values if needed.
4. Add `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey) so job-description simplification works.

## Run locally

From the `backend` folder (so imports and `.env` resolve correctly):

```bash
uvicorn app.main:app --reload
```

The app also loads `backend/.env` when uvicorn is started from the repository root, as long as that file exists.

- API root: `http://127.0.0.1:8000/`
- Health check: `http://127.0.0.1:8000/api/v1/health`
- Docs: `http://127.0.0.1:8000/docs`

## Run tests

```bash
pytest
```
