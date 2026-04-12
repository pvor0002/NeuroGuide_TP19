import { useCallback, useMemo, useState } from "react";
import {
  assertAllowedFile,
  MAX_UPLOAD_BYTES,
  validateJobDescription,
} from "../utils/validation.js";

function attachmentMetaFromFile(file) {
  const name = file.name || "document";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const typeLabel =
    ext === "docx" ? "DOCX" : ext === "doc" ? "DOC" : ext === "pdf" ? "PDF" : ext === "txt" ? "TXT" : "FILE";
  return { name, ext, typeLabel };
}


/**
 * State and handlers for the job-description simplify flow: pasted or extracted text,
 * file upload extraction, client validation, API simplify call, and user feedback.
 * Prevents overlapping extract/simplify work via `isBusy`.
 *
 * @returns {object} Fields for the simplify page: text, setText, messages, flags, validation, handlers.
 */
export function useJobDescriptionSimplification() {
  const [text, setText] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [infoMessage, setInfoMessage] = useState("");
  /** Upload, extract, or client file errors: shown under the file preview when present. */
  const [composerFileError, setComposerFileError] = useState("");
  /** Validation or simplify API errors: shown under the textarea. */
  const [composerActionError, setComposerActionError] = useState("");
  /** Short success line inside the composer (e.g. after extract). */
  const [composerInfo, setComposerInfo] = useState("");
  /** Last successful `/simplify` payload (section keys from API or mock). */
  const [simplifiedResult, setSimplifiedResult] = useState(null);
  /** Chat-style attachment row after a file is chosen and passes basic checks. */
  const [attachment, setAttachment] = useState(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isSimplifying, setIsSimplifying] = useState(false);

  const validation = useMemo(() => validateJobDescription(text), [text]);
  const isBusy = isExtracting || isSimplifying;

  const clearComposerFeedback = useCallback(() => {
    setComposerFileError("");
    setComposerActionError("");
    setComposerInfo("");
  }, []);

  const clearMessages = useCallback(() => {
    setInfoMessage("");
    clearComposerFeedback();
  }, [clearComposerFeedback]);

  /**
   * Replaces the textarea value (paste or controlled updates) and clears stale feedback.
   * @param {string} next - Full job description text from the input.
   */
  const onTextChange = useCallback(
    (next) => {
      setText(next);
      setSimplifiedResult(null);
      setComposerFileError("");
      setComposerActionError("");
      setComposerInfo("");
      setWarnings([]);
      setInfoMessage("");
    },
    [],
  );

  const removeAttachment = useCallback(() => {
    setAttachment(null);
    setWarnings([]);
    setComposerFileError("");
    setComposerActionError("");
    setComposerInfo("");
  }, []);

  /**
   * Handles `<input type="file">` selection: validates type/size, calls extract API,
   * then fills `text` with extracted content and optional server `warnings`.
   * @param {FileList | null | undefined} fileList - Browser file list (first file is used).
   */
  const onFileSelected = useCallback(
    async (fileList) => {
      const file = fileList?.[0];
      if (!file) return;

      setInfoMessage("");
      setSimplifiedResult(null);
      clearComposerFeedback();
      setWarnings([]);

      if (file.size === 0) {
        setAttachment(null);
        setComposerActionError("");
        setComposerFileError("This file is empty. Choose a different file or paste the job text.");
        return;
      }

      const typeCheck = assertAllowedFile(file);
      if (!typeCheck.ok) {
        setAttachment(null);
        setComposerActionError("");
        setComposerFileError(typeCheck.message);
        return;
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        setAttachment(null);
        setComposerActionError("");
        setComposerFileError("That file is too large (max 5 MB). Try a smaller file or paste the text instead.");
        return;
      }

      setAttachment(attachmentMetaFromFile(file));
      setComposerFileError("");
      setComposerActionError("");
      setIsExtracting(true);
      try {
        const payload = await extractUploadedJobDescription(file);
        const raw = String(payload.extracted_text ?? "").trim();
        const nextWarnings = payload.warnings ?? [];

        if (raw) {
          setText(raw);
          setWarnings(nextWarnings);
          setComposerFileError("");
          setComposerInfo("Text loaded from this file. You can edit it, then send.");
        } else {
          setWarnings([]);
          setComposerFileError("");
        }
      } catch (err) {
        setComposerFileError(err.message || "Upload could not be processed.");
      } finally {
        setIsExtracting(false);
      }
    },
    [clearComposerFeedback],
  );

  /**
   * Validates `text` on the client, then calls the simplify API when `VITE_USE_LIVE_JOB_API=true`.
   * With the flag off, the handler returns after validation (no request, no error).
   * Sets `infoMessage` on success or composer inline error on API failure.
   */
  const onSimplify = useCallback(async () => {
    if (isBusy) return;

    const v = validateJobDescription(text);
    if (!v.ok) {
      setComposerActionError(v.message);
      return;
    }

    if (!liveSimplifyEnabled) {
      setComposerActionError("");
      return;
    }

    setIsSimplifying(true);
    setComposerActionError("");
    setComposerFileError("");
    setComposerInfo("");
    setInfoMessage("");
    try {
      const data = await simplifyJobDescription(text);
      setSimplifiedResult(data && typeof data === "object" ? data : null);
      setInfoMessage("Simplified version is below.");
    } catch (err) {
      setComposerActionError(err.message || "Simplification failed. You can edit the text and try again.");
    } finally {
      setIsSimplifying(false);
    }
  }, [isBusy, text]);

  return {
    text,
    setText: onTextChange,
    simplifiedResult,
    attachment,
    removeAttachment,
    composerFileError,
    composerActionError,
    composerInfo,
    warnings,
    infoMessage,
    isBusy,
    isExtracting,
    isSimplifying,
    validation,
    onFileSelected,
    onSimplify,
  };
}
