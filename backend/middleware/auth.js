const jwt = require('jsonwebtoken');
const supabase = require('../supabase');

// Paths a user with pending forced password reset may still access
const RESET_ALLOWED_PATHS = [
  '/api/auth/change-password',
  '/api/auth/me',
  '/api/auth/mark-intro-seen'
];

// Paths an unverified account may still reach when email verification is enforced
const VERIFY_ALLOWED_PATHS = [
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/me'
];

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase
      .from('users').select('*').eq('id', decoded.userId).single();
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    if (user.must_change_password) {
      const fullPath = (req.baseUrl || '') + (req.path || '');
      if (!RESET_ALLOWED_PATHS.includes(fullPath)) {
        return res.status(403).json({ error: 'PASSWORD_RESET_REQUIRED', code: 'PASSWORD_RESET_REQUIRED' });
      }
    }
    if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && user.email_verified === false) {
      const fullPath = (req.baseUrl || '') + (req.path || '');
      if (!VERIFY_ALLOWED_PATHS.includes(fullPath)) {
        return res.status(403).json({ error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' });
      }
    }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

const adminOnly = async (req, res, next) => {
  try {
    const { data: role, error } = await supabase.from('roles').select('permissions').eq('name', req.user.role).single();
    if (error) {
      console.error('adminOnly role fetch error:', error.message);
      // Fallback: check if role is admin or owner
      if (['admin', 'owner'].includes(req.user.role)) return next();
      return res.status(403).json({ error: 'Admin access required' });
    }
    if (!role?.permissions?.canAccessAdminPanel) return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch (err) {
    console.error('adminOnly error:', err.message);
    // Fallback check
    if (['admin', 'owner'].includes(req.user.role)) return next();
    res.status(403).json({ error: 'Admin access required' });
  }
};

const ownerOnly = (req, res, next) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });
  next();
};

/**
 * Load a user's role name + permission set from the roles table.
 * Returns { roleName, permissions } or null when the user/role is missing.
 */
const getUserPermissions = async (userId) => {
  try {
    const { data: user, error: userErr } = await supabase.from('users').select('role').eq('id', userId).single();
    if (userErr || !user) return null;
    const { data: role, error: roleErr } = await supabase.from('roles').select('permissions').eq('name', user.role).single();
    if (roleErr || !role) return null;
    return { roleName: user.role, permissions: role.permissions || {} };
  } catch {
    return null;
  }
};

module.exports = { auth, adminOnly, ownerOnly, getUserPermissions };
