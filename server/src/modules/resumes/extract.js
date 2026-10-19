import { logger } from '../../config/logger.js';

/**
 * Pulls plain text out of an uploaded resume.
 *
 * This is ordinary text extraction, not the AI layer: it reads what is already
 * in the file. Phase 5 takes this text and asks a model to turn it into a
 * structured profile.
 */

/** Collapses the ragged whitespace both extractors produce. */
function tidy(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fromPdf(buffer) {
  // pdf-parse 2.x is a class, not the pdfParse(buffer) function that 1.x
  // exported and that most examples still show.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text ?? '', pages: result.total ?? null };
  } finally {
    await parser.destroy();
  }
}

async function fromDocx(buffer) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value ?? '', pages: null };
}

/**
 * @returns {Promise<{ ok: boolean, text: string, pages: number|null, error?: string }>}
 * Never throws: a resume that cannot be read is a record to flag, not a
 * failed upload. The file is already stored and the student can still apply.
 */
export async function extractText(buffer, kind) {
  try {
    const { text, pages } = kind === 'pdf' ? await fromPdf(buffer) : await fromDocx(buffer);
    const tidied = tidy(text);

    if (tidied.length < 50) {
      // Almost certainly a scan or an image-only export. Phase 5 would have
      // nothing to work with, so say so now rather than silently storing "".
      return {
        ok: false,
        text: tidied,
        pages,
        error: 'No readable text found. The file may be a scan or an image.',
      };
    }
    return { ok: true, text: tidied, pages };
  } catch (err) {
    logger.error({ err, kind }, 'resume text extraction failed');
    return { ok: false, text: '', pages: null, error: `Could not read the ${kind.toUpperCase()}` };
  }
}
