export const MAX_BULLETS_PER_SECTION = 5;

/** Treat backend placeholder as empty for export. */
export function stripPlaceholder(body) {
  const s = String(body ?? "").trim();
  if (s === "-" || s === "-") return "";
  return s;
}

/**
 * Split body into prose lines and bullet lines (max `maxBullets` bullets).
 * Mirrors flip-card rules: lines starting with - * • become bullets.
 */
export function parseSectionForExport(raw, maxBullets = MAX_BULLETS_PER_SECTION) {
  const src = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return { proseLines: [], bullets: [] };
  const lines = src.split("\n");
  const proseLines = [];
  const bullets = [];
  for (const rawLine of lines) {
    const trimmed = String(rawLine ?? "").trim();
    if (!trimmed) continue;
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (bullets.length < maxBullets) bullets.push(bulletMatch[1].trim());
      continue;
    }
    proseLines.push(trimmed);
  }
  return { proseLines, bullets };
}

export function parseJobTitleAndCompany(basicInfo) {
  const text = stripPlaceholder(basicInfo);
  let jobTitle = "";
  let companyName = "";
  if (!text) return { jobTitle, companyName, remainder: "" };

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const consumed = new Set();
  for (const line of lines) {
    let m = line.match(/^(?:job\s*title|title|role|position)\s*:\s*(.+)$/i);
    if (m && !jobTitle) {
      jobTitle = m[1].trim();
      consumed.add(line);
      continue;
    }
    m = line.match(/^(?:company|employer|organisation|organization)\s*:\s*(.+)$/i);
    if (m && !companyName) {
      companyName = m[1].trim();
      consumed.add(line);
    }
  }
  const remainderLines = lines.filter((l) => !consumed.has(l));
  return { jobTitle, companyName, remainder: remainderLines.join("\n").trim() };
}

export function splitSkillsAndNiceToHaves(skillsText) {
  const t = stripPlaceholder(skillsText);
  if (!t) return { skills: "", nice: "" };

  const splitAtHeading = t.split(/\n(?=\s*(?:preferred|nice\s+to\s+haves?|optional|bonus)\b\s*[:\s])/i);
  if (splitAtHeading.length >= 2) {
    return { skills: splitAtHeading[0].trim(), nice: splitAtHeading.slice(1).join("\n\n").trim() };
  }

  const idx = t.search(/\n\s*(?:Preferred|Nice to have)/i);
  if (idx > 0) {
    return { skills: t.slice(0, idx).trim(), nice: t.slice(idx).trim() };
  }

  const blocks = t.split(/\n{3,}/);
  if (blocks.length >= 2) {
    return { skills: blocks[0].trim(), nice: blocks.slice(1).join("\n\n").trim() };
  }
  return { skills: t, nice: "" };
}

/** Lines from basic_info that look like pay/benefits/arrangement (for "What the role offers"). */
export function extractRoleOffersSnippet(basicInfo) {
  const t = stripPlaceholder(basicInfo);
  if (!t) return "";
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const re =
    /pay|salary|wage|benefit|superannuation|leave|holiday|pto|remote|hybrid|on-?site|hours|full-?time|part-?time|contract|casual|permanent|equity|stock|bonus/i;
  const matched = lines.filter((l) => re.test(l));
  return matched.slice(0, 8).join("\n").trim();
}

export function sanitizeFilenameSegment(name) {
  return String(name ?? "")
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function buildExportPdfFilename(jobTitle, companyName) {
  const t = sanitizeFilenameSegment(jobTitle).replace(/\s+/g, "_");
  const c = sanitizeFilenameSegment(companyName).replace(/\s+/g, "_");
  if (t && c) return `${t}_${c}_Simplified.pdf`;
  if (t) return `${t}_Simplified.pdf`;
  if (c) return `${c}_Simplified.pdf`;
  return "Simplified_Job_Description.pdf";
}

export function buildExportTxtFilename(jobTitle, companyName) {
  const base = buildExportPdfFilename(jobTitle, companyName);
  return base.replace(/\.pdf$/i, ".txt");
}

function appendSectionLines(out, heading, raw) {
  const body = stripPlaceholder(raw);
  if (!body) return;
  const { proseLines, bullets } = parseSectionForExport(body);
  if (proseLines.length === 0 && bullets.length === 0) return;
  out.push(heading);
  out.push("");
  for (const p of proseLines) out.push(p);
  if (proseLines.length && bullets.length) out.push("");
  for (const b of bullets) out.push(`• ${b}`);
  out.push("");
}

/**
 * Plain UTF-8 text for download (no server, no account).
 */
export function buildPlainTextExport(result, warnings) {
  const lines = [];
  const { jobTitle, companyName, remainder } = parseJobTitleAndCompany(result?.basic_info ?? "");
  const { skills, nice } = splitSkillsAndNiceToHaves(result?.skills_qualifications ?? "");
  const offers = extractRoleOffersSnippet(result?.basic_info ?? "");

  lines.push("NeuroGuide - Simplified job description");
  lines.push("=".repeat(40));
  lines.push("");

  if (warnings?.length) {
    lines.push("Heads up");
    lines.push("-".repeat(20));
    for (const w of warnings) lines.push(`• ${w}`);
    lines.push("");
  }

  appendSectionLines(lines, "Quick snapshot", result?.summary ?? "");
  if (jobTitle) {
    lines.push("Job title");
    lines.push("");
    lines.push(jobTitle);
    lines.push("");
  }
  if (companyName) {
    lines.push("Company name");
    lines.push("");
    lines.push(companyName);
    lines.push("");
  }
  const basicBlock = remainder || stripPlaceholder(result?.basic_info ?? "");
  appendSectionLines(lines, "Basic information", basicBlock);
  appendSectionLines(lines, "What you'll do", result?.responsibilities ?? "");
  appendSectionLines(lines, "Skills you need", skills);
  appendSectionLines(lines, "Nice to haves", nice);
  if (offers) appendSectionLines(lines, "What the role offers", offers);

  return lines.join("\n").trim() + "\n";
}

function ensureSpace(doc, yRef, margin, lineHeight, needed) {
  const pageH = doc.internal.pageSize.getHeight();
  if (yRef.y + needed > pageH - margin) {
    doc.addPage();
    yRef.y = margin;
  }
}

function addWrappedText(doc, text, margin, maxW, yRef, lineHeight) {
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    ensureSpace(doc, yRef, margin, lineHeight, lineHeight);
    doc.text(line, margin, yRef.y);
    yRef.y += lineHeight;
  }
}

function addSectionToPdf(doc, heading, raw, margin, maxW, yRef, lineHeight, headingGap) {
  const body = stripPlaceholder(raw);
  if (!body) return;
  const { proseLines, bullets } = parseSectionForExport(body);
  if (proseLines.length === 0 && bullets.length === 0) return;

  ensureSpace(doc, yRef, margin, lineHeight, headingGap + lineHeight * 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  addWrappedText(doc, heading, margin, maxW, yRef, lineHeight);
  yRef.y += 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const p of proseLines) {
    addWrappedText(doc, p, margin, maxW, yRef, lineHeight);
  }
  if (proseLines.length && bullets.length) yRef.y += 2;
  for (const b of bullets) {
    const bulletLine = `• ${b}`;
    addWrappedText(doc, bulletLine, margin + 3, maxW - 3, yRef, lineHeight);
  }
  yRef.y += headingGap;
}

/**
 * Builds a PDF Blob from the current simplified result (client-side).
 * Loads jsPDF on demand to keep the main bundle smaller.
 */
export async function buildSimplifiedJobPdfBlob(result, warnings) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - 2 * margin;
  const yRef = { y: margin };
  const lineHeight = 5;
  const headingGap = 4;

  const { jobTitle, companyName, remainder } = parseJobTitleAndCompany(result?.basic_info ?? "");
  const { skills, nice } = splitSkillsAndNiceToHaves(result?.skills_qualifications ?? "");
  const offers = extractRoleOffersSnippet(result?.basic_info ?? "");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  const docTitle =
    jobTitle && companyName
      ? `${jobTitle} - ${companyName}`
      : jobTitle || companyName || "Simplified job description";
  addWrappedText(doc, docTitle, margin, maxW, yRef, 7);
  yRef.y += 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 90, 85);
  addWrappedText(doc, "NeuroGuide · reading aid, not hiring or legal advice.", margin, maxW, yRef, lineHeight);
  doc.setTextColor(0, 0, 0);
  yRef.y += headingGap;

  if (warnings?.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    addWrappedText(doc, "Heads up", margin, maxW, yRef, lineHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const w of warnings) {
      addWrappedText(doc, `• ${w}`, margin + 3, maxW - 3, yRef, lineHeight);
    }
    yRef.y += headingGap;
  }

  addSectionToPdf(doc, "Quick snapshot", result?.summary ?? "", margin, maxW, yRef, lineHeight, headingGap);

  if (jobTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    addWrappedText(doc, "Job title", margin, maxW, yRef, lineHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    addWrappedText(doc, jobTitle, margin, maxW, yRef, lineHeight);
    yRef.y += headingGap;
  }
  if (companyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    addWrappedText(doc, "Company name", margin, maxW, yRef, lineHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    addWrappedText(doc, companyName, margin, maxW, yRef, lineHeight);
    yRef.y += headingGap;
  }

  const basicBlock = remainder || stripPlaceholder(result?.basic_info ?? "");
  addSectionToPdf(doc, "Basic information", basicBlock, margin, maxW, yRef, lineHeight, headingGap);
  addSectionToPdf(doc, "What you'll do", result?.responsibilities ?? "", margin, maxW, yRef, lineHeight, headingGap);
  addSectionToPdf(doc, "Skills you need", skills, margin, maxW, yRef, lineHeight, headingGap);
  addSectionToPdf(doc, "Nice to haves", nice, margin, maxW, yRef, lineHeight, headingGap);
  if (offers) addSectionToPdf(doc, "What the role offers", offers, margin, maxW, yRef, lineHeight, headingGap);

  return doc.output("blob");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}
