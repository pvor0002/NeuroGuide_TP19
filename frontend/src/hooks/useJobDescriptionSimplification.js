import { useCallback, useMemo, useState } from "react";
import { assertAllowedFile, MAX_UPLOAD_BYTES, validateJobDescription } from "../utils/validation.js";
import {
  extractUploadedJobDescription,
  liveSimplifyEnabled,
  simplifyJobDescription
} from "../services/jobDescriptionApi.js";

const RESULT_STORAGE_KEY  = "neuroguide.simplifiedResult.v1";
const INPUT_STORAGE_KEY   = "neuroguide.jobInput.v1";

function readStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    if (value == null || value === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // localStorage unavailable (e.g. private browsing restrictions) — silently skip
  }
}

function attachmentMetaFromFile(file) {
  const name = file.name || "document";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const typeLabel =
    ext === "docx" ? "DOCX" : ext === "doc" ? "DOC" : ext === "pdf" ? "PDF" : ext === "txt" ? "TXT" : "FILE";
  return { name, ext, typeLabel };
}

export function useJobDescriptionSimplification() {
  // ── Persisted state (survives navigation and tab close/reopen) ───────────
  const [inputMode, setInputModeRaw] = useState(
    () => readStorage(INPUT_STORAGE_KEY + ".mode") ?? "text"
  );
  const [text, setTextRaw] = useState(
    () => readStorage(INPUT_STORAGE_KEY + ".text") ?? ""
  );
  const [fileExtractedText, setFileExtractedTextRaw] = useState(
    () => readStorage(INPUT_STORAGE_KEY + ".fileText") ?? ""
  );

  const setInputModeStored = useCallback((mode) => {
    setInputModeRaw(mode);
    writeStorage(INPUT_STORAGE_KEY + ".mode", mode);
  }, []);

  const setTextStored = useCallback((value) => {
    setTextRaw(value);
    writeStorage(INPUT_STORAGE_KEY + ".text", value);
  }, []);

  const setFileExtractedTextStored = useCallback((value) => {
    setFileExtractedTextRaw(value);
    writeStorage(INPUT_STORAGE_KEY + ".fileText", value);
  }, []);

  const [simplifiedResult, setSimplifiedResultRaw] = useState(
    () => readStorage(RESULT_STORAGE_KEY)
  );

  const setSimplifiedResult = useCallback((value) => {
    setSimplifiedResultRaw(value);
    writeStorage(RESULT_STORAGE_KEY, value);
  }, []);

  // ── Ephemeral state (UI feedback, not worth persisting) ──────────────────
  const [warnings, setWarnings] = useState([]);
  const [infoMessage, setInfoMessage] = useState("");
  const [composerFileError, setComposerFileError] = useState("");
  const [composerActionError, setComposerActionError] = useState("");
  const [composerInfo, setComposerInfo] = useState("");
  const [attachment, setAttachment] = useState(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isSimplifying, setIsSimplifying] = useState(false);

  const validation = useMemo(() => {
    const source = inputMode === "text" ? text : fileExtractedText;
    return validateJobDescription(source);
  }, [inputMode, text, fileExtractedText]);

  const isBusy = isExtracting || isSimplifying;

  const clearComposerFeedback = useCallback(() => {
    setComposerFileError("");
    setComposerActionError("");
    setComposerInfo("");
  }, []);

  const changeInputMode = useCallback((mode) => {
    if (mode !== "text" && mode !== "file") return;
    setInputModeStored(mode);
    setSimplifiedResult(null);
    setInfoMessage("");
    clearComposerFeedback();
    if (mode === "text") {
      setAttachment(null);
      setFileExtractedTextStored("");
      setWarnings([]);
    } else {
      setTextStored("");
      setWarnings([]);
    }
  }, [clearComposerFeedback, setInputModeStored, setTextStored, setFileExtractedTextStored, setSimplifiedResult]);

  const onTextChange = useCallback(
    (next) => {
      setTextStored(next);
      setSimplifiedResult(null);
      setComposerFileError("");
      setComposerActionError("");
      setComposerInfo("");
      setWarnings([]);
      setInfoMessage("");
    },
    [setTextStored, setSimplifiedResult]
  );

  const removeAttachment = useCallback(() => {
    setAttachment(null);
    setFileExtractedTextStored("");
    setWarnings([]);
    setComposerFileError("");
    setComposerActionError("");
    setComposerInfo("");
  }, [setFileExtractedTextStored]);

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
        setFileExtractedTextStored("");
        setComposerActionError("");
        setComposerFileError("This file is empty. Choose a different file or switch to paste text.");
        return;
      }

      const typeCheck = assertAllowedFile(file);
      if (!typeCheck.ok) {
        setAttachment(null);
        setFileExtractedTextStored("");
        setComposerActionError("");
        setComposerFileError(typeCheck.message);
        return;
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        setAttachment(null);
        setFileExtractedTextStored("");
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
          setFileExtractedTextStored(raw);
          setWarnings(nextWarnings);
          setComposerFileError("");
          setComposerInfo("Text loaded from this file. Submit to get a simplified version.");
        } else {
          setAttachment(null);
          setFileExtractedTextStored("");
          setWarnings([]);
          setComposerFileError("No text could be read from this file. Try another file or paste the posting.");
        }
      } catch (err) {
        setAttachment(null);
        setFileExtractedTextStored("");
        setComposerFileError(err.message || "Upload could not be processed.");
      } finally {
        setIsExtracting(false);
      }
    },
    [clearComposerFeedback, setFileExtractedTextStored, setSimplifiedResult]
  );

  const onSimplify = useCallback(async () => {
    if (isBusy) return;

    const payloadText = inputMode === "text" ? text : fileExtractedText;
    const v = validateJobDescription(payloadText);
    if (!v.ok) {
      setComposerActionError(v.message);
      return;
    }

    if (inputMode === "file" && (!attachment || !String(fileExtractedText).trim())) {
      setComposerActionError("Upload a supported file first, or switch to paste text.");
      return;
    }

    if (!liveSimplifyEnabled) {
      setComposerActionError("Simplify API is disabled. Remove VITE_SIMPLIFY_API=0 or configure the backend.");
      return;
    }

    setIsSimplifying(true);
    setComposerActionError("");
    setComposerFileError("");
    setComposerInfo("");
    setInfoMessage("");
    try {
      const data = await simplifyJobDescription(String(payloadText).trim());
      const stamped =
        data && typeof data === "object"
          ? { ...data, _ng_simp_ver: Date.now() }
          : null;
      setSimplifiedResult(stamped);
      setInfoMessage("Simplified version is below.");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "";
      setComposerActionError(
        msg || "Simplification failed. Check that the backend is running and GEMINI_API_KEY is set in backend/.env.",
      );
    } finally {
      setIsSimplifying(false);
    }
  }, [isBusy, inputMode, text, fileExtractedText, attachment, setSimplifiedResult]);

  const simplifyEnabled =
    validation.ok &&
    !isBusy &&
    (inputMode === "text" ? true : Boolean(attachment && String(fileExtractedText).trim()));

  return {
    inputMode,
    setInputMode: changeInputMode,
    text,
    setText: onTextChange,
    fileExtractedText,
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
    simplifyEnabled
  };
}
