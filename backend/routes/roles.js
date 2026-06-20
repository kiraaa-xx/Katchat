const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { auth, ownerOnly } = require('../middleware/auth');
const { validateMaxLength } = require('../error-handler');

// Get all roles
router.get('/', auth, async (req, res) => {
  try {
    const { data } = await supabase.from('roles').select('*').order('created_at');
    res.json({ roles: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create role (owner only)
router.post('/', auth, ownerOnly, async (req, res) => {
  try {
    const { name, color, icon, permissions } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Name and color required' });
    const lenErr = validateMaxLength({ name }, { name: 50 });
    if (lenErr) return res.status(400).json({ error: lenErr });
    const clean = name.toLowerCase().trim().replace(/\s+/g, '_');
    const { data, error } = await supabase.from('roles').insert({ name: clean, color, icon: icon || 'fa-solid fa-user', permissions: permissions || {} }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ role: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update role (owner only)
router.put('/:name', auth, ownerOnly, async (req, res) => {
  try {
    const { color, icon, permissions } = req.body;
    const { data: role } = await supabase.from('roles').select('is_system').eq('name', req.params.name).single();
    if (!role) return res.status(404).json({ error: 'Role not found' });
    const updates = {};
    if (color) updates.color = color;
    if (icon) updates.icon = icon;
    if (permissions) updates.permissions = permissions;
    const { data } = await supabase.from('roles').update(updates).eq('name', req.params.name).select().single();
    res.json({ role: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
