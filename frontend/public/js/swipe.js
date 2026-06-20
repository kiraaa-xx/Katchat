// ── Mobile Swipe-to-Reply ─────────────────────────────────────
function initSwipe(container) {
  if (!container) return;
  // Only on touch devices
  container.querySelectorAll('.msg-row').forEach(row => attachSwipe(row));
}

function attachSwipe(row) {
  if (row.dataset.swipeInit) return;
  row.dataset.swipeInit = '1';

  let startX = 0, startY = 0, currentX = 0, isDragging = false, isHorizontal = null;
  const threshold = 60;
  const maxSlide = 80;
  const hint = document.getElementById('swipe-hint');

  row.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = false;
    isHorizontal = null;
  }, { passive: true });

  row.addEventListener('touchmove', (e) => {
    if (!e.touches[0]) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Determine direction on first significant move
    if (isHorizontal === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isHorizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHorizontal) return;

    const isOwn = row.classList.contains('own');
    // Own messages: swipe left (negative dx); others: swipe right (positive dx)
    if (isOwn && dx > 0) return;
    if (!isOwn && dx < 0) return;

    isDragging = true;
    currentX = Math.min(Math.abs(dx), maxSlide) * (isOwn ? -1 : 1);
    const progress = Math.abs(currentX) / threshold;

    row.style.transform = `translateX(${currentX}px)`;
    row.style.transition = 'none';

    // Show hint icon
    if (Math.abs(currentX) > 20) {
      hint.classList.add('show');
      hint.style.opacity = Math.min(progress, 1);
      const rect = row.getBoundingClientRect();
      hint.style.top = `${rect.top + rect.height / 2 - 19}px`;
      hint.style.left = isOwn ? `${rect.left - 50}px` : `${rect.right + 10}px`;
    }
  }, { passive: true });

  row.addEventListener('touchend', () => {
    if (!isDragging) return;
    hint.classList.remove('show');
    hint.style.opacity = '0';

    row.style.transition = 'transform .3s cubic-bezier(.4,0,.2,1)';
    row.style.transform = '';

    if (Math.abs(currentX) >= threshold) {
      triggerSwipeReply(row);
      vibratePhone();
    }

    isDragging = false;
    currentX = 0;
    isHorizontal = null;
  });
}

function triggerSwipeReply(row) {
  const msgId = row.dataset.id;
  if (!msgId) return;

  // Is this a private or global chat?
  const isGlobal = !!document.getElementById('v-global') && !document.getElementById('v-global').classList.contains('hidden');
  const bubble = row.querySelector('.bubble');
  const content = bubble?.textContent?.trim() || 'Message';
  const senderLabel = row.querySelector('.sender-lbl');
  const senderName = senderLabel?.textContent?.trim().replace(/\s+/g, ' ').split(' ')[0] || state.user?.display_name || '';

  if (isGlobal) {
    setGlobalReply(msgId, senderName, content.substring(0, 60));
    document.getElementById('global-input')?.focus();
  } else {
    setPrivReply(null, msgId, senderName, content.substring(0, 60));
    document.getElementById('priv-input')?.focus();
  }
}

function vibratePhone() {
  if ('vibrate' in navigator) navigator.vibrate(30);
}
