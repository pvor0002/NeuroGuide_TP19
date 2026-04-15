from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app

client = TestClient(app)

LONG_TXT = (
    "Software Engineer\n\n"
    + "We are hiring a software engineer to build web applications. "
    * 15
    + "\n\n"
    + "Requirements: Python, React, teamwork, communication. "
    * 10
)


def test_simplify_without_gemini_key_returns_503() -> None:
    def _no_gemini() -> Settings:
        return Settings(gemini_api_key=None)

    app.dependency_overrides[get_settings] = _no_gemini
    try:
        response = client.post(
            "/api/v1/job-description/simplify",
            json={"text": LONG_TXT},
        )
        assert response.status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_extract_txt_file() -> None:
    content = LONG_TXT.encode("utf-8")
    response = client.post(
        "/api/v1/job-description/extract",
        files={"file": ("posting.txt", content, "text/plain")},
    )

    assert response.status_code == 200
    body = response.json()
    assert "extracted_text" in body
    assert len(body["extracted_text"]) > 50
