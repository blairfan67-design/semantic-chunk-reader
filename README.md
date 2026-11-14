# semantic-chunk-reader
Chrome extension that highlights the key points of any article, color-coded by role
(main point, evidence, background, other side). Click a highlighted sentence to bold
its backbone (who did what to what) and fade the extra details. Built at HackUMass 2026.

```
extension/  Chrome extension (Manifest V3): content script, side panel, background worker
backend/    FastAPI server that asks Gemini to pick + label key sentences
testing/    Local test article + manual test plan
docs/       API contract (read this first!), roadmap, prompt notes
```

**How it fits together:** side panel button → `background.js` asks the page's
`content.js` to extract the article (Readability.js) → `background.js` POSTs the
paragraphs to the backend `/analyze` → Gemini picks sentences → `content.js`
paints them with `highlight.js`. Clicking a highlight calls `/simplify`.

The request/response shapes are in [docs/API_CONTRACT.md](docs/API_CONTRACT.md).
The plan and who-does-what is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Run the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then paste your GEMINI_API_KEY into .env
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000/health → `{"status":"ok","mock":false}`.
No key yet? Leave it empty: the server runs in **mock mode** and returns fake (but
correctly shaped) highlights, so the extension can be built without the AI.
Interactive API docs: http://localhost:8000/docs. Tests: `pytest`.

Try prompts without the extension: `python prompt_lab.py` (uses `test_paragraphs.txt`).

## Load the extension

1. Chrome → `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → pick the `extension/` folder.
3. Pin it, open any article, click the icon → the side panel opens.
4. Click **Highlight this article**.

After editing extension code, hit the ↻ reload button on `chrome://extensions`
and refresh the article tab. The backend URL lives at the top of `extension/background.js`.

Local test page: `cd testing && python3 -m http.server 5500`, then open
http://localhost:5500/article.html.
