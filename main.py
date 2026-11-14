"""The "kitchen": receives articles from the extension, asks the LLM, returns highlights.

Run locally:  uvicorn main:app --reload --port 8000
API shape:    see docs/API_CONTRACT.md
"""

from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import llm

app = FastAPI(title="Semantic Chunk Reader API")

# CORS: lets the extension (and a local test page) call this server.
# For the hackathon we allow everything; lock it down to your extension ID later:
#   allow_origins=["chrome-extension://<your-extension-id>"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Role = Literal["main", "evidence", "background", "counter"]


class Paragraph(BaseModel):
    id: int
    text: str


class AnalyzeRequest(BaseModel):
    paragraphs: list[Paragraph] = Field(..., max_length=200)


class Highlight(BaseModel):
    paragraph_id: int
    text: str
    role: Role


class AnalyzeResponse(BaseModel):
    highlights: list[Highlight]


class SimplifyRequest(BaseModel):
    sentence: str = Field(..., max_length=2000)


class SimplifyResponse(BaseModel):
    core: list[str]


@app.get("/health")
def health():
    return {"status": "ok", "mock": llm.MOCK}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    try:
        raw = await llm.analyze(req.paragraphs)
    except Exception as e:  # LLM down, bad JSON, quota, ...
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    # Keep only highlights the extension can actually find on the page:
    # valid role, known paragraph, and text copied word-for-word.
    by_id = {p.id: p.text for p in req.paragraphs}
    clean = []
    for h in raw.get("highlights", []):
        try:
            h = Highlight(**h)
        except Exception:
            continue
        para = by_id.get(h.paragraph_id)
        if para is not None and h.text.strip() and h.text.strip() in para:
            clean.append(Highlight(paragraph_id=h.paragraph_id, text=h.text.strip(), role=h.role))
    return AnalyzeResponse(highlights=clean)


@app.post("/simplify", response_model=SimplifyResponse)
async def simplify(req: SimplifyRequest):
    try:
        raw = await llm.simplify(req.sentence)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    core = [c for c in raw.get("core", []) if isinstance(c, str) and c and c in req.sentence]
    return SimplifyResponse(core=core)
