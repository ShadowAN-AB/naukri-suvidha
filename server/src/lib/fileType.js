/**
 * Identifies an upload by its leading bytes.
 *
 * The filename extension and the Content-Type are both supplied by whoever is
 * uploading, so neither is evidence of anything. The first few bytes of the
 * file are the only part the sender cannot trivially lie about while still
 * producing a file the parser will accept.
 */

const SIGNATURES = [
  { kind: 'pdf', mime: 'application/pdf', ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  {
    kind: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: '.docx',
    magic: [0x50, 0x4b, 0x03, 0x04], // PK.. - every zip, so docx is confirmed below
  },
];

function startsWith(buffer, magic) {
  if (buffer.length < magic.length) return false;
  return magic.every((byte, i) => buffer[i] === byte);
}

/**
 * A .docx is a zip, and so is every .jar, .xlsx and .zip full of anything at
 * all. The word/ entry is what makes it a Word document, so look for it in the
 * first part of the archive rather than trusting the zip header alone.
 */
function looksLikeDocx(buffer) {
  const head = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('latin1');
  return head.includes('word/') || head.includes('[Content_Types].xml');
}

/** @returns {{ kind: 'pdf'|'docx', mime: string, ext: string } | null} */
export function sniffFileType(buffer) {
  for (const sig of SIGNATURES) {
    if (!startsWith(buffer, sig.magic)) continue;
    if (sig.kind === 'docx' && !looksLikeDocx(buffer)) return null;
    return { kind: sig.kind, mime: sig.mime, ext: sig.ext };
  }
  return null;
}

export const ACCEPTED_MIME_TYPES = SIGNATURES.map((s) => s.mime);
export const ACCEPTED_EXTENSIONS = SIGNATURES.map((s) => s.ext);
