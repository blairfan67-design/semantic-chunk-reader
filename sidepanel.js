// Side panel UI logic. Talks only to background.js (which talks to the page and backend).

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

// ---- Backend health pill ----
async function checkBackend() {
  const pill = $("backend-status");
  const res = await send({ type: "HEALTH" });
  if (res.ok) {
    pill.textContent = res.data.mock ? "backend: mock" : "backend: ok";
    pill.className = "pill ok";
  } else {
    pill.textContent = "backend: offline";
    pill.className = "pill bad";
    pill.title = res.error;
  }
}

// ---- Analyze ----
$("analyze").addEventListener("click", async () => {
  const btn = $("analyze");
  btn.disabled = true;
  setStatus("Reading the article…");
  const res = await send({ type: "ANALYZE_ACTIVE_TAB" });
  btn.disabled = false;
  if (!res.ok) return setStatus(res.error, true);
  const { found, total, paragraphs } = res.data;
  setStatus(`Highlighted ${found} of ${total} key sentences (${paragraphs} paragraphs read).`);
  $("visible").checked = true;
});

$("visible").addEventListener("change", (e) =>
  send({ type: "SET_VISIBLE", visible: e.target.checked })
);

// ---- Color legend / picker ----
async function renderLegend() {
  const colors = await scrLoadColors();
  const ul = $("legend");
  ul.innerHTML = "";
  for (const role of SCR_ROLES) {
    const li = document.createElement("li");
    const input = document.createElement("input");
    input.type = "color";
    input.value = colors[role.key];
    input.setAttribute("aria-label", `${role.label} color`);
    input.addEventListener("change", async () => {
      const current = await scrLoadColors();
      await chrome.storage.sync.set({ colors: { ...current, [role.key]: input.value } });
    });
    const span = document.createElement("span");
    span.textContent = role.label;
    li.append(input, span);
    ul.append(li);
  }
}

$("reset-colors").addEventListener("click", async () => {
  await chrome.storage.sync.remove("colors");
  renderLegend();
});

// ---- Debug ----
$("ping").addEventListener("click", async () => {
  const res = await send({ type: "PING_TAB" });
  setStatus(res.ok ? `Page answered: ${res.data.url}` : res.error, !res.ok);
});
$("clear").addEventListener("click", () => send({ type: "CLEAR" }));

renderLegend();
checkBackend();
