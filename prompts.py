"""Prompt templates. This is the file to iterate on during prompt experiments.

Use prompt_lab.py to try a prompt against test_paragraphs.txt before changing it here.
"""

ANALYZE_PROMPT = """You help readers skim long articles.

Below are numbered paragraphs from one article. Pick the sentences a reader most
needs to understand the article, and label each with ONE role:
- "main": the main point or claim of the article or paragraph
- "evidence": data, examples, studies or quotes that support a claim
- "background": context the reader needs to follow the argument
- "counter": the other side, a caveat, limitation or objection

Rules:
- Copy each sentence EXACTLY, character for character, from its paragraph. Do not
  paraphrase, shorten, or fix typos. If you cannot copy it exactly, skip it.
- Pick at most 2 sentences per paragraph, and skip paragraphs with nothing important.
- Use "main" sparingly: usually 1-3 times for the whole article.

Return JSON only, in this shape:
{{"highlights": [{{"paragraph_id": 0, "text": "...", "role": "main"}}]}}

Paragraphs:
{paragraphs}
"""

SIMPLIFY_PROMPT = """Find the grammatical backbone of this sentence: the main subject,
its main verb, and the object (who did what to what). Ignore side clauses,
parentheticals and extra details.

Return the backbone as short pieces copied EXACTLY from the sentence, in order.
Return JSON only, in this shape: {{"core": ["subject", "verb", "object"]}}

Sentence: {sentence}
"""


def format_paragraphs(paragraphs) -> str:
    return "\n\n".join(f"[{p.id}] {p.text}" for p in paragraphs)
