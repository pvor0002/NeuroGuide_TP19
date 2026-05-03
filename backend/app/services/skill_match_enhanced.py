"""
Richer skill overlap: ecosystem clusters + fuzzy string match (rapidfuzz, else difflib).
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Callable, Dict, FrozenSet, List, Set

try:
    from rapidfuzz import fuzz
except ImportError:  # pragma: no cover
    fuzz = None  # type: ignore

# Ecosystem / stack families (all lowercased tokens)
# Canonical label -> alias phrases (after basic normalize)
SKILL_EQUIVALENCE: Dict[str, FrozenSet[str]] = {
    "javascript": frozenset({"js", "ecmascript", "es6", "node", "nodejs"}),
    "typescript": frozenset({"ts"}),
    "api integration": frozenset({"apis", "api", "rest api", "restful", "openapi", "graphql"}),
    "testing": frozenset({"qa", "tdd", "jest", "cypress", "selenium", "quality assurance"}),
    "problem solving": frozenset({"problem-solving", "problem solving"}),
    "version control": frozenset({"git", "github", "gitlab"}),
    "sql": frozenset({"mysql", "postgresql", "postgres", "sqlite", "database"}),
    "python": frozenset({"django", "flask", "fastapi", "pandas"}),
    "react": frozenset({"redux", "nextjs", "next"}),
    "golang": frozenset({"go", "golang"}),
    "kubernetes": frozenset({"k8s", "kubectl", "helm"}),
    "machine learning": frozenset({"ml", "tensorflow", "pytorch", "sklearn"}),
}

SKILL_CLUSTERS: List[FrozenSet[str]] = [
    frozenset(
        {
            "python",
            "django",
            "flask",
            "fastapi",
            "pandas",
            "numpy",
            "pytest",
            "celery",
        }
    ),
    frozenset(
        {
            "javascript",
            "js",
            "typescript",
            "ts",
            "react",
            "node",
            "nodejs",
            "vue",
            "angular",
            "next",
        }
    ),
    frozenset({"java", "kotlin", "spring", "gradle", "maven", "jvm"}),
    frozenset({"sql", "mysql", "postgresql", "postgres", "sqlite", "rds", "database"}),
    frozenset({"aws", "azure", "gcp", "cloud", "terraform", "kubernetes", "k8s", "docker"}),
    frozenset({"git", "github", "gitlab", "mercurial", "version", "control"}),
    frozenset({"agile", "scrum", "kanban", "jira", "sprint"}),
    frozenset({"testing", "qa", "jest", "cypress", "selenium", "tdd", "junit"}),
    frozenset({"api", "rest", "graphql", "grpc", "openapi", "microservices"}),
    frozenset(
        {
            "communication",
            "collaboration",
            "stakeholder",
            "documentation",
        }
    ),
    frozenset({"html", "css", "sass", "tailwind", "webpack", "frontend", "ui", "ux"}),
]


def apply_skill_equivalence(normalized: str) -> str:
    """Collapse synonyms into canonical keys for fairer matching."""
    if not normalized:
        return normalized
    for canon, aliases in SKILL_EQUIVALENCE.items():
        if normalized == canon:
            return canon
        if normalized in aliases:
            return canon
        for al in aliases:
            if al in normalized or normalized in al:
                return canon
    return normalized


def _tokenize(normalize: Callable[[str], str], s: str) -> Set[str]:
    t = normalize(s)
    return {x for x in re.split(r"\s+", t) if len(x) > 1}


def _same_cluster(a: str, b: str, normalize: Callable[[str], str]) -> bool:
    ta = _tokenize(normalize, a)
    tb = _tokenize(normalize, b)
    if not ta or not tb:
        return False
    for cl in SKILL_CLUSTERS:
        if (ta & cl) and (tb & cl):
            return True
    return False


def skills_overlap_enhanced(
    user_skill: str,
    job_skill: str,
    *,
    normalize: Callable[[str], str],
    base_overlap: Callable[[str, str], bool],
    fuzzy_ratio: int = 74,
) -> bool:
    if base_overlap(user_skill, job_skill):
        return True
    if _same_cluster(user_skill, job_skill, normalize):
        return True
    u = normalize(user_skill)
    j = normalize(job_skill)
    if not u or not j:
        return False
    if fuzz is not None:
        if fuzz.partial_ratio(u, j) >= fuzzy_ratio or fuzz.token_sort_ratio(u, j) >= fuzzy_ratio - 3:
            return True
    ratio = SequenceMatcher(None, u, j).ratio()
    return ratio >= 0.80
