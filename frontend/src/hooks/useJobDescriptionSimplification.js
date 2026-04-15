import { useCallback, useMemo, useState } from "react";
import { assertAllowedFile, MAX_UPLOAD_BYTES, validateJobDescription } from "../utils/validation.js";
import {
  extractUploadedJobDescription,
  liveSimplifyEnabled,
  simplifyJobDescription
} from "../services/jobDescriptionApi.js";

function attachmentMetaFromFile(file) {
  const name = file.name || "document";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const typeLabel =
    ext === "docx" ? "DOCX" : ext === "doc" ? "DOC" : ext === "pdf" ? "PDF" : ext === "txt" ? "TXT" : "FILE";
  return { name, ext, typeLabel };
}

export function useJobDescriptionSimplification() {
  const [inputMode, setInputMode] = useState("text");
  const [text, setText] = useState("");
  const [fileExtractedText, setFileExtractedText] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [infoMessage, setInfoMessage] = useState("");
  const [composerFileError, setComposerFileError] = useState("");
  const [composerActionError, setComposerActionError] = useState("");
  const [composerInfo, setComposerInfo] = useState("");
  const [simplifiedResult, setSimplifiedResult] = useState(null);
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
    setInputMode(mode);
    setSimplifiedResult(null);
    setInfoMessage("");
    clearComposerFeedback();
    if (mode === "text") {
      setAttachment(null);
      setFileExtractedText("");
      setWarnings([]);
    } else {
      setText("");
      setWarnings([]);
    }
  }, [clearComposerFeedback]);

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
    []
  );

  const removeAttachment = useCallback(() => {
    setAttachment(null);
    setFileExtractedText("");
    setWarnings([]);
    setComposerFileError("");
    setComposerActionError("");
    setComposerInfo("");
  }, []);

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
        setFileExtractedText("");
        setComposerActionError("");
        setComposerFileError("This file is empty. Choose a different file or switch to paste text.");
        return;
      }

      const typeCheck = assertAllowedFile(file);
      if (!typeCheck.ok) {
        setAttachment(null);
        setFileExtractedText("");
        setComposerActionError("");
        setComposerFileError(typeCheck.message);
        return;
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        setAttachment(null);
        setFileExtractedText("");
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
          setFileExtractedText(raw);
          setWarnings(nextWarnings);
          setComposerFileError("");
          setComposerInfo("Text loaded from this file. Submit to get a simplified version.");
        } else {
          setAttachment(null);
          setFileExtractedText("");
          setWarnings([]);
          setComposerFileError("No text could be read from this file. Try another file or paste the posting.");
        }
      } catch (err) {
        setAttachment(null);
        setFileExtractedText("");
        setComposerFileError(err.message || "Upload could not be processed.");
      } finally {
        setIsExtracting(false);
      }
    },
    [clearComposerFeedback]
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
      setSimplifiedResult(data && typeof data === "object" ? data : null);
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
  }, [isBusy, inputMode, text, fileExtractedText, attachment]);

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
