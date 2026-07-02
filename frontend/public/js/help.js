// ── Help Center ─────────────────────────────────────────────

function openHelp() {
  showView('help');
}

function toggleHelpSection(btn) {
  const body = btn.nextElementSibling;
  if (!body || !body.classList.contains('help-section-body')) return;
  const isOpen = !body.classList.contains('hidden');
  body.classList.toggle('hidden');
  btn.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', !isOpen);
}

function toggleFaqItem(btn) {
  const wrap = btn.nextElementSibling;
  if (!wrap || !wrap.classList.contains('help-faq-a-wrap')) return;
  const isOpen = !wrap.classList.contains('hidden');
  wrap.classList.toggle('hidden');
  btn.setAttribute('aria-expanded', !isOpen);
}

// Load latest announcements for the welcome screen preview
async function loadWelcomeAnnouncements() {
  try {
    const { announcements } = await api.getAnnouncements();
    const container = document.getElementById('welcome-announcements');
    if (!container) return;
    if (!announcements || announcements.length === 0) {
      container.innerHTML = '';
      return;
    }
    const recent = announcements.slice(0, 3);
    container.innerHTML = recent.map(a => `
      <div class="welcome-ann-item ${a.pinned ? 'pinned' : ''}" onclick="navTo('announcements')">
        ${a.pinned ? '<i class="fa fa-thumbtack welcome-ann-pin"></i>' : ''}
        <span class="welcome-ann-title">${esc(a.title)}</span>
        <span class="welcome-ann-date">${new Date(a.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
      </div>
    `).join('');
  } catch {}
}

window.openHelp = openHelp;
window.toggleHelpSection = toggleHelpSection;
window.toggleFaqItem = toggleFaqItem;
window.loadWelcomeAnnouncements = loadWelcomeAnnouncements;
