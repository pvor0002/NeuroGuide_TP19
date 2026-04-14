/**client-side validation module for the Job Description Simplifier feature.
 */

const MAX_WORDS = 5000;
const MIN_WORDS = 25;
const MIN_CHARS = 120;


//Standardizes text before counting words
//Converts all line endings to \n
//Removes extra whitespace at start/end
export function normalizeForCount(text) {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/*Counts number of words in input text*/
export function countWords(text) {
  const t = normalizeForCount(text);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

//This is the main entry point for validating user input.
//It checks if the text is empty, has too many words, or has too few words.
//It returns an object with the following properties:
//ok: boolean - true if the text is valid, false otherwise
//code: string - the code of the error if the text is not valid, null otherwise
//message: string - the message of the error if the text is not valid, null otherwise
export function validateJobDescription(text) {
  const normalized = normalizeForCount(text);
  if (!normalized) {
    return {
      ok: false,
      code: "EMPTY_INPUT",
      message: "Add a job description by pasting text or uploading a supported file.",
    };
  }

  //Counts the number of words in the standardized text.
  const words = countWords(normalized);
  if (words > MAX_WORDS) {
    return {
      ok: false,
      code: "WORD_LIMIT",
      message: `Job descriptions must be ${MAX_WORDS.toLocaleString()} words or fewer (about ${words.toLocaleString()} now).`,
    };
  }

  //Checks if the text has too few words or characters.
  //If the text has too few words or characters, it returns an object with the following properties:
  //ok: boolean - false
  //code: string - "INSUFFICIENT_CONTENT"
  //message: string - "There is not enough detail here yet."
  if (words < MIN_WORDS || normalized.length < MIN_CHARS) {
    return {
      ok: false,
      code: "INSUFFICIENT_CONTENT",
      message:
        "There is not enough detail here yet. ",
    };
  }

  return { ok: true, code: null, message: null };
}

const ALLOWED = new Set(["pdf", "doc", "docx", "txt"]);

//Checks if the file is supported.
//If the file is not supported, it returns an object with the following properties:
//ok: boolean - false
//message: string - "Unsupported file type. Supported formats: .pdf, .doc, .docx, .txt."
export function assertAllowedFile(file) {
  const name = file.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (!ALLOWED.has(ext)) {
    return {
      ok: false,
      message: "Unsupported file type. Supported formats: .pdf, .doc, .docx, .txt.",
    };
  }
  return { ok: true, message: null };
}


//Defines the maximum file size allowed for uploads.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;