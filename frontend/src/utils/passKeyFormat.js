/** Strip formatting; preserve letter case (cloud pass keys are case-sensitive). */
export function stripPassKeyRaw(raw) {
  return String(raw ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8);
}

/** Display form: `XXXX` or `XXXX-XXXX` while typing. */
export function formatPassKeyDisplay(raw) {
  const norm = stripPassKeyRaw(raw);
  if (norm.length <= 4) return norm;
  return `${norm.slice(0, 4)}-${norm.slice(4)}`;
}

/** How many raw characters sit before a display cursor index. */
export function rawIndexFromDisplayCursor(displayPos, display) {
  return stripPassKeyRaw(String(display ?? "").slice(0, displayPos)).length;
}

/** Map a raw character index to cursor position in formatted display. */
export function displayCursorFromRawIndex(rawIndex, totalRawLen) {
  const i = Math.max(0, Math.min(rawIndex, totalRawLen));
  if (i <= 4) return i;
  return i + 1;
}

/**
 * After editing, restore caret in the formatted value.
 * @param {HTMLInputElement} input
 * @param {string} previousDisplay
 * @param {number} previousCursor
 * @param {string} nextDisplay
 */
export function restorePassKeyCaret(input, previousDisplay, previousCursor, nextDisplay) {
  const rawCursor = rawIndexFromDisplayCursor(previousCursor, previousDisplay);
  const nextRawLen = stripPassKeyRaw(nextDisplay).length;
  const nextPos = displayCursorFromRawIndex(Math.min(rawCursor, nextRawLen), nextRawLen);
  requestAnimationFrame(() => {
    input.setSelectionRange(nextPos, nextPos);
  });
}
