require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

// ── Error Handler ─────────────────────────────────────────────
const {
  errorHandler,
  notFound,
  requestLogger,
  checkRateLimit,
  errorLogger,
} = require('./error-handler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*', methods: ['GET','POST'] } });

// ── Middleware Setup ──────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com; connect-src 'self' ws:; media-src 'self'");
  next();
});
app.use(requestLogger);
app.use(checkRateLimit);
app.set('io', io); // For socket access from route handlers
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ── Health check endpoint ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error logs endpoint (admin only) ──────────────────────────
app.get('/api/logs', (req, res) => {
  const token = req.get('Authorization')?.split(' ')[1];
  if (!token || token !== process.env.ADMIN_LOG_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  res.json(errorLogger.getErrors());
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/help', require('./routes/help'));
app.use('/api/owner-messages', require('./routes/owner-messages'));

// ── Serve frontend ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ── Socket ────────────────────────────────────────────────────
require('./socket')(io);

// ── 404 handler ───────────────────────────────────────────────
app.use(notFound);

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

// ── Test Supabase connection ──────────────────────────────────
const supabase = require('./supabase');
supabase.from('users').select('id', { count: 'exact', head: true })
  .then(({ error }) => {
    if (error) console.error('❌ Supabase error:', error.message);
    else console.log('✅ Supabase connected');
  })
  .catch(err => {
    console.error('❌ Supabase connection error:', err.message);
  });

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 KatChat running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('📋 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📋 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io, errorLogger };

