const KEYWORD_ICONS = [
  { re: /\b(start|morning|kickoff|onboard|orient|ramp)\b/i, icon: 0 },
  { re: /\b(design|creative|photo|video|camera|prototype|visual)\b/i, icon: 1 },
  { re: /\b(meet|stand-?up|sync|workshop|notes|plan|retro)\b/i, icon: 2 },
  { re: /\b(code|develop|engineering|debug|build|deploy|screen|deep work)\b/i, icon: 3 },
  { re: /\b(call|phone|dial|client)\b/i, icon: 4 },
  { re: /\b(email|slack|message|send|ship|wrap|handoff)\b/i, icon: 5 },
];

/** Pick icon 0–5 from task/description when possible; otherwise cycle by index. */
export function dilIconVariantForBlock(block, index) {
  const text = `${block?.task || ""} ${block?.description || ""}`;
  for (const { re, icon } of KEYWORD_ICONS) {
    if (re.test(text)) return icon;
  }
  return index % 6;
}
