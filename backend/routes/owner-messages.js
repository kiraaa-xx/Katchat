const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { auth, adminOnly } = require('../middleware/auth');

router.get('/status', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('owner_messages')
      .select('created_at')
      .eq('sender_id', req.user.id)
      .gte('created_at', today)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return res.status(500).json({ error: 'Server error' });

    if (data && data.length > 0) {
      const lastMsg = data[0];
      const nextAllowed = new Date(lastMsg.created_at);
      nextAllowed.setDate(nextAllowed.getDate() + 1);
      nextAllowed.setHours(0, 0, 0, 0);
      res.json({ canSend: false, nextAllowedAt: nextAllowed.toISOString() });
    } else {
      res.json({ canSend: true, nextAllowedAt: null });
    }
  } catch (err) {
    console.error('GET /api/owner-messages/status error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim())
      return res.status(400).json({ error: 'Message content is required' });
    if (content.length > 2000)
      return res.status(400).json({ error: 'Message too long (max 2000 chars)' });

    const today = new Date().toISOString().split('T')[0];
    const { count, error: countErr } = await supabase
      .from('owner_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', req.user.id)
      .gte('created_at', today);
    if (countErr) return res.status(500).json({ error: 'Server error' });
    if (count >= 1)
      return res.status(429).json({ error: 'You can only send one message per day' });

    const { data, error } = await supabase
      .from('owner_messages')
      .insert({ sender_id: req.user.id, content: content.trim() })
      .select()
      .single();
    if (error) {
      console.error('POST /api/owner-messages insert error:', error);
      return res.status(500).json({ error: 'Failed to send message. Please ensure the owner_messages table exists in Supabase.' });
    }

    res.json({ message: 'Message sent successfully', data });
  } catch (err) {
    console.error('POST /api/owner-messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('owner_messages')
      .select('*, sender:users!owner_messages_sender_id_fkey(id,display_name,username,email,profile_picture,profile_color,role)')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to fetch messages' });

    const unreadCount = (data || []).filter(m => !m.read).length;
    res.json({ messages: data || [], unreadCount });
  } catch (err) {
    console.error('GET /api/owner-messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/read', auth, adminOnly, async (req, res) => {
  try {
    const { error } = await supabase
      .from('owner_messages')
      .update({ read: true })
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Failed to mark as read' });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('PUT /api/owner-messages/read error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/my-messages', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('owner_messages')
      .select('id, content, reply, replied_at, reply_read, created_at')
      .eq('sender_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) return res.status(500).json({ error: 'Server error' });
    res.json({ messages: data || [] });
  } catch (err) {
    console.error('GET /api/owner-messages/my-messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/read-replies', auth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('owner_messages')
      .update({ reply_read: true })
      .eq('sender_id', req.user.id)
      .eq('reply_read', false)
      .not('reply', 'is', null);
    if (error) return res.status(500).json({ error: 'Server error' });
    res.json({ message: 'Replies marked as read' });
  } catch (err) {
    console.error('PUT /api/owner-messages/read-replies error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/reply', auth, adminOnly, async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply || !reply.trim())
      return res.status(400).json({ error: 'Reply content is required' });
    if (reply.length > 2000)
      return res.status(400).json({ error: 'Reply too long (max 2000 chars)' });

    const { data: msg, error: fetchErr } = await supabase
      .from('owner_messages')
      .select('sender_id')
      .eq('id', req.params.id)
      .single();
    if (fetchErr || !msg) return res.status(404).json({ error: 'Message not found' });

    const { error } = await supabase
      .from('owner_messages')
      .update({ reply: reply.trim(), replied_at: new Date().toISOString(), reply_read: false })
      .eq('id', req.params.id);
    if (error) {
      console.error('PUT /api/owner-messages/reply error:', error);
      return res.status(500).json({ error: 'Failed to save reply' });
    }

    const io = req.app.get('io');
    if (io) {
      const senderSocket = require('../socket').onlineUsers.get(msg.sender_id);
      if (senderSocket) {
        io.to(senderSocket).emit('owner_reply_notification', {
          messageId: req.params.id,
          reply: reply.trim(),
          repliedAt: new Date().toISOString(),
        });
      }
    }

    res.json({ message: 'Reply sent successfully' });
  } catch (err) {
    console.error('PUT /api/owner-messages/reply error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { error } = await supabase
      .from('owner_messages')
      .delete()
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Failed to delete message' });
    res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error('DELETE /api/owner-messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
