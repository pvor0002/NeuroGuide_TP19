"""
TDD tests for Day in Life API endpoint.

Covers:
- POST /api/v1/day-in-life

Gemini service calls are mocked so tests run without a real API key.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.day_in_life import DayInLifeResponse, TimeBlock

client = TestClient(app)

# ── Shared mock response ──────────────────────────────────────────────────────

def make_mock_response(job_title="Software Developer", adhd_type="inattentive"):
    return DayInLifeResponse(
        job_title=job_title,
        adhd_type=adhd_type,
        data_source="anzsco",
        timeline=[
            TimeBlock(
                time="9:00 AM",
                task="Deep focus coding",
                description="Work on the most complex task of the day without interruptions.",
                energy_level="high",
                adhd_tip="Use a Pomodoro timer. 25 min on, 5 min off.",
            ),
            TimeBlock(
                time="10:30 AM",
                task="Team standup",
                description="Quick 15-minute sync with the team.",
                energy_level="medium",
                adhd_tip="Write down your update beforehand to stay on track.",
            ),
            TimeBlock(
                time="12:00 PM",
                task="Lunch break",
                description="Step away from the screen and recharge.",
                energy_level="break",
                adhd_tip=None,
            ),
        ],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Happy path
# ─────────────────────────────────────────────────────────────────────────────

class TestDayInLifeHappyPath:

    def test_returns_200_with_valid_payload(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response()
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        assert response.status_code == 200

    def test_response_contains_required_fields(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response()
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        data = response.json()
        assert "job_title" in data
        assert "adhd_type" in data
        assert "data_source" in data
        assert "timeline" in data

    def test_timeline_is_non_empty_list(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response()
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        timeline = response.json()["timeline"]
        assert isinstance(timeline, list)
        assert len(timeline) > 0

    def test_each_time_block_has_required_fields(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response()
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        for block in response.json()["timeline"]:
            assert "time" in block
            assert "task" in block
            assert "description" in block
            assert "energy_level" in block

    def test_energy_level_is_valid_value(self):
        valid_levels = {"low", "medium", "high", "break"}
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response()
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        for block in response.json()["timeline"]:
            assert block["energy_level"] in valid_levels

    def test_break_block_has_no_adhd_tip(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response()
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        break_blocks = [b for b in response.json()["timeline"] if b["energy_level"] == "break"]
        for block in break_blocks:
            assert block.get("adhd_tip") is None

    def test_job_title_reflected_in_response(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response(job_title="UX Designer")
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "UX Designer", "adhd_type": "combined"},
            )
        assert response.json()["job_title"] == "UX Designer"

    def test_adhd_type_reflected_in_response(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response(adhd_type="hyperactive")
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Project Manager", "adhd_type": "hyperactive"},
            )
        assert response.json()["adhd_type"] == "hyperactive"

    def test_data_source_is_valid_value(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response()
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        assert response.json()["data_source"] in {"anzsco", "gemini_fallback"}


# ─────────────────────────────────────────────────────────────────────────────
# ADHD types
# ─────────────────────────────────────────────────────────────────────────────

class TestDayInLifeAdhdTypes:

    def test_inattentive_type_accepted(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response(adhd_type="inattentive")
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Analyst", "adhd_type": "inattentive"},
            )
        assert response.status_code == 200

    def test_hyperactive_type_accepted(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response(adhd_type="hyperactive")
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Analyst", "adhd_type": "hyperactive"},
            )
        assert response.status_code == 200

    def test_combined_type_accepted(self):
        with patch("app.api.routes.day_in_life.generate_day_in_life_with_gemini") as mock:
            mock.return_value = make_mock_response(adhd_type="combined")
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Analyst", "adhd_type": "combined"},
            )
        assert response.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# Error handling
# ─────────────────────────────────────────────────────────────────────────────

class TestDayInLifeErrorHandling:

    def test_gemini_failure_returns_502(self):
        with patch(
            "app.api.routes.day_in_life.generate_day_in_life_with_gemini",
            side_effect=Exception("Gemini unavailable"),
        ):
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        assert response.status_code == 502

    def test_502_response_has_detail_message(self):
        with patch(
            "app.api.routes.day_in_life.generate_day_in_life_with_gemini",
            side_effect=Exception("timeout"),
        ):
            response = client.post(
                "/api/v1/day-in-life",
                json={"job_title": "Software Developer", "adhd_type": "inattentive"},
            )
        assert "detail" in response.json()


# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────

class TestDayInLifeSchemaValidation:

    def test_missing_job_title_returns_422(self):
        response = client.post(
            "/api/v1/day-in-life",
            json={"adhd_type": "inattentive"},
        )
        assert response.status_code == 422

    def test_missing_adhd_type_returns_422(self):
        response = client.post(
            "/api/v1/day-in-life",
            json={"job_title": "Software Developer"},
        )
        assert response.status_code == 422

    def test_empty_job_title_returns_422(self):
        response = client.post(
            "/api/v1/day-in-life",
            json={"job_title": "", "adhd_type": "inattentive"},
        )
        assert response.status_code == 422

    def test_empty_body_returns_422(self):
        response = client.post("/api/v1/day-in-life", json={})
        assert response.status_code == 422
