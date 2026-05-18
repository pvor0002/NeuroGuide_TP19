"""
TDD tests for Interview Prep API endpoints.

Covers:
- /interview-prep/split-brain-dump
- /interview-prep/star-sort
- /interview-prep/formulate-speech
- /interview-prep/reshape-answer
- /interview-prep/speech-coach
- /interview-prep/generate-questions

Gemini service calls are mocked so tests run without a real API key.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# /split-brain-dump
# ─────────────────────────────────────────────────────────────────────────────

class TestSplitBrainDump:

    def test_short_text_returned_as_single_point(self):
        """Short text that doesn't need splitting is returned as-is."""
        response = client.post(
            "/api/v1/interview-prep/split-brain-dump",
            json={"text": "I fixed a bug before launch.", "question": "Tell me about a challenge."},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["points"] == ["I fixed a bug before launch."]

    def test_long_multi_sentence_text_splits(self):
        """Long multi-sentence text triggers heuristic split when Gemini is unavailable."""
        long_text = (
            "In my previous role, our team was responsible for processing weekly security "
            "vulnerability reports. The system was siloed: developers found bugs, security teams "
            "logged them in spreadsheets, and management received a PDF report three days late. "
            "Because the subsystems were not integrated, critical patches were being missed."
        )
        with patch("app.api.routes.interview_prep.split_card_text_with_gemini") as mock_gemini:
            mock_gemini.return_value = [
                "Our team processed weekly security vulnerability reports.",
                "The system was siloed across developers, security teams and management.",
                "Critical patches were being missed due to lack of integration.",
            ]
            response = client.post(
                "/api/v1/interview-prep/split-brain-dump",
                json={"text": long_text, "question": "Tell me about a challenge."},
            )
        assert response.status_code == 200
        data = response.json()
        assert len(data["points"]) >= 2
        assert all(isinstance(p, str) and p for p in data["points"])

    def test_run_on_text_without_punctuation_splits(self):
        """Run-on spoken text with no sentence endings triggers split (must be >= 180 chars)."""
        run_on = (
            "so my teammate was really struggling with the deployment and I stepped in to help "
            "and we worked together through the night to fix the pipeline issue and eventually "
            "got it working just before the deadline which was a huge relief for the whole team"
        )
        with patch("app.api.routes.interview_prep.split_card_text_with_gemini") as mock_gemini:
            mock_gemini.return_value = [
                "My teammate was struggling with the deployment.",
                "I stepped in and we worked together to fix the pipeline.",
                "We got it working before the deadline.",
            ]
            response = client.post(
                "/api/v1/interview-prep/split-brain-dump",
                json={"text": run_on, "question": ""},
            )
        assert response.status_code == 200
        assert len(response.json()["points"]) >= 2

    def test_gemini_failure_falls_back_to_heuristic(self):
        """When Gemini raises an exception, the endpoint falls back to heuristic split."""
        long_text = (
            "I built a REST API for our internal dashboard. "
            "The dashboard showed real-time data from multiple services. "
            "We had to handle authentication and rate limiting carefully."
        )
        with patch("app.api.routes.interview_prep.split_card_text_with_gemini", side_effect=Exception("Gemini down")):
            response = client.post(
                "/api/v1/interview-prep/split-brain-dump",
                json={"text": long_text, "question": "Tell me about a project."},
            )
        assert response.status_code == 200
        assert len(response.json()["points"]) >= 1

    def test_empty_text_returns_422(self):
        """Empty text fails schema validation."""
        response = client.post(
            "/api/v1/interview-prep/split-brain-dump",
            json={"text": "", "question": "Tell me about a challenge."},
        )
        assert response.status_code == 422

    def test_missing_text_returns_422(self):
        response = client.post(
            "/api/v1/interview-prep/split-brain-dump",
            json={"question": "Tell me about a challenge."},
        )
        assert response.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# /star-sort
# ─────────────────────────────────────────────────────────────────────────────

class TestStarSort:

    CARDS = [
        {"id": "d1", "text": "Our team had a tight deadline for the project."},
        {"id": "d2", "text": "I wrote the deployment scripts and coordinated with QA."},
        {"id": "d3", "text": "We shipped on time and got positive feedback."},
    ]

    def test_returns_star_zones_and_cards(self):
        with patch("app.api.routes.interview_prep.star_sort_cards_with_gemini") as mock:
            mock.return_value = (
                {"situation": ["d1"], "task": [], "action": ["d2"], "result": ["d3"]},
                [{"id": c["id"], "text": c["text"]} for c in self.CARDS],
            )
            response = client.post(
                "/api/v1/interview-prep/star-sort",
                json={"question": "Tell me about a time you met a deadline.", "cards": self.CARDS},
            )
        assert response.status_code == 200
        data = response.json()
        assert "situation" in data
        assert "action" in data
        assert "result" in data
        assert isinstance(data["cards"], list)

    def test_gemini_failure_returns_502(self):
        with patch("app.api.routes.interview_prep.star_sort_cards_with_gemini", side_effect=Exception("timeout")):
            response = client.post(
                "/api/v1/interview-prep/star-sort",
                json={"question": "Tell me about a deadline.", "cards": self.CARDS},
            )
        assert response.status_code == 502

    def test_empty_cards_returns_422(self):
        response = client.post(
            "/api/v1/interview-prep/star-sort",
            json={"question": "Tell me about a deadline.", "cards": []},
        )
        assert response.status_code == 422

    def test_missing_question_returns_422(self):
        response = client.post(
            "/api/v1/interview-prep/star-sort",
            json={"cards": self.CARDS},
        )
        assert response.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# /formulate-speech
# ─────────────────────────────────────────────────────────────────────────────

class TestFormulateSpeech:

    PAYLOAD = {
        "question": "Tell me about a time you solved a difficult problem.",
        "situation": ["Our API was timing out under load."],
        "task": ["I needed to find and fix the bottleneck quickly."],
        "action": ["I profiled the code and found an N+1 query.", "I rewrote the query with a join."],
        "result": ["Response time dropped by 80%."],
    }

    def test_returns_formulated_speech(self):
        with patch("app.api.routes.interview_prep.formulate_speech_from_star_with_gemini") as mock:
            mock.return_value = "When our API started timing out, I was tasked with finding the issue..."
            response = client.post("/api/v1/interview-prep/formulate-speech", json=self.PAYLOAD)
        assert response.status_code == 200
        assert isinstance(response.json()["text"], str)
        assert len(response.json()["text"]) > 0

    def test_gemini_failure_returns_502(self):
        with patch(
            "app.api.routes.interview_prep.formulate_speech_from_star_with_gemini",
            side_effect=Exception("Gemini unavailable"),
        ):
            response = client.post("/api/v1/interview-prep/formulate-speech", json=self.PAYLOAD)
        assert response.status_code == 502

    def test_missing_question_returns_422(self):
        payload = {**self.PAYLOAD}
        del payload["question"]
        response = client.post("/api/v1/interview-prep/formulate-speech", json=payload)
        assert response.status_code == 422

    def test_empty_star_zones_allowed(self):
        """STAR zones are optional — empty lists should be accepted."""
        with patch("app.api.routes.interview_prep.formulate_speech_from_star_with_gemini") as mock:
            mock.return_value = "I worked on a challenging project..."
            response = client.post(
                "/api/v1/interview-prep/formulate-speech",
                json={"question": "Tell me about a challenge.", "situation": [], "task": [], "action": [], "result": []},
            )
        assert response.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# /reshape-answer
# ─────────────────────────────────────────────────────────────────────────────

class TestReshapeAnswer:

    def test_returns_reshaped_text(self):
        with patch("app.api.routes.interview_prep.reshape_answer_with_gemini") as mock:
            mock.return_value = "A cleaner version of the answer."
            response = client.post(
                "/api/v1/interview-prep/reshape-answer",
                json={"answer": "My answer about the project.", "instruction": "Make it more concise."},
            )
        assert response.status_code == 200
        assert response.json()["text"] == "A cleaner version of the answer."

    def test_gemini_failure_returns_502(self):
        with patch("app.api.routes.interview_prep.reshape_answer_with_gemini", side_effect=Exception("error")):
            response = client.post(
                "/api/v1/interview-prep/reshape-answer",
                json={"answer": "My answer.", "instruction": "Shorten it."},
            )
        assert response.status_code == 502

    def test_missing_answer_returns_422(self):
        response = client.post(
            "/api/v1/interview-prep/reshape-answer",
            json={"instruction": "Make it shorter."},
        )
        assert response.status_code == 422

    def test_missing_instruction_returns_422(self):
        response = client.post(
            "/api/v1/interview-prep/reshape-answer",
            json={"answer": "My answer."},
        )
        assert response.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# /speech-coach
# ─────────────────────────────────────────────────────────────────────────────

class TestSpeechCoach:

    PAYLOAD = {
        "question": "Tell me about a time you led a team.",
        "spoken_transcript": "Um, so I was like, leading the team and we kind of got it done.",
        "written_answer": "I led a team of 4 to deliver the project on time.",
    }

    MOCK_RESULT = {
        "star_coverage": {"situation": 40, "task": 30, "action": 60, "result": 50},
        "strengths": ["Clear result mentioned"],
        "improvements": ["Add more detail on the situation"],
        "filler_words": ["um", "like", "kind of"],
        "readiness_bump": 5,
        "summary": "Good start, needs more structure.",
    }

    def test_returns_coaching_feedback(self):
        with patch("app.api.routes.interview_prep.coach_spoken_answer_with_gemini") as mock:
            mock.return_value = self.MOCK_RESULT
            response = client.post("/api/v1/interview-prep/speech-coach", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert "star_coverage" in data
        assert "filler_words" in data
        assert isinstance(data["strengths"], list)
        assert isinstance(data["improvements"], list)

    def test_star_coverage_values_in_range(self):
        with patch("app.api.routes.interview_prep.coach_spoken_answer_with_gemini") as mock:
            mock.return_value = self.MOCK_RESULT
            response = client.post("/api/v1/interview-prep/speech-coach", json=self.PAYLOAD)
        coverage = response.json()["star_coverage"]
        for zone in ("situation", "task", "action", "result"):
            assert 0 <= coverage[zone] <= 100

    def test_gemini_failure_returns_502(self):
        with patch("app.api.routes.interview_prep.coach_spoken_answer_with_gemini", side_effect=Exception("timeout")):
            response = client.post("/api/v1/interview-prep/speech-coach", json=self.PAYLOAD)
        assert response.status_code == 502

    def test_missing_spoken_transcript_returns_422(self):
        payload = {**self.PAYLOAD}
        del payload["spoken_transcript"]
        response = client.post("/api/v1/interview-prep/speech-coach", json=payload)
        assert response.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# /generate-questions
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateQuestions:

    PAYLOAD = {
        "known_skills": ["Python", "AWS"],
        "missing_skills": ["Kubernetes"],
        "role": "DevOps Engineer",
        "company": "Acme Corp",
        "summary": "Manage cloud infrastructure and CI/CD pipelines.",
        "responsibilities": "Deploy and monitor services on AWS.",
    }

    def test_returns_list_of_questions(self):
        with patch("app.api.routes.interview_prep.generate_interview_questions_with_gemini") as mock:
            mock.return_value = [
                "Tell me about a time you used Python to automate a task.",
                "How have you worked with AWS in a production environment?",
                "How would you approach learning Kubernetes on the job?",
                "What excites you about DevOps at Acme Corp?",
            ]
            response = client.post("/api/v1/interview-prep/generate-questions", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["questions"], list)
        assert len(data["questions"]) == 4
        assert all(isinstance(q, str) and q for q in data["questions"])

    def test_generates_exactly_4_questions(self):
        """Should return 2 known skill, 1 missing skill, 1 company question."""
        with patch("app.api.routes.interview_prep.generate_interview_questions_with_gemini") as mock:
            mock.return_value = ["Q1", "Q2", "Q3", "Q4"]
            response = client.post("/api/v1/interview-prep/generate-questions", json=self.PAYLOAD)
        assert len(response.json()["questions"]) == 4

    def test_empty_skills_still_accepted(self):
        """Request with no skills should still be accepted (role/company alone is valid)."""
        with patch("app.api.routes.interview_prep.generate_interview_questions_with_gemini") as mock:
            mock.return_value = ["What draws you to this role?"]
            response = client.post(
                "/api/v1/interview-prep/generate-questions",
                json={"known_skills": [], "missing_skills": [], "role": "Analyst", "company": "Acme"},
            )
        assert response.status_code == 200

    def test_gemini_failure_returns_502(self):
        with patch(
            "app.api.routes.interview_prep.generate_interview_questions_with_gemini",
            side_effect=Exception("Gemini error"),
        ):
            response = client.post("/api/v1/interview-prep/generate-questions", json=self.PAYLOAD)
        assert response.status_code == 502
