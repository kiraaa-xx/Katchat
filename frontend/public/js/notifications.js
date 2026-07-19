/**
 * KATCHAT BROWSER NOTIFICATION SYSTEM
 * Modular notification manager with permission handling and per-type toggles.
 * Designed so that a future Capacitor/mobile push adapter can swap the
 * 'show' method without changing any callers.
 *
 * Settings keys (localStorage):
 *   kc_notif_pm          — private messages (default: true)
 *   kc_notif_announce    — announcements   (default: true)
 */

window.notificationSystem = {

  // ── Check if the Notification API is available ─────────────
  isSupported() {
    return 'Notification' in window && typeof Notification === 'function';
  },

  // ── Permission state ───────────────────────────────────────
  permission() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  // ── Request permission (only if not already granted/denied) ─
  // Returns true if permission was granted (or already is).
  async requestPermission() {
    if (!this.isSupported()) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  },

  // ── Check if a notification type is enabled ────────────────
  isEnabled(type) {
    const key = type === 'pm' ? 'kc_notif_pm' : 'kc_notif_announce';
    // Default to true for both
    return localStorage.getItem(key) !== '0';
  },

  // ── Toggle a notification type ─────────────────────────────
  setEnabled(type, value) {
    const key = type === 'pm' ? 'kc_notif_pm' : 'kc_notif_announce';
    localStorage.setItem(key, value ? '1' : '0');
  },

  // ── Show a browser notification ────────────────────────────
  // type: 'pm' | 'announce'
  // opts.title   — notification title
  // opts.body    — body text
  // opts.tag     — deduplication tag (optional)
  // opts.onClick — callback invoked when the notification is clicked
  async show(type, { title, body, tag, onClick }) {
    if (!this.isSupported()) return;
    if (!this.isEnabled(type)) return;

    const granted = await this.requestPermission();
    if (!granted) return;

    try {
      const n = new Notification(title, {
        body: body || '',
        tag: tag || '',
        icon: '/assets/logo.png',
        badge: '/assets/favicons/favicon-32x32.png',
        silent: false,
      });

      if (typeof onClick === 'function') {
        n.onclick = function (e) {
          e.preventDefault();
          window.focus();
          this.close();
          onClick();
        };
      }

      // Auto-close after 8 seconds
      setTimeout(() => n.close(), 8000);

      return n;
    } catch (err) {
      logError('notificationSystem.show', err, false);
    }
  },

  // ── Shorthand: notify about a new private message ──────────
  // senderName / preview / onClick open the chat
  notifyPrivateMessage(senderName, preview, onClick) {
    this.show('pm', {
      title: senderName,
      body: preview,
      tag: 'pm-' + (senderName || ''),
      onClick,
    });
  },

  // ── Shorthand: notify about a new announcement ─────────────
  notifyAnnouncement(title, preview, onClick) {
    this.show('announce', {
      title: '📢 ' + title,
      body: preview,
      tag: 'ann-' + (title || ''),
      onClick,
    });
  },
};
