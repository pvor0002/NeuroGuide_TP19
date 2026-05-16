#!/usr/bin/env python3
"""
Populate empty role_taxonomy and skill_taxonomy (RDS) with IT-focused rows
derived from data/au-role-taxonomy.json, data/au-skills-taxonomy.json, and
early-career IT presets — for documentation / DBeaver demos only (app still uses JSON).

Usage (from repo root):
  pip install psycopg2-binary python-dotenv
  python3 scripts/seed_it_taxonomy_tables.py

Requires DATABASE_URL in backend/.env (or env var).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_batch

REPO_ROOT = Path(__file__).resolve().parents[1]
ROLES_JSON = REPO_ROOT / "data" / "au-role-taxonomy.json"
SKILLS_JSON = REPO_ROOT / "data" / "au-skills-taxonomy.json"

IT_ROLE_PATTERN = re.compile(
    r"\b("
    r"software|programmer|developer|web\b|ict\b|data\b|database|"
    r"cyber|security specialist|network|telecom|multimedia|"
    r"business analyst|systems?\s+admin|devops|cloud|"
    r"tester|qa\b|analyst programmer|support engineer|"
    r"applications?\s+program"
    r")\b",
    re.I,
)

EARLY_CAREER_IT_ROLES = [
    "Software Developer",
    "Frontend Developer",
    "Backend Developer",
    "Full Stack Developer",
    "Web Developer",
    "Mobile App Developer",
    "UI/UX Designer",
    "QA Tester",
    "Automation Tester",
    "Business Analyst",
    "Data Analyst",
    "Junior Data Scientist",
    "Cybersecurity Analyst",
    "Cloud Support Associate",
    "DevOps Engineer",
    "IT Support Specialist",
    "Systems Administrator",
    "Network Support Engineer",
    "Technical Support Analyst",
    "Software Engineer Intern",
    "Graduate Developer",
    "Junior Programmer",
]

ROLE_TO_SUGGESTED_SKILLS: dict[str, list[str]] = {
    "Frontend Developer": ["HTML", "CSS", "JavaScript", "React", "TypeScript", "Git", "Responsive Design"],
    "Backend Developer": ["Node.js", "Express", "APIs", "SQL", "MongoDB", "Authentication", "Git"],
    "Full Stack Developer": ["JavaScript", "React", "Node.js", "SQL", "REST APIs", "Git", "HTML", "CSS"],
    "Software Developer": ["Python", "Git", "SQL", "Debugging", "Testing", "Problem-solving"],
    "Web Developer": ["HTML", "CSS", "JavaScript", "Git", "Responsive Design", "REST APIs"],
    "Data Analyst": ["Python", "SQL", "Excel", "Power BI", "Tableau", "Data Cleaning"],
    "DevOps Engineer": ["Docker", "CI/CD", "Linux", "Git", "Kubernetes", "Shell scripting"],
    "Cybersecurity Analyst": ["Security monitoring", "Incident response", "Networking basics", "Risk awareness"],
    "IT Support Specialist": ["Troubleshooting", "Windows", "Ticketing", "Networking basics", "Customer service"],
    "Systems Administrator": ["Linux", "Windows Server", "Networking", "Backup", "Monitoring"],
    "Business Analyst": ["Requirements gathering", "Stakeholder communication", "Documentation", "Excel", "SQL"],
    "QA Tester": ["Test cases", "Manual testing", "Bug tracking", "Regression testing", "Attention to detail"],
}

# Skills from au-skills-taxonomy that fit IT / office tech contexts
IT_SKILL_ALLOWLIST = {
    "Adaptability",
    "Analysis",
    "Assessment",
    "Attention to Detail",
    "Client Communication",
    "Communication",
    "Coordination",
    "Data Collection",
    "Decision Making",
    "Design",
    "Development",
    "Documentation and Reporting",
    "Issue Identification",
    "Leadership",
    "Monitoring and Evaluation",
    "Planning",
    "Problem Solving",
    "Quality Checking",
    "Record Keeping",
    "Research",
    "Stakeholder Consultation",
    "Task Execution",
    "Team Collaboration",
    "Time Management",
    "Tool and Technology Use",
    "Work Organisation",
}

TECH_SKILL_EXTRAS = [
    "Python",
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "SQL",
    "Git",
    "HTML",
    "CSS",
    "REST APIs",
    "Docker",
    "Kubernetes",
    "AWS",
    "Linux",
    "Testing",
    "Debugging",
    "CI/CD",
    "Agile",
    "Scrum",
    "Machine Learning",
    "Excel",
    "Power BI",
]


def load_json_array(path: Path) -> list[str]:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{path} must be a JSON array")
    return [str(x).strip() for x in data if str(x).strip()]


def collect_it_roles() -> list[str]:
    from_json = load_json_array(ROLES_JSON)
    it_from_anzsco = [r for r in from_json if IT_ROLE_PATTERN.search(r)]
    merged: list[str] = []
    seen: set[str] = set()
    for r in [*EARLY_CAREER_IT_ROLES, *it_from_anzsco]:
        key = r.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(r.strip())
    return merged[:120]


def collect_it_skills() -> list[str]:
    from_json = load_json_array(SKILLS_JSON)
    from_json_it = [s for s in from_json if s in IT_SKILL_ALLOWLIST]
    extra: list[str] = []
    for skills in ROLE_TO_SUGGESTED_SKILLS.values():
        extra.extend(skills)
    extra.extend(TECH_SKILL_EXTRAS)
    merged: list[str] = []
    seen: set[str] = set()
    for s in [*from_json_it, *extra]:
        t = str(s).strip()
        if not t:
            continue
        k = t.lower()
        if k in seen:
            continue
        seen.add(k)
        merged.append(t)
    return merged[:80]


def skill_category(name: str) -> str:
    n = name.lower()
    if any(x in n for x in ("python", "java", "sql", "react", "docker", "aws", "git", "html", "kubernetes")):
        return "Technical"
    if any(x in n for x in ("communication", "stakeholder", "team", "leadership", "adaptability")):
        return "Soft skills"
    if any(x in n for x in ("excel", "power bi", "tableau", "figma")):
        return "Tools"
    if any(x in n for x in ("testing", "debug", "quality", "problem")):
        return "Quality & analysis"
    return "General"


def roles_for_skill(skill: str) -> list[str]:
    out: list[str] = []
    sk = skill.lower()
    for role, skills in ROLE_TO_SUGGESTED_SKILLS.items():
        if any(sk == s.lower() for s in skills):
            out.append(role)
    return out[:8]


def role_row(name: str, index: int) -> tuple:
    cat = "Information Technology"
    if "analyst" in name.lower() and "data" in name.lower():
        exp = "0–2 years (junior) or 2–4 years"
    elif any(x in name.lower() for x in ("intern", "graduate", "junior")):
        exp = "0–2 years"
    elif "manager" in name.lower():
        exp = "5+ years"
    else:
        exp = "2–5 years typical"
    skills = ROLE_TO_SUGGESTED_SKILLS.get(name)
    if not skills:
        skills = ["Communication", "Problem Solving", "Git", "SQL"][:4]
    desc = (
        f"IT role aligned with Australian occupation taxonomy and NeuroGuide early-career presets. "
        f"Common focus areas include {', '.join(skills[:3])}."
    )
    return (name, cat, desc, exp, skills)


def main() -> None:
    load_dotenv(REPO_ROOT / "backend" / ".env")
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise SystemExit("Set DATABASE_URL in backend/.env")

    roles = collect_it_roles()
    skills = collect_it_skills()

    role_records = [role_row(r, i) for i, r in enumerate(roles)]
    skill_records = [
        (s, skill_category(s), roles_for_skill(s) or None, 7 if skill_category(s) == "Soft skills" else 8)
        for s in skills
    ]

    conn = psycopg2.connect(url)
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM role_taxonomy")
        role_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM skill_taxonomy")
        skill_count = cur.fetchone()[0]

        if role_count > 0 or skill_count > 0:
            print(f"role_taxonomy has {role_count} rows, skill_taxonomy has {skill_count} rows.")
            ans = os.environ.get("SEED_TAXONOMY_FORCE", "").strip().lower()
            if ans not in ("1", "true", "yes"):
                print("Tables not empty — skipping. Set SEED_TAXONOMY_FORCE=1 to truncate and re-seed.")
                return
            cur.execute("TRUNCATE role_taxonomy RESTART IDENTITY CASCADE")
            cur.execute("TRUNCATE skill_taxonomy RESTART IDENTITY CASCADE")
            print("Truncated both tables.")

        execute_batch(
            cur,
            """
            INSERT INTO role_taxonomy (
                role_name, role_category, description,
                typical_experience_required, common_skills
            ) VALUES (%s, %s, %s, %s, %s)
            """,
            role_records,
            page_size=100,
        )
        execute_batch(
            cur,
            """
            INSERT INTO skill_taxonomy (
                skill_name, skill_category, related_roles, adhd_friendly_rating
            ) VALUES (%s, %s, %s, %s)
            """,
            skill_records,
            page_size=100,
        )
        conn.commit()
        print(f"Inserted {len(role_records)} roles and {len(skill_records)} skills into RDS.")
        print("Sample roles:", ", ".join(roles[:5]), "…")
        print("Sample skills:", ", ".join(skills[:5]), "…")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
