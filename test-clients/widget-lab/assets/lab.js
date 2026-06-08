// Shared helpers for the widget lab pages.

function $(id) { return document.getElementById(id); }

// Wire the document-level iot-command listener (events bubble + are composed,
// so they reach document from any widget's shadow root) and return a logger.
function startLog(pre) {
  let cleared = false;
  function line(text, cls) {
    if (!cleared) { pre.textContent = ''; cleared = true; }
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    pre.prepend(d);
  }
  document.addEventListener('iot-command', (e) => {
    const det = e.detail || {};
    const t = new Date().toLocaleTimeString();
    line(`${t}  →  ${JSON.stringify(det.value)}   (variable: ${det.variable || '—'})`, 'out');
  });
  return line;
}

// Parse a push-value string: JSON for {…}/[…], a Number for numeric strings,
// otherwise the raw string (covers hex like "#FF0", numbers, and colour objects).
function parsePush(raw) {
  raw = (raw || '').trim();
  if (!raw) return undefined;
  if (raw[0] === '{' || raw[0] === '[') {
    try { return JSON.parse(raw); } catch { return undefined; }
  }
  if (/^-?\d*\.?\d+$/.test(raw)) return Number(raw);
  return raw;
}
