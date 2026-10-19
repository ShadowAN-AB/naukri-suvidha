import { Router } from 'express';
import multer from 'multer';

import * as service from './service.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { AppError } from '../../middleware/error.js';
import { env } from '../../config/env.js';
import { ROLES } from '../../lib/constants.js';
import { ACCEPTED_EXTENSIONS, ACCEPTED_MIME_TYPES } from '../../lib/fileType.js';

/**
 * Files are held in memory, not written to disk by multer. The bytes have to
 * be sniffed before anything is stored, and 5 MB is small enough that keeping
 * it in memory costs less than writing a file we may reject.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 4 },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    // A cheap first pass so an obvious reject never reaches memory. The real
    // check is the magic-byte sniff in the service.
    if (!ACCEPTED_MIME_TYPES.includes(file.mimetype) && !ACCEPTED_EXTENSIONS.includes(ext)) {
      return cb(AppError.badRequest('Only PDF and DOCX files are accepted', { file: 'Upload a PDF or DOCX' }));
    }
    cb(null, true);
  },
});

/** Turns multer's own errors into the shape the rest of the API uses. */
function handleUpload(req, res, next) {
  upload.single('resume')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024);
      return next(AppError.tooLarge(`That file is larger than ${mb} MB`));
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(AppError.badRequest('Upload one file, in the "resume" field'));
    }
    next(err);
  });
}

const router = Router();
router.use(requireAuth);

router.post('/', requireRole(ROLES.STUDENT), handleUpload, async (req, res, next) => {
  try {
    res.status(201).json(await service.uploadResume(req.user, req.file, req.ip));
  } catch (err) {
    next(err);
  }
});

router.get('/', requireRole(ROLES.STUDENT), async (req, res, next) => {
  try {
    res.json(await service.listMyResumes(req.user));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/file', async (req, res, next) => {
  try {
    const { buffer, mimeType, originalName } = await service.getResumeFile(req.user, req.params.id);
    res.setHeader('Content-Type', mimeType);
    // inline, not attachment: a recruiter reading a shortlist wants it in the
    // browser rather than in their downloads folder.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/text', async (req, res, next) => {
  try {
    res.json(await service.getResumeText(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

export default router;
