"""Extract plain text from uploaded job posting files (.txt, .pdf, .docx).

Legacy binary ``.doc`` (Word 97–2003) is not supported; users should save as .docx or PDF.
"""

from io import BytesIO

from fastapi import HTTPException, UploadFile

from pypdf import PdfReader
from docx import Document


ALLOWED_EXTENSIONS = frozenset({".txt", ".pdf", ".doc", ".docx"})


def _suffix(name: str) -> str:
    lower = name.lower()
    for ext in (".docx", ".pdf", ".txt", ".doc"):
        if lower.endswith(ext):
            return ext
    return ""


async def extract_text_from_upload(file: UploadFile) -> tuple[str, list[str]]:
    name = file.filename or "upload"
    ext = _suffix(name)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail="Unsupported file type. Use .txt, .pdf, .doc, or .docx.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")

    warnings: list[str] = []

    if ext == ".txt":
        text = raw.decode("utf-8", errors="replace")
        return text, warnings

    if ext == ".pdf":
        reader = PdfReader(BytesIO(raw))
        parts: list[str] = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                parts.append(t)
        text = "\n\n".join(parts).strip()
        if not text:
            warnings.append("PDF text could not be read clearly; you may get better results by pasting the text.")
        return text, warnings

    if ext == ".docx":
        doc = Document(BytesIO(raw))
        parts = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        text = "\n".join(parts).strip()
        return text, warnings

    # .doc - legacy binary format; avoid heavy native dependencies
    raise HTTPException(
        status_code=422,
        detail=(
            "Legacy .doc files are not supported. Please save the posting as .docx or PDF, "
            "or paste the text instead."
        ),
    )
