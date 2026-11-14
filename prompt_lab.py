"""Prompt experiments: run the current prompts against test_paragraphs.txt.

    python prompt_lab.py                 # analyze every paragraph in the file
    python prompt_lab.py --simplify "The committee, after months of debate, approved the bill."

Paragraphs in test_paragraphs.txt are separated by a blank line. Lines starting
with '#' are comments (use them to label the article type).
Edit prompts.py, re-run, compare. Write down what worked in docs/PROMPT_NOTES.md.
"""

import argparse
import asyncio
import json
from pathlib import Path

import llm
from main import Paragraph


def load_paragraphs(path: Path) -> list[Paragraph]:
    blocks = path.read_text(encoding="utf-8").split("\n\n")
    texts = []
    for b in blocks:
        lines = [l for l in b.splitlines() if not l.lstrip().startswith("#")]
        t = " ".join(l.strip() for l in lines).strip()
        if t:
            texts.append(t)
    return [Paragraph(id=i, text=t) for i, t in enumerate(texts)]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="test_paragraphs.txt")
    ap.add_argument("--simplify", help="simplify one sentence instead")
    args = ap.parse_args()

    print(f"model={llm.MODEL} mock={llm.MOCK}\n")
    if args.simplify:
        print(json.dumps(await llm.simplify(args.simplify), indent=2))
        return

    paras = load_paragraphs(Path(args.file))
    result = await llm.analyze(paras)
    by_id = {p.id: p.text for p in paras}
    ok = bad = 0
    for h in result.get("highlights", []):
        exact = h.get("text", "") in by_id.get(h.get("paragraph_id"), "")
        ok += exact
        bad += not exact
        mark = "OK " if exact else "BAD"  # BAD = not copied exactly, extension can't find it
        print(f"[{mark}] p{h.get('paragraph_id')} {h.get('role'):<10} {h.get('text')}")
    print(f"\n{ok} exact, {bad} not exact")


if __name__ == "__main__":
    asyncio.run(main())
