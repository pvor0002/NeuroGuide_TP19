#!/usr/bin/env python3
"""
SEED OCCUPATIONS TABLE
======================
Reads the Excel occupation data and seeds the RDS occupations table.
Run this once to populate the database.

Usage:
    python3 scripts/seed_occupations.py
"""

import pandas as pd
import psycopg2
import json

# ============================================================================
# RDS CONNECTION
# ============================================================================
DB_CONFIG = {
    "host": "neuroguide-db.clksac42w16c.ap-southeast-2.rds.amazonaws.com",
    "port": 5432,
    "database": "neuroguide",
    "user": "neuroguide_admin",
    "password": "NeuroGuide2025!"
}

EXCEL_FILE = "data/Occupation profiles data - February 2026.xlsx"


# ============================================================================
# SKILL MAPPING — maps occupation keywords to implied skills
# ============================================================================
SKILL_MAPPING = {
    "software": ["Python", "JavaScript", "Problem-solving", "Git", "Testing", "Debugging"],
    "developer": ["Python", "JavaScript", "Problem-solving", "Git", "Testing", "Debugging"],
    "programmer": ["Python", "JavaScript", "Problem-solving", "Git", "Testing"],
    "engineer": ["Problem-solving", "Technical Analysis", "Documentation", "Planning"],
    "analyst": ["Data Analysis", "Problem-solving", "Documentation", "Excel", "Reporting"],
    "data": ["Data Analysis", "Python", "Excel", "Reporting", "Problem-solving"],
    "manager": ["Leadership", "Planning", "Communication", "Decision Making", "Coordination"],
    "project": ["Planning", "Coordination", "Communication", "Documentation", "Leadership"],
    "accountant": ["Excel", "Reporting", "Attention to Detail", "Documentation", "Compliance"],
    "nurse": ["Communication", "Documentation", "Assessment", "Monitoring", "Client Communication"],
    "teacher": ["Communication", "Planning", "Documentation", "Assessment", "Leadership"],
    "designer": ["Design", "Creativity", "Communication", "Problem-solving", "Visual Workflow"],
    "researcher": ["Data Analysis", "Documentation", "Reporting", "Problem-solving", "Attention to Detail"],
    "administrator": ["Documentation", "Communication", "Coordination", "Record Keeping", "Planning"],
    "coordinator": ["Coordination", "Communication", "Planning", "Documentation", "Problem-solving"],
    "technician": ["Maintenance", "Problem-solving", "Attention to Detail", "Documentation", "Inspection"],
    "consultant": ["Communication", "Problem-solving", "Analysis", "Documentation", "Planning"],
    "sales": ["Communication", "Client Communication", "Problem-solving", "Promotion and Outreach"],
    "cleaner": ["Cleaning Operations", "Attention to Detail", "Physical Stamina"],
    "driver": ["Attention to Detail", "Physical Stamina", "Communication"],
    "chef": ["Attention to Detail", "Creativity", "Quality Checking", "Coordination"],
    "lawyer": ["Documentation", "Communication", "Problem-solving", "Compliance", "Attention to Detail"],
    "doctor": ["Assessment", "Documentation", "Communication", "Decision Making", "Monitoring"],
    "retail": ["Client Communication", "Communication", "Attention to Detail", "Record Keeping"],
    "receptionist": ["Communication", "Client Communication", "Record Keeping", "Coordination"],
    "electrician": ["Installation", "Maintenance", "Problem-solving", "Inspection", "Safety"],
    "carpenter": ["Installation", "Maintenance", "Attention to Detail", "Problem-solving"],
    "construction": ["Planning", "Coordination", "Inspection", "Safety", "Problem-solving"],
}


# ============================================================================
# ADHD FRIENDLINESS SCORING
# Based on teammate's 5-factor specification:
# 1. Structure level     (routine = higher score)       max +20
# 2. Interrupt frequency (low = higher score)           max +20
# 3. Work pace           (steady = higher score)        max +20
# 4. Autonomy level      (flexible = moderate score)    max +20
# 5. Complexity          (medium = best for most ADHD)  max +20
# ============================================================================
def calculate_adhd_friendliness(row):
    """
    Calculate ADHD friendliness score (0-100) using teammate's 5 factors.
    Each factor contributes up to 20 points.
    """
    occupation = str(row.get('occupation_name', '')).lower()
    score = 0.0

    # ── FACTOR 1: Structure level (routine = higher score) ──────────── /20
    if any(k in occupation for k in ['developer', 'software', 'programmer', 'technician',
                                      'accountant', 'data entry', 'librarian', 'archivist']):
        f1 = 20
    elif any(k in occupation for k in ['analyst', 'researcher', 'administrator',
                                        'coordinator', 'clerk', 'receptionist']):
        f1 = 15
    elif any(k in occupation for k in ['teacher', 'nurse', 'engineer', 'designer']):
        f1 = 10
    elif any(k in occupation for k in ['manager', 'director', 'consultant', 'sales']):
        f1 = 5
    elif any(k in occupation for k in ['executive', 'entrepreneur', 'politician']):
        f1 = 2
    else:
        f1 = 10

    # ── FACTOR 2: Interrupt frequency (low interruptions = higher score) /20
    if any(k in occupation for k in ['developer', 'software', 'programmer', 'researcher',
                                      'writer', 'analyst', 'data']):
        f2 = 20
    elif any(k in occupation for k in ['technician', 'electrician', 'carpenter',
                                        'driver', 'operator', 'cleaner']):
        f2 = 16
    elif any(k in occupation for k in ['accountant', 'administrator', 'coordinator']):
        f2 = 12
    elif any(k in occupation for k in ['teacher', 'nurse', 'doctor', 'social worker']):
        f2 = 8
    elif any(k in occupation for k in ['manager', 'receptionist', 'sales', 'retail',
                                        'customer service']):
        f2 = 4
    else:
        f2 = 10

    # ── FACTOR 3: Work pace (steady pace = higher score) ────────────── /20
    if any(k in occupation for k in ['developer', 'software', 'researcher', 'analyst',
                                      'accountant', 'librarian', 'archivist']):
        f3 = 20
    elif any(k in occupation for k in ['technician', 'electrician', 'carpenter',
                                        'driver', 'operator']):
        f3 = 16
    elif any(k in occupation for k in ['teacher', 'administrator', 'coordinator',
                                        'designer', 'engineer']):
        f3 = 12
    elif any(k in occupation for k in ['nurse', 'doctor', 'paramedic', 'chef']):
        f3 = 6
    elif any(k in occupation for k in ['manager', 'sales', 'retail', 'customer service',
                                        'trader', 'journalist']):
        f3 = 4
    else:
        f3 = 10

    # ── FACTOR 4: Autonomy level (moderate flexibility = best) ────────  /20
    if any(k in occupation for k in ['developer', 'designer', 'researcher',
                                      'analyst', 'architect', 'engineer']):
        f4 = 18
    elif any(k in occupation for k in ['technician', 'accountant', 'coordinator',
                                        'administrator']):
        f4 = 14
    elif any(k in occupation for k in ['teacher', 'nurse', 'consultant']):
        f4 = 12
    elif any(k in occupation for k in ['manager', 'director', 'executive']):
        f4 = 8
    elif any(k in occupation for k in ['sales', 'retail', 'driver', 'cleaner',
                                        'labourer', 'factory']):
        f4 = 6
    else:
        f4 = 12

    # ── FACTOR 5: Complexity (medium complexity = best for ADHD) ─────── /20
    if any(k in occupation for k in ['developer', 'software', 'analyst', 'designer',
                                      'engineer', 'researcher']):
        f5 = 18
    elif any(k in occupation for k in ['accountant', 'technician', 'coordinator',
                                        'teacher', 'nurse']):
        f5 = 14
    elif any(k in occupation for k in ['administrator', 'receptionist', 'clerk',
                                        'driver', 'operator']):
        f5 = 10
    elif any(k in occupation for k in ['manager', 'director', 'lawyer', 'doctor',
                                        'surgeon', 'executive']):
        f5 = 8
    elif any(k in occupation for k in ['cleaner', 'labourer', 'packer', 'storeperson']):
        f5 = 6
    else:
        f5 = 12

    total = f1 + f2 + f3 + f4 + f5
    return round(max(0, min(100, total)), 1)


def get_work_complexity(occupation_name):
    """Determine work complexity based on occupation type."""
    name = occupation_name.lower()
    high_complexity = ['manager', 'director', 'executive', 'lawyer', 'doctor',
                       'surgeon', 'engineer', 'developer', 'analyst', 'architect',
                       'scientist', 'researcher', 'consultant', 'programmer']
    low_complexity = ['cleaner', 'labourer', 'driver', 'packer', 'cashier',
                      'storeperson', 'kitchenhand', 'farm worker', 'delivery']
    if any(k in name for k in high_complexity):
        return 'High'
    elif any(k in name for k in low_complexity):
        return 'Low'
    else:
        return 'Medium'


def get_implied_skills(occupation_name):
    """Get implied skills based on occupation name keywords."""
    name = occupation_name.lower()
    skills = set()
    for keyword, skill_list in SKILL_MAPPING.items():
        if keyword in name:
            skills.update(skill_list)
    if not skills:
        skills = {"Communication", "Problem-solving", "Attention to Detail", "Documentation"}
    return list(skills)[:6]


# ============================================================================
# MAIN SEEDING FUNCTION
# ============================================================================
def seed_occupations():
    print("=" * 60)
    print("SEEDING OCCUPATIONS TABLE")
    print("=" * 60)

    # 1. Read Excel
    print("\n[1/4] Reading Excel file...")
    df = pd.read_excel(EXCEL_FILE, sheet_name='Table_1', skiprows=6)
    df.columns = [
        'anzsco_code', 'occupation_name', 'employed_count',
        'part_time_share_pct', 'female_share_pct', 'median_weekly_earnings',
        'median_age', 'annual_employment_growth', 'col8', 'col9'
    ]
    df = df[['anzsco_code', 'occupation_name', 'employed_count',
             'part_time_share_pct', 'female_share_pct', 'median_weekly_earnings',
             'median_age', 'annual_employment_growth']]
    df = df.dropna(subset=['anzsco_code', 'occupation_name'])
    df = df[df['anzsco_code'].astype(str).str.match(r'^\d+')]
    print(f"    ✓ Loaded {len(df)} occupations from Excel")

    # 2. Enrich with calculated fields
    print("\n[2/4] Calculating ADHD friendliness scores and skills...")
    df['adhd_friendliness_score'] = df.apply(calculate_adhd_friendliness, axis=1)
    df['work_complexity'] = df['occupation_name'].apply(get_work_complexity)
    df['implied_skills'] = df['occupation_name'].apply(get_implied_skills)
    df['typical_hours_per_week'] = 38
    print(f"    ✓ Scores calculated")

    # 3. Connect to RDS
    print("\n[3/4] Connecting to RDS...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        print("    ✓ Connected to RDS successfully")
    except Exception as e:
        print(f"    ✗ Connection failed: {e}")
        return

    # 4. Insert data
    print(f"\n[4/4] Inserting {len(df)} occupations into database...")

    insert_sql = """
        INSERT INTO occupations (
            anzsco_code, occupation_name, employed_count,
            part_time_share_pct, female_share_pct, median_weekly_earnings,
            median_age, annual_employment_growth, work_complexity,
            typical_hours_per_week, adhd_friendliness_score, implied_skills
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (anzsco_code) DO UPDATE SET
            occupation_name = EXCLUDED.occupation_name,
            adhd_friendliness_score = EXCLUDED.adhd_friendliness_score,
            implied_skills = EXCLUDED.implied_skills,
            work_complexity = EXCLUDED.work_complexity
    """

    success = 0
    errors = 0

    for _, row in df.iterrows():
        try:
            cursor.execute(insert_sql, (
                str(row['anzsco_code']),
                str(row['occupation_name']),
                int(row['employed_count']) if pd.notna(row['employed_count']) else None,
                float(row['part_time_share_pct']) if pd.notna(row['part_time_share_pct']) else None,
                float(row['female_share_pct']) if pd.notna(row['female_share_pct']) else None,
                int(row['median_weekly_earnings']) if pd.notna(row['median_weekly_earnings']) else None,
                int(row['median_age']) if pd.notna(row['median_age']) else None,
                float(row['annual_employment_growth']) if pd.notna(row['annual_employment_growth']) else None,
                row['work_complexity'],
                row['typical_hours_per_week'],
                float(row['adhd_friendliness_score']),
                json.dumps(row['implied_skills'])
            ))
            success += 1
        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f"    ⚠ Error on {row['occupation_name']}: {e}")

    conn.commit()
    cursor.close()
    conn.close()

    print(f"\n{'=' * 60}")
    print(f"✓ SEEDING COMPLETE")
    print(f"  Inserted/Updated: {success} occupations")
    print(f"  Errors: {errors}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    seed_occupations()
