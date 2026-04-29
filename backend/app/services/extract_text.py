"""Extract plain text from uploaded job posting files (.txt, .pdf, .docx).

Legacy binary ``.doc`` (Word 97–2003) is not supported; users should save as .docx or PDF.
"""

import logging
from io import BytesIO

from fastapi import HTTPException, UploadFile

from pypdf import PdfReader
from docx import Document

logger = logging.getLogger(__name__)

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
    logger.info("[Extract] File received: name=%s, detected_ext=%s", name, ext)

    if ext not in ALLOWED_EXTENSIONS:
        logger.warning("[Extract] Rejected unsupported extension: %s", ext)
        raise HTTPException(
            status_code=422,
            detail="Unsupported file type. Use .txt, .pdf, .doc, or .docx.",
        )

    raw = await file.read()
    logger.info("[Extract] Read %d bytes from upload", len(raw))

    if not raw:
        logger.error("[Extract] File is empty")
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")

    warnings: list[str] = []

    if ext == ".txt":
        text = raw.decode("utf-8", errors="replace")
        logger.info("[Extract] TXT decoded, length=%d", len(text))
        return text, warnings

    if ext == ".pdf":
        logger.info("[Extract] Parsing PDF")
        reader = PdfReader(BytesIO(raw))
        page_count = len(reader.pages)
        logger.info("[Extract] PDF has %d pages", page_count)
        parts: list[str] = []
        for i, page in enumerate(reader.pages):
            t = page.extract_text() or ""
            if t.strip():
                parts.append(t)
            else:
                logger.debug("[Extract] PDF page %d returned no text", i)
        text = "\n\n".join(parts).strip()
        if not text:
            logger.warning("[Extract] PDF yielded no extractable text — adding warning")
            warnings.append("PDF text could not be read clearly; you may get better results by pasting the text.")
        else:
            logger.info("[Extract] PDF text extracted, length=%d from %d/%d pages", len(text), len(parts), page_count)
        return text, warnings

    if ext == ".docx":
        logger.info("[Extract] Parsing DOCX")
        doc = Document(BytesIO(raw))
        parts = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        text = "\n".join(parts).strip()
        logger.info("[Extract] DOCX extracted %d paragraphs, total length=%d", len(parts), len(text))
        return text, warnings

    # .doc - legacy binary format; avoid heavy native dependencies
    logger.warning("[Extract] Rejected legacy .doc file")
    raise HTTPException(
        status_code=422,
        detail=(
            "Legacy .doc files are not supported. Please save the posting as .docx or PDF, "
            "or paste the text instead."
        ),
    )
