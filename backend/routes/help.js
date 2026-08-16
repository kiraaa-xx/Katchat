const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { auth, ownerOnly } = require('../middleware/auth');

const HELP_FILE = path.join(__dirname, '..', 'help-content.json');

const DEFAULT_SECTIONS = [
  {
    section_key: 'getting-started',
    title: 'Getting Started',
    icon: 'fa-rocket',
    body: '<p><strong>Welcome to KatChat!</strong> A real-time messaging platform with private chat, global chat, AI assistant (Sage), announcements, and more.</p>\n<ul>\n<li><strong>Create an account</strong> \u2014 Sign up with your display name, username, email, and password. Your username must be 3-20 lowercase letters, numbers, or underscores.</li>\n<li><strong>Log in</strong> \u2014 Use your email and password. If your password was reset by an admin, you\'ll be asked to set a new one on your first login.</li>\n<li><strong>Navigate</strong> \u2014 Use the sidebar (desktop) or bottom nav (mobile) to switch between Home, Global Chat, Posts, and Settings. The top bar has buttons for Friends, Sage AI, and your profile.</li>\n</ul>'
  },
  {
    section_key: 'features',
    title: 'Key Features',
    icon: 'fa-star',
    body: '<div class="help-subsection"><h4><i class="fa fa-globe"></i> Global Chat</h4><p>Chat with everyone on the platform in real time. Use <code>@username</code> to mention someone (highlighted in gold), or type <code>/</code> to see available commands like ban, unban, and temp-ban. You can also share images in global chat.</p></div><div class="help-subsection"><h4><i class="fa fa-comment"></i> Private Chat</h4><p>Send direct messages to your friends. Click a friend in the sidebar or search for users to start a private conversation. Features include image uploads (up to 5 at a time), reply to specific messages, and swipe-to-reply on mobile.</p></div><div class="help-subsection"><h4><i class="fa fa-user-friends"></i> Friends</h4><p>Search for users by name or username and send friend requests. Accept or decline incoming requests. View mutual friends and online status. Friends appear in your sidebar\'s Friends tab for quick chatting.</p></div><div class="help-subsection"><h4><i class="fa fa-bullhorn"></i> Announcements</h4><p>View platform announcements from admins. Pinned announcements are highlighted with a gold glow for importance. You can comment on announcements if you have permission. Admins can create, edit, and pin announcements.</p></div><div class="help-subsection"><h4><i class="fa fa-robot"></i> Sage AI</h4><p>Your AI companion Sage. Ask Sage anything about KatChat features, for creative ideas, or just for a chat. Sage adapts its personality based on your profile. You can also send images for Sage to analyze. Sage remembers recent conversation context.</p></div><div class="help-subsection"><h4><i class="fa fa-gear"></i> Settings</h4><p>Update your display name, gender, and profile picture. Change your password (requires your current password). Toggle between Dark and Light themes \u2014 your preference is saved to your profile.</p></div>'
  },
  {
    section_key: 'commands',
    title: 'Global Chat Commands',
    icon: 'fa-terminal',
    body: '<p>Type <code>/</code> in the global chat input to see available commands. Only admins and owners can use moderation commands:</p><div class="help-cmd-list"><div class="help-cmd"><code>/ban @username "reason"</code><span>Permanently ban a user</span></div><div class="help-cmd"><code>/unban @username</code><span>Remove a permanent ban</span></div><div class="help-cmd"><code>/tban @username 2.5 "reason"</code><span>Temp ban for 2.5 hours</span></div><div class="help-cmd"><code>/tunban @username</code><span>Remove a temp ban early</span></div></div><p style="margin-top:10px">Type <code>@</code> after a command to search for a user by name.</p>'
  },
  {
    section_key: 'roles',
    title: 'Roles & Permissions',
    icon: 'fa-shield',
    body: '<div class="help-role-row"><span class="help-role-badge" style="background:var(--txt3)">Member</span><span>Chat, global chat, view announcements, comment on announcements</span></div><div class="help-role-row"><span class="help-role-badge" style="background:var(--cyan)">Admin</span><span>All Member permissions + ban users, delete messages, create announcements, access admin panel</span></div><div class="help-role-row"><span class="help-role-badge" style="background:var(--danger)">Owner</span><span>All Admin permissions + manage roles, manage users, full control, glowing messages</span></div><p style="margin-top:12px;font-size:13px;color:var(--txt2)">Custom roles can be created by the Owner. Each role has configurable permissions.</p>'
  },
  {
    section_key: 'faq',
    title: 'FAQ',
    icon: 'fa-question-circle',
    body: '<div class="help-faq-group"><div class="help-faq-group-title"><i class="fa fa-lock"></i> Account & Security</div><div class="help-faq-item"><button class="help-faq-q" onclick="toggleFaqItem(this)" aria-expanded="false"><i class="fa fa-key"></i> How do I change my password?<i class="fa fa-chevron-down"></i></button><div class="help-faq-a-wrap hidden"><div class="help-faq-a"><p>Open <strong>Settings</strong> \u2192 <strong>Security</strong>. Enter your current password, then your new password (minimum 8 characters), and click <strong>Change Password</strong>.</p><p>If you forgot your password, contact the owner at <strong>katchat369@gmail.com</strong> to request a reset from the Admin Panel.</p></div></div></div><div class="help-faq-item"><button class="help-faq-q" onclick="toggleFaqItem(this)" aria-expanded="false"><i class="fa fa-history"></i> My password was reset by an admin<i class="fa fa-chevron-down"></i></button><div class="help-faq-a-wrap hidden"><div class="help-faq-a"><p>Log in using the temporary password provided by the admin. After a successful login, you will be prompted to set a new password before you can continue using KatChat.</p><p>Your session will be restricted until the new password is set.</p></div></div></div><div class="help-faq-item"><button class="help-faq-q" onclick="toggleFaqItem(this)" aria-expanded="false"><i class="fa fa-pen"></i> Can I change my username or email?<i class="fa fa-chevron-down"></i></button><div class="help-faq-a-wrap hidden"><div class="help-faq-a"><p>Currently, usernames and emails cannot be changed after account creation. This ensures account security and consistent identity across the platform.</p><p>If you have a significant reason, please contact the owner at <strong>katchat369@gmail.com</strong>.</p></div></div></div></div><div class="help-faq-group"><div class="help-faq-group-title"><i class="fa fa-life-ring"></i> Getting Help</div><div class="help-faq-item"><button class="help-faq-q" onclick="toggleFaqItem(this)" aria-expanded="false"><i class="fa fa-envelope"></i> How do I contact the owner?<i class="fa fa-chevron-down"></i></button><div class="help-faq-a-wrap hidden"><div class="help-faq-a"><p>You can reach the owner directly via email at <strong>katchat369@gmail.com</strong> for account issues, ban appeals, feature requests, or any other questions.</p><p>Alternatively, ask <strong>Sage AI</strong> for instant guidance about KatChat features and settings.</p></div></div></div><div class="help-faq-item"><button class="help-faq-q" onclick="toggleFaqItem(this)" aria-expanded="false"><i class="fa fa-rocket"></i> New to KatChat? Where do I start?<i class="fa fa-chevron-down"></i></button><div class="help-faq-a-wrap hidden"><div class="help-faq-a"><p>Simple rule: <strong>Chat, connect, and enjoy</strong>. Respect other users, follow community guidelines, and keep the environment friendly.</p><p>Start with the <strong>Global Chat</strong> to meet everyone, then explore <strong>Private Chats</strong> with friends, and try <strong>Sage AI</strong> for instant answers.</p></div></div></div></div><div class="help-faq-group"><div class="help-faq-group-title"><i class="fa fa-wrench"></i> Troubleshooting</div><div class="help-faq-item"><button class="help-faq-q" onclick="toggleFaqItem(this)" aria-expanded="false"><i class="fa fa-ban"></i> I was banned. What can I do?<i class="fa fa-chevron-down"></i></button><div class="help-faq-a-wrap hidden"><div class="help-faq-a"><p>Banned users can still use <strong>private chats</strong> and <strong>view announcements</strong>. However, sending global chat messages and posting announcement comments will be disabled.</p><p>If you believe this was a mistake or wish to appeal, please contact the owner at <strong>katchat369@gmail.com</strong>.</p></div></div></div><div class="help-faq-item"><button class="help-faq-q" onclick="toggleFaqItem(this)" aria-expanded="false"><i class="fa fa-robot"></i> Sage AI is not responding<i class="fa fa-chevron-down"></i></button><div class="help-faq-a-wrap hidden"><div class="help-faq-a"><p>Sage may be temporarily unavailable due to a server issue or high demand. Wait a few minutes and try again.</p><p>If the problem persists, check your internet connection or contact the owner for further assistance.</p></div></div></div></div>'
  },
  {
    section_key: 'contact',
    title: 'Contact Owner',
    icon: 'fa-envelope',
    body: '<div class="help-contact-card"><i class="fa fa-envelope help-contact-icon"></i><div><strong>Email the owner</strong><p>For account issues, ban appeals, feature requests, or any other questions, email <strong>katchat369@gmail.com</strong>.</p></div></div><div class="help-contact-card"><i class="fa fa-robot help-contact-icon"></i><div><strong>Ask Sage AI</strong><p>Sage knows everything about KatChat and can answer your questions instantly. <button class="btn-text" onclick="openSage()"><i class="fa fa-external-link-alt"></i> Open Sage</button></p></div></div>'
  }
];

function loadSections() {
  try {
    if (fs.existsSync(HELP_FILE)) {
      return JSON.parse(fs.readFileSync(HELP_FILE, 'utf-8'));
    }
  } catch {}
  try {
    fs.writeFileSync(HELP_FILE, JSON.stringify(DEFAULT_SECTIONS, null, 2), 'utf-8');
  } catch {}
  return DEFAULT_SECTIONS;
}

function saveSections(sections) {
  fs.writeFileSync(HELP_FILE, JSON.stringify(sections, null, 2), 'utf-8');
}

/**
 * Sanitize owner-edited help HTML (defense in depth):
 * - remove <script> blocks
 * - remove event handler attributes (on*="...")
 * - remove javascript: / vbscript: URLs
 * - strip <iframe>/<object>/<embed> tags
 */
function sanitizeHelpHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<object[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*"(javascript|vbscript):[^"]*"/gi, '')
    .replace(/\s(?:href|src)\s*=\s*'(javascript|vbscript):[^']*'/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(javascript|vbscript):[^\s>]+/gi, '')
    .slice(0, 50000);
}

router.get('/', (req, res) => {
  res.json({ sections: loadSections() });
});

router.put('/:sectionKey', auth, ownerOnly, (req, res) => {
  try {
    const { sectionKey } = req.params;
    const { body } = req.body;
    if (typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Section content is required' });
    }
    const sections = loadSections();
    const idx = sections.findIndex(s => s.section_key === sectionKey);
    if (idx === -1) return res.status(404).json({ error: 'Section not found' });
    sections[idx].body = sanitizeHelpHtml(body);
    sections[idx].updated_at = new Date().toISOString();
    saveSections(sections);
    res.json({ section: sections[idx] });
  } catch (err) {
    console.error('help PUT error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
