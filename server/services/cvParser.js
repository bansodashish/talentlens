/**
 * CV Parser Service
 * Extracts plain text from PDF, DOCX, DOC, and TXT files.
 * Used by the candidates route on CV upload, and the cv-match route.
 */
const path = require('path');
const fs = require('fs');

async function parseCV(filePath, originalName = '') {
  // Prefer extension from the original filename — multer stores temp files
  // without an extension, so path.extname(filePath) is often empty.
  const ext = (
    path.extname(originalName).toLowerCase() ||
    path.extname(filePath).toLowerCase()
  );

  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }

  if (ext === '.doc') {
    // Fallback: read as buffer and extract printable ASCII
    const buffer = fs.readFileSync(filePath);
    const text = buffer
      .toString('latin1')
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/ {3,}/g, ' ')
      .trim();
    return text;
  }

  if (['.txt', '.rtf', '.md'].includes(ext)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  // Last-resort: sniff PDF magic bytes regardless of extension.
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.slice(0, 4).toString() === '%PDF') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buf);
      return data.text || '';
    }
  } catch (_) { /* ignore */ }

  return '';
}

module.exports = { parseCV };
