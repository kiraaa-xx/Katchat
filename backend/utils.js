/**
 * KATCHAT BACKEND UTILITIES
 * Shared helpers to reduce duplication across route files
 */

/**
 * Multer fileFilter — only JPEG, PNG, GIF, WebP images allowed
 * Used in messages, users, and announcements routes
 */
const imageFileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    cb(Object.assign(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), { statusCode: 400 }));
    return;
  }
  cb(null, true);
};

/**
 * Standard error response for catch blocks
 * Returns `res.status(500).json({ error: err.message })` with optional statusCode from AppError
 */
const sendError = (res, err) => {
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message });
};

module.exports = { imageFileFilter, sendError };
