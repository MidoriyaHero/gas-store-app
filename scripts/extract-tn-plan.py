"""Extract and clean TN-plan HTML from Claude saved artifact."""

import re
from pathlib import Path

SRC = Path(
    r"C:\Users\buitr\Downloads\lich_tap_fullbody.html - Claude_files\saved_resource(1).html"
)
OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "tn-plan" / "index.html"

ENHANCED_SCRIPT = r"""<script>
  const STORAGE_KEY = 'tn-plan-v1';
  let activeDay = null;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function assignItemIndices() {
    document.querySelectorAll('.day-panel').forEach(panel => {
      panel.querySelectorAll('.item').forEach((item, idx) => {
        item.dataset.itemIdx = String(idx);
      });
    });
  }

  function getPanelDay(panel) {
    return panel ? panel.dataset.day : null;
  }

  function captureDayState(day) {
    const panel = document.getElementById('day-' + day);
    if (!panel) return { items: [], sets: {} };
    const items = [];
    panel.querySelectorAll('.item').forEach(item => {
      if (item.classList.contains('done')) {
        items.push(parseInt(item.dataset.itemIdx, 10));
      }
    });
    const sets = {};
    panel.querySelectorAll('.item[data-multiset]').forEach(item => {
      const idx = item.dataset.itemIdx;
      item.querySelectorAll('.set-box').forEach((box, i) => {
        if (box.classList.contains('on')) {
          sets[idx + ':' + (i + 1)] = true;
        }
      });
    });
    return { items, sets };
  }

  function persistState() {
    const state = loadState();
    state.activeDay = activeDay;
    state.days = state.days || {};
    if (activeDay) {
      state.days[activeDay] = captureDayState(activeDay);
    }
    saveState(state);
  }

  function applyDayState(day, dayState) {
    const panel = document.getElementById('day-' + day);
    if (!panel || !dayState) return;
    panel.querySelectorAll('.item').forEach(item => item.classList.remove('done'));
    panel.querySelectorAll('.set-box').forEach(s => s.classList.remove('on'));
    (dayState.items || []).forEach(idx => {
      const item = panel.querySelector('.item[data-item-idx="' + idx + '"]');
      if (item) item.classList.add('done');
    });
    Object.keys(dayState.sets || {}).forEach(key => {
      const parts = key.split(':');
      const idx = parts[0];
      const setNum = parts[1];
      const item = panel.querySelector('.item[data-item-idx="' + idx + '"]');
      if (!item) return;
      const boxes = item.querySelectorAll('.set-box');
      const box = boxes[parseInt(setNum, 10) - 1];
      if (box) box.classList.add('on');
    });
    panel.querySelectorAll('.item[data-multiset]').forEach(item => {
      const total = parseInt(item.dataset.multiset, 10);
      const done = item.querySelectorAll('.set-box.on').length;
      if (done >= total) item.classList.add('done');
    });
  }

  function restoreState() {
    const state = loadState();
    Object.keys(state.days || {}).forEach(day => applyDayState(day, state.days[day]));
    return state.activeDay;
  }

  function showDay(day) {
    if (activeDay && activeDay !== day) persistState();
    document.querySelectorAll('.day-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.day-pill').forEach(p => p.classList.remove('active'));
    document.getElementById('day-' + day).classList.add('active');
    const pills = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
    document.querySelectorAll('.day-pill')[pills[day]].classList.add('active');
    activeDay = day;
    updateProgress();
    persistState();
  }

  function toggleItem(el) {
    el.classList.toggle('done');
    updateProgress();
    persistState();
  }

  function toggleGuide(e, el) {
    e.stopPropagation();
    const guide = el.nextElementSibling;
    guide.classList.toggle('hidden');
    el.textContent = guide.classList.contains('hidden') ? 'Xem hướng dẫn ▾' : 'Ẩn hướng dẫn ▴';
  }

  function toggleSet(e, el) {
    e.stopPropagation();
    el.classList.toggle('on');
    const item = el.closest('.item');
    const total = parseInt(item.dataset.multiset, 10);
    const done = item.querySelectorAll('.set-box.on').length;
    if (done >= total) item.classList.add('done');
    else item.classList.remove('done');
    updateProgress();
    persistState();
  }

  function updateProgress() {
    const panel = document.querySelector('.day-panel.active');
    if (!panel) return;
    const items = panel.querySelectorAll('.item');
    const total = items.length;
    const done = panel.querySelectorAll('.item.done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('progress-text').textContent = pct + '%';
  }

  function resetDay() {
    const panel = document.querySelector('.day-panel.active');
    if (!panel) return;
    const day = getPanelDay(panel);
    panel.querySelectorAll('.item').forEach(i => i.classList.remove('done'));
    panel.querySelectorAll('.set-box').forEach(s => s.classList.remove('on'));
    const state = loadState();
    if (state.days && day) delete state.days[day];
    saveState(state);
    updateProgress();
    persistState();
  }

  function updateOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const offline = !navigator.onLine;
    banner.classList.toggle('visible', offline);
    document.body.classList.toggle('offline-pad', offline);
  }

  assignItemIndices();
  const savedDay = restoreState();
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const today = days[new Date().getDay()];
  const initial = savedDay || today;
  if (document.getElementById('day-' + initial)) showDay(initial);
  else updateProgress();

  updateOfflineBanner();
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/tn-plan/sw.js', { scope: '/tn-plan/' });
  }
</script>"""

OFFLINE_CSS = """
  .offline-banner {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 9999;
    background: #3d3500;
    color: #c8f135;
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 12px;
    border-bottom: 1px solid #5a5200;
  }
  .offline-banner.visible { display: block; }
  body.offline-pad { padding-top: 36px; }
"""


def main() -> None:
    """Extract artifact HTML, strip Claude junk, inject offline support."""
    text = SRC.read_text(encoding="utf-8")
    match = re.search(r"(<meta name=\"viewport\".*</html>)", text, re.DOTALL | re.IGNORECASE)
    if not match:
        raise SystemExit("viewport block not found")

    full = (
        '<!DOCTYPE html>\n<html lang="vi">\n<head>\n<meta charset="UTF-8">\n'
        + match.group(1)
    )
    full = re.sub(
        r"</style>\s*</head>\s*<body[^>]*>",
        "</style>\n</head>\n<body>",
        full,
        count=1,
    )
    full = full.replace("&#39;", "'")
    full = full.replace("</style>", OFFLINE_CSS + "</style>", 1)
    full = full.replace(
        "<body>",
        '<body>\n<div id="offline-banner" class="offline-banner" role="status">'
        "Đang dùng bản offline</div>",
        1,
    )

    old_script = re.search(r"<script>\s*function showDay.*?</script>", full, re.DOTALL)
    if not old_script:
        raise SystemExit("script block not found")
    full = full[: old_script.start()] + ENHANCED_SCRIPT + full[old_script.end() :]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(full, encoding="utf-8")
    print(f"Wrote {OUT} ({len(full)} chars)")


if __name__ == "__main__":
    main()
