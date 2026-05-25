/**
 * parsers.ts — Extract plain text from uploaded resume files.
 *
 * Supports: PDF (pdf-parse), DOCX (mammoth), HTML, RTF, plain text.
 * Uses dynamic imports so modules load only when the file type is encountered.
 */

export interface ResumeFile {
  filename: string;
  content: Buffer;
  contentType: string;
}

export async function extractResumeText(file: ResumeFile): Promise<string> {
  const name = file.filename.toLowerCase();
  try {
    if (name.endsWith(".pdf") || file.contentType === "application/pdf") {
      // Dynamic import avoids pdf-parse startup test-file issues
      const { default: pdfParse } = await import("pdf-parse");
      const data = await pdfParse(file.content);
      return data.text.trim();
    }

    if (name.endsWith(".docx") || file.contentType.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: file.content });
      return result.value.trim();
    }

    if (name.endsWith(".html") || name.endsWith(".htm") || file.contentType.includes("html")) {
      return stripHtml(file.content.toString("utf-8"));
    }

    if (name.endsWith(".rtf") || file.contentType.includes("rtf")) {
      return stripRtf(file.content.toString("utf-8"));
    }

    if (name.endsWith(".txt") || file.contentType.startsWith("text/")) {
      return file.content.toString("utf-8").trim();
    }
  } catch {
    // Parsing failure — return empty string; caller decides how to handle
    return "";
  }

  return "";
}

function stripHtml(text: string): string {
  // Remove script/style blocks, then all tags, then decode entities
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&[a-z#0-9]+;/gi, " ");
  return text.replace(/\s+/g, " ").trim();
}

function stripRtf(text: string): string {
  text = text.replace(/\\'[0-9a-fA-F]{2}/g, " ");
  text = text.replace(/\\[a-zA-Z]+-?\d* ?/g, " ");
  return text.replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();
}
