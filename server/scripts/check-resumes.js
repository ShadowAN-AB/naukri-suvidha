/**
 * Runs every file in test/fixtures through the real extraction path and
 * reports what came out.
 *
 *   npm run resumes:check
 *
 * Phase 1 asks for 20 real resumes here, and Phase 4 asks what fails on them.
 * Generated test files all extract perfectly, which tells you nothing: real
 * resumes are two-column, exported from Canva, or scanned, and those are the
 * ones Phase 5 has to cope with. This script is how you find that out before
 * the AI layer is built on top of it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sniffFileType } from '../src/lib/fileType.js';
import { extractText } from '../src/modules/resumes/extract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../test/fixtures');

const argDir = process.argv[2];
const target = argDir ? path.resolve(process.cwd(), argDir) : dir;

async function main() {
  let names;
  try {
    names = (await fs.readdir(target)).filter((n) => /\.(pdf|docx)$/i.test(n)).sort();
  } catch {
    console.error(`No such directory: ${target}`);
    process.exit(1);
  }

  if (names.length === 0) {
    console.log(`No .pdf or .docx files in ${target}`);
    console.log('Drop real resumes there, then run this again.');
    return;
  }

  const rows = [];
  for (const name of names) {
    const buffer = await fs.readFile(path.join(target, name));
    const sniffed = sniffFileType(buffer);

    if (!sniffed) {
      rows.push({ name, kind: '-', kb: Math.round(buffer.length / 1024), chars: 0, status: 'REJECTED', detail: 'not a PDF or DOCX by its bytes' });
      continue;
    }

    const started = Date.now();
    const result = await extractText(buffer, sniffed.kind);
    const ms = Date.now() - started;

    rows.push({
      name,
      kind: sniffed.kind,
      kb: Math.round(buffer.length / 1024),
      chars: result.text.length,
      status: result.ok ? 'ok' : 'FAILED',
      detail: result.ok ? `${ms}ms` : result.error,
    });
  }

  const w = Math.min(40, Math.max(...rows.map((r) => r.name.length)));
  console.log('');
  console.log(`${'file'.padEnd(w)}  ${'type'.padEnd(5)} ${'size'.padStart(7)} ${'chars'.padStart(7)}  status`);
  console.log('-'.repeat(w + 36));
  for (const r of rows) {
    console.log(
      `${r.name.slice(0, w).padEnd(w)}  ${r.kind.padEnd(5)} ${(r.kb + ' kB').padStart(7)} ${String(r.chars).padStart(7)}  ${r.status}${r.status === 'ok' ? ` (${r.detail})` : ` - ${r.detail}`}`,
    );
  }

  const failed = rows.filter((r) => r.status !== 'ok');
  const thin = rows.filter((r) => r.status === 'ok' && r.chars < 400);
  console.log('');
  console.log(`${rows.length} files, ${rows.length - failed.length} extracted, ${failed.length} failed.`);
  if (thin.length) {
    console.log(`${thin.length} extracted under 400 characters - worth opening by hand to see what was lost.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
