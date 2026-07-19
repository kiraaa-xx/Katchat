/**
 * KATCHAT BACKEND ERROR HANDLER
 * Centralized error handling, logging, and responses
 * Use this middleware in server.js
 */

const fs = require('fs');
const path = require('path');

// ===== ERROR LOGGER =====

class ErrorLogger {
  constructor(logsDir = './logs') {
    this.logsDir = logsDir;
    this.initLogsDir();
    this.errors = [];
    this.maxErrors = 200;
  }

  initLogsDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  log(error, context = 'generic', req = null) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      context,
      message: error.message,
      stack: error.stack,
      url: req?.url || null,
      method: req?.method || null,
      userAgent: req?.get('user-agent') || null,
      userId: req?.user?.id || null,
      code: error.code || null,
    };

    // Keep in-memory log
    this.errors.push(entry);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[${context}] ${error.message}`, { url: entry.url, userId: entry.userId });
    }

    // Log to file
    const logFile = path.join(this.logsDir, `errors-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', { encoding: 'utf8' });
  }

  getErrors() {
    return this.errors;
  }

  exportErrors() {
    return JSON.stringify(this.errors, null, 2);
  }
}

// ===== INITIALIZE LOGGER =====
const errorLogger = new ErrorLogger();

// ===== CUSTOM ERROR CLASS =====
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

// ===== ERROR HANDLING MIDDLEWARE =====

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Handle Multer errors (file size limits etc.)
  if (err.name === 'MulterError') {
    const messages = { LIMIT_FILE_SIZE: 'File too large', LIMIT_FILE_COUNT: 'Too many files', LIMIT_UNEXPECTED_FILE: 'Unexpected file field' };
    return res.status(400).json({ success: false, error: { message: messages[err.code] || err.message, code: 'UPLOAD_ERROR', statusCode: 400, timestamp: new Date().toISOString() } });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'INTERNAL_ERROR';

  // Log the error
  errorLogger.log(err, code, req);

  // Don't expose stack traces in production
  const stack = process.env.NODE_ENV === 'production' ? undefined : err.stack;

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      statusCode,
      timestamp: err.timestamp || new Date().toISOString(),
      ...(stack && { stack }),
    },
  });
};

/**
 * 404 handler
 */
const notFound = (req, res) => {
  errorLogger.log(
    new Error(`Route not found: ${req.method} ${req.url}`),
    'NOT_FOUND',
    req
  );

  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      code: 'NOT_FOUND',
      statusCode: 404,
      method: req.method,
      url: req.url,
    },
  });
};

// ===== VALIDATION HELPERS =====

/**
 * Validate required fields
 */
const validateRequired = (obj, fields, context = 'validation') => {
  const missing = fields.filter(f => !obj[f]);
  if (missing.length) {
    throw new AppError(
      `Missing required fields: ${missing.join(', ')}`,
      400,
      'VALIDATION_ERROR'
    );
  }
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) {
    throw new AppError('Invalid email format', 400, 'INVALID_EMAIL');
  }
};

/**
 * Validate password strength
 */
const validatePassword = (password) => {
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, 'WEAK_PASSWORD');
  }
};

/**
 * Validate username format
 */
const validateUsername = (username) => {
  const re = /^[a-z0-9_]{3,20}$/;
  if (!re.test(username)) {
    throw new AppError(
      'Username must be 3-20 lowercase letters, numbers, or underscores',
      400,
      'INVALID_USERNAME'
    );
  }
};

/**
 * Validate max length for text fields — returns error string or null
 */
const validateMaxLength = (obj, fields) => {
  const defaults = { displayName: 50, username: 20, email: 254, password: 128, gender: 20, theme: 20, content: 5000, title: 200, role: 50, bio: 200 };
  for (const [key, maxLen] of Object.entries(fields)) {
    const limit = defaults[key] || maxLen;
    if (obj[key] && obj[key].length > limit) {
      return `${key} exceeds maximum length of ${limit} characters`;
    }
  }
  return null;
};

// ===== SAFE OPERATIONS =====

/**
 * Safe Supabase query with error handling
 */
const safeSupabaseQuery = async (query, context = 'supabaseQuery') => {
  try {
    const { data, error } = await query;
    if (error) {
      const appError = new AppError(
        error.message || 'Database error',
        error.code === 'PGRST116' ? 404 : 500,
        `DB_${error.code || 'ERROR'}`
      );
      errorLogger.log(appError, context);
      throw appError;
    }
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    errorLogger.log(err, context);
    throw new AppError('Database operation failed', 500, 'DB_ERROR');
  }
};

/**
 * Safe auth token verification
 */
const safeVerifyToken = (token, context = 'verifyToken') => {
  try {
    if (!token) {
      throw new AppError('Token required', 401, 'NO_TOKEN');
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      errorLogger.log(err, context);
      throw new AppError('Token expired', 401, 'TOKEN_EXPIRED');
    }
    if (err.name === 'JsonWebTokenError') {
      errorLogger.log(err, context);
      throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
    }
    if (err instanceof AppError) throw err;
    errorLogger.log(err, context);
    throw new AppError('Authentication failed', 401, 'AUTH_FAILED');
  }
};

// ===== RATE LIMITING HELPERS =====

/**
 * Simple in-memory rate limiter
 */
class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const timestamps = this.requests.get(key);
    const recentRequests = timestamps.filter(t => now - t < this.windowMs);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }
}

const rateLimiter = new RateLimiter(60000, 300); // 300 requests per minute

const RATE_LIMITED_PREFIXES = ['/api/', '/health'];

const checkRateLimit = (req, res, next) => {
  if (!RATE_LIMITED_PREFIXES.some(p => req.url.startsWith(p))) {
    return next();
  }

  const key = req.ip;
  if (!rateLimiter.isAllowed(key)) {
    errorLogger.log(
      new Error(`Rate limit exceeded for IP: ${key}`),
      'RATE_LIMIT',
      req
    );
    return res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
        statusCode: 429,
      },
    });
  }
  next();
};

// ===== LOGGING MIDDLEWARE =====

const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'WARN' : 'INFO';
    
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[${level}] ${req.method} ${req.url} → ${res.statusCode} (${duration}ms)`
      );
    }
  });

  next();
};

// ===== EXPORTS =====

module.exports = {
  errorLogger,
  errorHandler,
  notFound,
  validateMaxLength,
  checkRateLimit,
  requestLogger,
};
