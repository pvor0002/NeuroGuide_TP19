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

  const clearComposerFeedback = useCallback(() => {
    setComposerFileError("");
    setComposerActionError("");
    setComposerInfo("");
  }, []);

  const clearMessages = useCallback(() => {
    setInfoMessage("");
    clearComposerFeedback();
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
    [clearComposerFeedback]
  );

  const onSimplify = useCallback(async () => {
    if (isBusy) return;

    const v = validateJobDescription(text);
    if (!v.ok) {
      setComposerActionError(v.message);
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
    onSimplify
  };
}
