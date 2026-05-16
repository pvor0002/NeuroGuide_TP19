from app.services.gemini_interview_prep import heuristic_split_card_text, should_split_card_text


def test_should_split_long_multi_sentence_note():
    text = (
        "In my previous role, our team was responsible for processing weekly security "
        "vulnerability reports. The system was siloed: developers found bugs, security teams "
        "logged them in spreadsheets, and management received a PDF report three days late. "
        "Because the subsystems were not integrated, critical patches were being missed."
    )
    assert should_split_card_text(text)
    parts = heuristic_split_card_text(text)
    assert 2 <= len(parts) <= 4
    joined = " ".join(parts)
    assert "security" in joined.lower()
    assert "patches" in joined.lower()


def test_short_note_not_split():
    text = "I fixed a bug before launch."
    assert not should_split_card_text(text)
    assert heuristic_split_card_text(text) == [text]
