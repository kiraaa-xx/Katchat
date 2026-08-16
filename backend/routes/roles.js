const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { auth, ownerOnly } = require('../middleware/auth');
const { validateMaxLength } = require('../error-handler');
const { sendError } = require('../utils');

const NAME_RE = /^[a-z0-9_-]{1,50}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// font-awesome class strings: letters, digits, spaces, hyphens (e.g. "fa-solid fa-user")
const ICON_RE = /^fa[a-z0-9 -]{0,60}$/i;
const PERM_KEYS = [
  'canChat', 'canGlobalChat', 'canUseCommands', 'canBanUsers',
  'canDeleteMessages', 'canCreateAnnouncements', 'canCommentAnnouncements',
  'canAccessAdminPanel'
];

const cleanPermissions = (permissions) => {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return {};
  const out = {};
  for (const key of PERM_KEYS) {
    if (typeof permissions[key] === 'boolean') out[key] = permissions[key];
  }
  return out;
};

// Get all roles
router.get('/', auth, async (req, res) => {
  try {
    const { data } = await supabase.from('roles').select('*').order('created_at');
    res.json({ roles: data || [] });
  } catch (err) { sendError(res, err); }
});

// Create role (owner only)
router.post('/', auth, ownerOnly, async (req, res) => {
  try {
    const { name, color, icon, permissions } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Name and color required' });
    const lenErr = validateMaxLength({ name, color, icon }, { name: 50, color: 20, icon: 60 });
    if (lenErr) return res.status(400).json({ error: lenErr });
    const clean = name.toLowerCase().trim().replace(/\s+/g, '_');
    if (!NAME_RE.test(clean)) return res.status(400).json({ error: 'Role name: lowercase letters, numbers, underscores, hyphens only' });
    if (!COLOR_RE.test(color)) return res.status(400).json({ error: 'Role color must be a hex value (#rrggbb)' });
    const cleanIcon = icon || 'fa-solid fa-user';
    if (!ICON_RE.test(cleanIcon)) return res.status(400).json({ error: 'Invalid icon class' });
    const { data, error } = await supabase.from('roles').insert({ name: clean, color, icon: cleanIcon, permissions: cleanPermissions(permissions) }).select().single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Role already exists' });
      return sendError(res, error);
    }
    res.json({ role: data });
  } catch (err) { sendError(res, err); }
});

// Update role (owner only)
router.put('/:name', auth, ownerOnly, async (req, res) => {
  try {
    const { color, icon, permissions } = req.body;
    const { data: role } = await supabase.from('roles').select('is_system').eq('name', req.params.name).single();
    if (!role) return res.status(404).json({ error: 'Role not found' });
    const updates = {};
    if (color) {
      if (!COLOR_RE.test(color)) return res.status(400).json({ error: 'Role color must be a hex value (#rrggbb)' });
      updates.color = color;
    }
    if (icon) {
      if (!ICON_RE.test(icon)) return res.status(400).json({ error: 'Invalid icon class' });
      updates.icon = icon;
    }
    if (permissions) updates.permissions = cleanPermissions(permissions);
    const { data } = await supabase.from('roles').update(updates).eq('name', req.params.name).select().single();
    res.json({ role: data });
  } catch (err) { sendError(res, err); }
});

// Delete role (owner only, non-system)
router.delete('/:name', auth, ownerOnly, async (req, res) => {
  try {
    const { data: role } = await supabase.from('roles').select('is_system').eq('name', req.params.name).single();
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_system) return res.status(400).json({ error: 'Cannot delete system roles' });
    // Move users with this role to member
    await supabase.from('users').update({ role: 'member' }).eq('role', req.params.name);
    await supabase.from('roles').delete().eq('name', req.params.name);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

module.exports = router;