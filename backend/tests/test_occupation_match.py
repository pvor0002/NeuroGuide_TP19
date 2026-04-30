"""Unit tests for job-title normalization and occupation search term building."""

from app.services.occupation_match import (
    build_ilike_terms,
    normalize_job_title,
)


def test_normalize_strips_at_company():
    raw = "Software Engineer at Microsoft Azure Core"
    assert normalize_job_title(raw) == "Software Engineer"


def test_normalize_strips_em_dash_suffix():
    assert normalize_job_title("Backend Developer — Contract") == "Backend Developer"


def test_normalize_strips_parenthetical():
    assert normalize_job_title("Data Scientist (Remote)") == "Data Scientist"


def test_software_engineer_expansion_terms():
    nt = normalize_job_title("Software Engineer at Microsoft Azure Core")
    terms = build_ilike_terms(nt)
    joined = " ".join(t.lower() for t in terms)
    assert "%software%" in joined or "%software engineer%" in joined
    assert "programmer" in joined
    assert "developer programmer" in joined or "%developer programmer%" in joined


def test_company_tokens_not_in_search_terms():
    """Company names are stripped from the normalized title, not used as DB patterns."""
    nt = normalize_job_title("Senior Software Engineer at Microsoft")
    terms = build_ilike_terms(nt)
    assert not any("microsoft" in x.lower() for x in terms)
    assert len(terms) >= 3
