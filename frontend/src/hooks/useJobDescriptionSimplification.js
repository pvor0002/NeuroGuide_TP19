/**
 * This file manages all the logic and state for the job simplifier page 
 *  input, file upload, validation, API calls, and results.
 *
 * This module expects these to exist wherever you wire the API (import them or
 * attach to `globalThis` before the app runs):
 * - `extractUploadedJobDescription(file)` — resolves with `extracted_text` and optional `warnings[]`
 * - `simplifyJobDescription(text)` - resolves with section fields the simplify page renders
 * - `liveSimplifyEnabled` — boolean; when false, simplify does nothing beyond clearing errors
 *
 * @file
 */

import { useCallback, useMemo, useState } from "react";
import {
  assertAllowedFile,
  MAX_UPLOAD_BYTES,
  validateJobDescription,
} from "../utils/validation.js";

/** Builds `{ name, ext, typeLabel }` for showing the chosen file in the composer. */
function attachmentMetaFromFile(file) {
  const name = file.name || "document";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const typeLabel =
    ext === "docx" ? "DOCX" : ext === "doc" ? "DOC" : ext === "pdf" ? "PDF" : ext === "txt" ? "TXT" : "FILE";
  return { name, ext, typeLabel };
}

/**
 * Hook that owns all simplify-page UI state (text, attachment, loading, errors, result).
 * @returns {object} Public API for `SimplifyJobDescriptionPage`: text/setText, file handlers,
 *   validation snapshot, busy flags, messages, and `onSimplify`.
 */
export function useJobDescriptionSimplification() {
  const [text, setText] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [infoMessage, setInfoMessage] = useState("");
  const [composerFileError, setComposerFileError] = useState("");
  const [composerActionError, setComposerActionError] = useState("");
  const [composerInfo, setComposerInfo] = useState("");
  const [simplifiedResult, setSimplifiedResult] = useState(null);
  const [attachment, setAttachment] = useState(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isSimplifying, setIsSimplifying] = useState(false);

  const validation = useMemo(() => validateJobDescription(text), [text]);
  const isBusy = isExtracting || isSimplifying;

  /** Clears inline composer errors and the small success line. */
  const clearComposerFeedback = useCallback(() => {
    setComposerFileError("");
    setComposerActionError("");
    setComposerInfo("");
  }, []);

  /** Updates the job text and resets result, errors, and warnings so the UI stays consistent. */
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

  /** Drops the attached file metadata and related composer messages. */
  const removeAttachment = useCallback(() => {
    setAttachment(null);
    setWarnings([]);
    setComposerFileError("");
    setComposerActionError("");
    setComposerInfo("");
  }, []);


  /**
   * Handles `<input type="file">` selection: validates type/size, then asks the server
   * to extract text into the textarea (or sets an error message).
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
      //It takes the uploaded file, extracts text from it, and puts that text into your app — or shows an error if something goes wrong.
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
          setComposerFileError("No text could be read from this file. Try another file or paste the posting.");
        }
      } catch (err) {
        setComposerFileError(err.message || "Upload could not be processed.");
      } finally {
        setIsExtracting(false);
      }
    },
    [clearComposerFeedback],
  );

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
  };
}
