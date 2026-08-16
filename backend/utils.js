/**
 * KATCHAT BACKEND UTILITIES
 * Shared helpers to reduce duplication across route files
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Allowed image types: mimetype -> canonical extension
 * The stored extension is ALWAYS derived from the mimetype (never from
 * the attacker-controlled original filename).
 */
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

const IMAGE_MIMETYPES = Object.keys(MIME_EXT);

/**
 * Multer fileFilter — only JPEG, PNG, GIF, WebP images allowed
 * Used in messages, users, and announcements routes
 */
const imageFileFilter = (req, file, cb) => {
  if (!IMAGE_MIMETYPES.includes(file.mimetype)) {
    cb(Object.assign(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), { statusCode: 400 }));
    return;
  }
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (ext && !Object.values(MIME_EXT).includes(ext)) {
    cb(Object.assign(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), { statusCode: 400 }));
    return;
  }
  cb(null, true);
};

/**
 * Unpredictable upload filename (16 random bytes hex + extension from mimetype)
 */
const makeUploadFilename = (mimetype) =>
  `${crypto.randomBytes(16).toString('hex')}.${MIME_EXT[mimetype] || 'img'}`;

/**
 * Magic-byte validation of an uploaded file on disk.
 * Deletes the file and returns an error object if the signature does not
 * match the extension derived from the declared mimetype.
 * Returns null when the file is a genuine image.
 */
const validateUploadedImage = (filePath) => {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    if (bytesRead < 4) {
      return Object.assign(new Error('Uploaded file is not a valid image'), { statusCode: 400 });
    }
    const sig = buf.subarray(0, 12);
    const isJpeg = sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
    const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47 &&
      sig[4] === 0x0d && sig[5] === 0x0a && sig[6] === 0x1a && sig[7] === 0x0a;
    const gifText = sig.subarray(0, 6).toString('ascii');
    const isGif = gifText === 'GIF87a' || gifText === 'GIF89a';
    const isWebp = sig.subarray(0, 4).toString('ascii') === 'RIFF' && sig.subarray(8, 12).toString('ascii') === 'WEBP';

    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return Object.assign(new Error('Uploaded file is not a valid image'), { statusCode: 400 });
    }
    return null;
  } catch (err) {
    return Object.assign(new Error('Could not validate uploaded image'), { statusCode: 400 });
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
};

/**
 * Remove an uploaded file (used to clean up rejected uploads / orphaned files)
 */
const removeUploadedFile = (filePath) => {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch { /* already gone */ }
};

/**
 * Standard error response for catch blocks
 * Returns generic message for 5xx (never leaks internals), real message for 4xx
 */
const sendError = (res, err) => {
  const status = err.statusCode || 500;
  if (status >= 500) {
    console.error('Unhandled error:', err && err.stack ? err.stack : err);
    return res.status(status).json({ error: 'Server error' });
  }
  res.status(status).json({ error: err.message || 'Request failed' });
};

const sanitizeText = (str, maxLen = 5000) => {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, maxLen);
};

module.exports = {
  imageFileFilter,
  makeUploadFilename,
  validateUploadedImage,
  removeUploadedFile,
  sendError,
  sanitizeText,
  MIME_EXT
};
