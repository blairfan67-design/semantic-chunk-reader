// Content script: lives inside the web page. Reads the article, paints highlights,
// and handles clicks on highlights. Talks to background.js via chrome.runtime messages.

(function () {
  if (self.__scrLoaded) return; // guard against double injection
  self.__scrLoaded = true;

  const MIN_PARAGRAPH_CHARS = 40;
  const MAX_PARAGRAPHS = 80;

  // ---------- 1. Extract the article with Readability ----------
  function extractArticle() {
    const article = new Readability(document.cloneNode(true)).parse();
    if (!article) return { title: document.title, paragraphs: [] };

    const doc = new DOMParser().parseFromString(article.content, "text/html");
    const paragraphs = [];
    doc.querySelectorAll("p, li, blockquote").forEach((el) => {
      if (el.querySelector("p, li")) return; // container, its children are counted instead
      const text = SCR.normalize(el.textContent || "");
      if (text.length >= MIN_PARAGRAPH_CHARS && paragraphs.length < MAX_PARAGRAPHS) {
        paragraphs.push({ id: paragraphs.length, text });
      }
    });
    return { title: article.title, paragraphs };
  }

  // ---------- 2. Colors (saved per user, same on every page) ----------
  function applyColors(colors) {
    for (const [role, color] of Object.entries(colors)) {
      document.documentElement.style.setProperty(`--scr-color-${role}`, color);
    }
  }
  scrLoadColors().then(applyColors);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.colors) scrLoadColors().then(applyColors);
  });

  // ---------- 3. Paint highlights from the backend ----------
  function applyHighlights(highlights) {
    clearAll();
    const ids = SCR.highlightAll(highlights.map((h) => ({ text: h.text, role: h.role })));
    const found = ids.filter(Boolean).length;
    return { found, total: highlights.length };
  }

  function clearAll() {
    document.querySelectorAll("mark.scr-hl[data-scr-original]").forEach(unsimplify);
    SCR.clearHighlights();
  }

  // ---------- 4. Click a highlight -> bold the backbone, fade the rest ----------
  function marksFor(id) {
    return [...document.querySelectorAll(`mark.scr-hl[data-scr-id="${id}"]`)];
  }

  function unsimplify(mark) {
    mark.textContent = mark.dataset.scrOriginal;
    delete mark.dataset.scrOriginal;
  }

  function renderCore(marks, core) {
    // One sentence may be split over several <mark>s; work on the joined text.
    const full = marks.map((m) => m.textContent).join("");
    const isCore = new Array(full.length).fill(false);
    let from = 0;
    for (const piece of core) {
      const at = full.indexOf(piece, from);
      if (at < 0) continue;
      isCore.fill(true, at, at + piece.length);
      from = at + piece.length;
    }
    let pos = 0;
    for (const mark of marks) {
      const text = mark.textContent;
      mark.dataset.scrOriginal = text;
      mark.textContent = "";
      let i = 0;
      while (i < text.length) {
        const flag = isCore[pos + i];
        let j = i;
        while (j < text.length && isCore[pos + j] === flag) j++;
        const span = document.createElement("span");
        span.className = flag ? "scr-core" : "scr-faded";
        span.textContent = text.slice(i, j);
        mark.appendChild(span);
        i = j;
      }
      pos += text.length;
    }
  }

  document.addEventListener("click", async (e) => {
    if (document.documentElement.classList.contains("scr-hidden")) return;
    const mark = e.target.closest && e.target.closest("mark.scr-hl");
    if (!mark) return;
    const marks = marksFor(mark.dataset.scrId);

    if (mark.dataset.scrOriginal !== undefined) { // already simplified -> toggle back
      marks.forEach(unsimplify);
      return;
    }
    const sentence = marks.map((m) => m.textContent).join("");
    marks.forEach((m) => m.classList.add("scr-loading"));
    try {
      const res = await chrome.runtime.sendMessage({ type: "SIMPLIFY", sentence });
      if (res && res.ok) renderCore(marks, res.data.core);
      else console.warn("[SCR] simplify failed", res && res.error);
    } finally {
      marks.forEach((m) => m.classList.remove("scr-loading"));
    }
  });

  // ---------- 5. Messages from background / side panel ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case "PING":
        console.log("[SCR] ping from", msg.from);
        sendResponse({ ok: true, url: location.href });
        break;
      case "EXTRACT": {
        const article = extractArticle();
        console.log("[SCR] extracted", article.paragraphs.length, "paragraphs", article);
        sendResponse({ ok: true, data: article });
        break;
      }
      case "APPLY_HIGHLIGHTS":
        sendResponse({ ok: true, data: applyHighlights(msg.highlights) });
        break;
      case "SET_VISIBLE":
        document.documentElement.classList.toggle("scr-hidden", !msg.visible);
        sendResponse({ ok: true });
        break;
      case "CLEAR":
        clearAll();
        sendResponse({ ok: true });
        break;
    }
    // all responses above are synchronous
  });
})();
