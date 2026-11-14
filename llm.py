"""Talks to Gemini (the "chef"). Falls back to fake results in mock mode."""

import json
import os
import re

from dotenv import load_dotenv

import prompts

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MOCK = os.getenv("MOCK_LLM", "").strip() == "1" or not API_KEY

ROLES = ("main", "evidence", "background", "counter")

_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=API_KEY)
    return _client


async def ask_json(prompt: str) -> dict:
    """Send one prompt to Gemini and parse its JSON reply."""
    from google.genai import types

    resp = await _get_client().aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )
    return json.loads(resp.text)


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]


def mock_analyze(paragraphs) -> dict:
    """Fake but well-formed result: first sentence of each paragraph, cycling roles."""
    highlights = []
    for i, p in enumerate(paragraphs):
        sents = _sentences(p.text)
        if sents:
            highlights.append(
                {"paragraph_id": p.id, "text": sents[0], "role": ROLES[i % len(ROLES)]}
            )
    return {"highlights": highlights}


def mock_simplify(sentence: str) -> dict:
    words = sentence.split()
    return {"core": words[:2] + words[-2:] if len(words) > 4 else words}


async def analyze(paragraphs) -> dict:
    if MOCK:
        return mock_analyze(paragraphs)
    prompt = prompts.ANALYZE_PROMPT.format(
        paragraphs=prompts.format_paragraphs(paragraphs)
    )
    return await ask_json(prompt)


async def simplify(sentence: str) -> dict:
    if MOCK:
        return mock_simplify(sentence)
    return await ask_json(prompts.SIMPLIFY_PROMPT.format(sentence=sentence))
