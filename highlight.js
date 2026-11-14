// General-purpose highlighter. No Chrome APIs here, so you can test it in any page.
//
//   SCR.highlight("Some sentence on the page.", "yellow")   -> id or null
//   SCR.highlightAll([{ text, color, role }, ...])          -> [id or null, ...]
//   SCR.clearHighlights()
//
// How it works: we walk every visible text node, glue their text together with
// whitespace collapsed, find the sentence in that big string, then wrap just the
// matching pieces of each text node in <mark>. A sentence can span several nodes
// (e.g. "a <a>link</a> inside"), which is why one highlight may be several <mark>s
// sharing the same data-scr-id. Wrapping inline text never changes the page layout.

(function () {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "SVG", "CANVAS", "IFRAME"]);
  let nextId = 1;

  const normalize = (s) => s.replace(/\s+/g, " ").trim();

  // Build one searchable string + a map from each character back to (node, offset).
  function buildIndex(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
          if (SKIP_TAGS.has(el.tagName) || el.isContentEditable) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let text = "";
    const map = []; // map[i] = [node, offsetInNode]
    let lastWasSpace = true;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const data = node.data;
      for (let i = 0; i < data.length; i++) {
        const isSpace = /\s/.test(data[i]);
        if (isSpace) {
          if (lastWasSpace) continue;
          text += " ";
        } else {
          text += data[i];
        }
        map.push([node, i]);
        lastWasSpace = isSpace;
      }
    }
    return { text, map };
  }

  // Turn a [start, end) range in the index into per-node pieces.
  function piecesFor(index, start, end) {
    const pieces = [];
    for (let i = start; i < end; i++) {
      const [node, off] = index.map[i];
      const last = pieces[pieces.length - 1];
      if (last && last.node === node) last.end = off + 1;
      else pieces.push({ node, start: off, end: off + 1 });
    }
    return pieces;
  }

  function wrapPiece({ node, start, end }, id, color, role) {
    if (end < node.length) node.splitText(end);
    const target = start > 0 ? node.splitText(start) : node;
    const mark = document.createElement("mark");
    mark.className = "scr-hl";
    mark.dataset.scrId = id;
    if (role) mark.dataset.scrRole = role;
    if (color) mark.style.backgroundColor = color;
    target.parentNode.insertBefore(mark, target);
    mark.appendChild(target);
    return mark;
  }

  function highlightAll(items, root = document.body) {
    const index = buildIndex(root);
    // Find every match first, then wrap from the END of the page backwards:
    // splitting a text node keeps the earlier half as the same node, so the
    // positions we computed for earlier matches stay valid.
    const found = items.map((item, i) => {
      const needle = normalize(item.text || "");
      const start = needle ? index.text.indexOf(needle) : -1;
      return start < 0 ? null : { i, start, end: start + needle.length, item };
    });
    const ids = items.map(() => null);
    const sorted = found.filter(Boolean).sort((a, b) => b.start - a.start);
    let boundary = Infinity; // skip overlapping matches
    for (const m of sorted) {
      if (m.end > boundary) continue;
      const id = String(nextId++);
      const pieces = piecesFor(index, m.start, m.end);
      for (let p = pieces.length - 1; p >= 0; p--) {
        wrapPiece(pieces[p], id, m.item.color, m.item.role);
      }
      ids[m.i] = id;
      boundary = m.start;
    }
    return ids;
  }

  function highlight(text, color, root = document.body) {
    return highlightAll([{ text, color }], root)[0];
  }

  function clearHighlights(root = document.body) {
    const parents = new Set();
    root.querySelectorAll("mark.scr-hl").forEach((mark) => {
      parents.add(mark.parentNode);
      mark.replaceWith(...mark.childNodes);
    });
    parents.forEach((p) => p.normalize()); // merge the split text nodes back
  }

  self.SCR = { highlight, highlightAll, clearHighlights, normalize };
})();
