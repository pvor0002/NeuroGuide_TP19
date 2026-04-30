"""
Normalize job posting titles and expand common variants to ANZSCO-style names
for occupation lookup. The careers DB uses official occupation labels (often
plural or unit-group names), while job ads use strings like "Software Engineer
at Microsoft Azure Core".
"""

from __future__ import annotations

import re
from typing import List, Sequence, Set, Tuple

# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------
_AT_COMPANY_SPLIT = re.compile(
    r"\s+at\s+",
    flags=re.IGNORECASE,
)
_SPLIT_TOKENS = re.compile(r"[^\w\+#]+", flags=re.UNICODE)
# Common noise in generated job_title fields
_JUNK_PREFIX = re.compile(
    r"^\s*(job\s*title\s*[:.\-]?\s*|title\s*[:.\-]?\s*|role\s*[:.\-]?\s*)",
    flags=re.IGNORECASE,
)


def sanitize_ilike_piece(s: str) -> str:
    """Strip ILIKE wildcard chars from user-derived text so patterns stay safe."""
    if not s:
        return ""
    t = re.sub(r"[%_\\]", " ", str(s))
    return re.sub(r"\s+", " ", t).strip()


STOPWORDS: Set[str] = frozenset(
    {
        "a",
        "an",
        "the",
        "and",
        "or",
        "at",
        "in",
        "on",
        "to",
        "of",
        "for",
        "with",
        "from",
        "by",
        "as",
        "is",
        "are",
        "be",
        "our",
        "your",
        "we",
        "you",
        "all",
        "any",
        "new",
        "senior",
        "junior",
        "staff",
        "level",
        "ii",
        "iii",
        "iv",
        "remote",
        "hybrid",
        "full",
        "time",
        "part",
        "fte",
        "contract",
        "permanent",
        "team",
        "group",
        "office",
        "based",
        "global",
        "lead",
        "principal",
        "staff",
        "member",
        "technical",
        "technology",
        "technologies",
        "core",
        "platform",
        "services",
        "cloud",
        "azure",
        "aws",
        "gcp",
        "microsoft",
        "google",
        "amazon",
        "meta",
        "apple",
    }
)


# Phrases strongly associated with ICT unit groups in AU occupation data —
# Used when the raw title wording does not appear verbatim in occupation_name.
ALIAS_NEEDLES: Sequence[Tuple[Tuple[str, ...], Sequence[str]]] = (
    (
        ("software engineer", "software engineers"),
        (
            "Software",
            "Programmer",
            "Developer Programmer",
            "Applications Programmer",
        ),
    ),
    (
        ("software developer",),
        ("Software", "Programmer", "Developer Programmer", "Applications Programmer"),
    ),
    (
        ("full stack", "fullstack", "full-stack"),
        ("Developer Programmer", "Software", "Web Developer", "Programmer"),
    ),
    (
        ("backend engineer", "back end engineer", "backend developer"),
        ("Developer Programmer", "Software", "Applications Programmer"),
    ),
    (
        ("frontend engineer", "front end engineer", "front-end", "frontend developer"),
        ("Developer Programmer", "Software", "Web Developer", "Applications Programmer"),
    ),
    (
        ("devops", "site reliability", "sre ", " reliability engineer"),
        ("Software", "Systems", "Networks", "Database", "ICT Security", "Administrators"),
    ),
    (
        ("data scientist",),
        ("Mathematicians", "Statisticians", "Scientists", "Data", "Systems Architect"),
    ),
    (
        ("machine learning", " ml ", "deep learning"),
        ("Scientists", "Programmer", "Software", "Architect"),
    ),
    (
        ("data engineer", "analytics engineer"),
        ("Database", "Systems", "Analyst Programmer", "Developer"),
    ),
    (
        ("product manager",),
        ("Project", "Administrators", "Managers", "Product"),
    ),
    (
        ("business analyst", "systems analyst"),
        ("Systems Analyst", "Analyst Programmer", "ICT Business"),
    ),
    (
        ("qa engineer", "quality assurance", "test engineer", "sdet"),
        ("Software Tester", "Programmer", "Developer", "Systems"),
    ),
)


def normalize_job_title(raw: str) -> str:
    if not raw or not isinstance(raw, str):
        return ""
    t = raw.strip()
    if not t:
        return ""
    t = _JUNK_PREFIX.sub("", t)
    t = t.strip()
    # "Role at Company ..."
    parts = _AT_COMPANY_SPLIT.split(t, maxsplit=1)
    t = parts[0].strip() if parts else t
    # Trailing clauses: "Software Engineer — Azure"
    t = re.split(r"\s+[—\-|]+\s*", t, maxsplit=1)[0].strip()
    # Parenthetical location or team
    t = re.sub(r"\([^)]*\)", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _tokens(title: str) -> List[str]:
    return [x for x in _SPLIT_TOKENS.split(title.lower()) if x]


def keywords_from_title(normalized_title: str) -> List[str]:
    """Produce search tokens suitable for ILIKE; drop stopwords / very short junk."""
    toks = _tokens(normalized_title)
    out: List[str] = []
    for t in toks:
        if len(t) < 2:
            continue
        if t in STOPWORDS:
            continue
        out.append(t)
    # Prefer longer discriminators first when scoring later
    out.sort(key=len, reverse=True)
    return out[:12]


def alias_expansion_patterns(normalized_title: str) -> List[str]:
    """Extra ILIKE substrings triggered by informal job-ad titles."""
    low = normalized_title.lower()
    extra: List[str] = []
    for needles, patterns in ALIAS_NEEDLES:
        if any(n in low for n in needles):
            for p in patterns:
                extra.append(p)
    # De-dupe, keep order
    seen: Set[str] = set()
    uniq: List[str] = []
    for p in extra:
        key = p.lower()
        if key not in seen:
            seen.add(key)
            uniq.append(p)
    return uniq


def build_ilike_terms(normalized_title: str) -> List[str]:
    """
    Build list of SQL ILIKE patterns (with safe escaping of user chars only;
    wrappers add %).
    """
    terms: List[str] = []

    nt = normalized_title.strip()
    if nt:
        clean = sanitize_ilike_piece(nt)
        if len(clean) >= 2:
            terms.append(f"%{clean}%")

    for kw in keywords_from_title(nt):
        clean = sanitize_ilike_piece(kw)
        if len(clean) >= 2:
            terms.append(f"%{clean}%")

    for frag in alias_expansion_patterns(nt):
        clean = sanitize_ilike_piece(frag)
        if len(clean) >= 2:
            terms.append(f"%{clean}%")

    # De-dupe identical patterns
    seen: Set[str] = set()
    out: List[str] = []
    for t in terms:
        tl = t.lower()
        if tl not in seen:
            seen.add(tl)
            out.append(t)
    return out[:24]
