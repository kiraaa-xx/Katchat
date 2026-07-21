async function openAnnouncements() {
  showView('announcements');
  const rolePerms = state.roles.find(r => r.name === state.user?.role)?.permissions || {};
  document.getElementById('new-ann-btn').classList.toggle('hidden', !rolePerms.canCreateAnnouncements);

  const container = document.getElementById('ann-container');
  container.innerHTML = skeletonAnnouncements(3);

  try {
    const { announcements } = await api.getAnnouncements();
    if (announcements && announcements.length) {
      const maxId = Math.max(...announcements.map(a => a.id));
      localStorage.setItem('kc_last_announcement_id', String(maxId));
    }
    renderAnnouncements(announcements, container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>${esc(friendlyError(err) || 'Announcements failed to load. Please try again.')}</p></div>`;
  }
}

function renderAnnouncements(announcements, container) {
  container.innerHTML = '';
  if (!announcements.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-bullhorn"></i><h4 class="es-title">No announcements yet</h4><p>Check back later for updates and news from the team.</p></div>`;
    return;
  }
  announcements.forEach(ann => container.appendChild(makeAnnCard(ann)));
}

function truncateWords(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return { text, truncated: false };
  return { text: words.slice(0, maxWords).join(' '), truncated: true };
}

function makeAnnCard(ann) {
  const rolePerms = state.roles.find(r => r.name === state.user?.role)?.permissions || {};
  const isAdmin = rolePerms.canCreateAnnouncements;
  const canComment = rolePerms.canCommentAnnouncements && !state.user?.is_banned_from_global;
  const author = ann.author || {};
  const isMobile = window.innerWidth < 769;

  const card = document.createElement('article');
  card.className = `ann-card shimmer-load ${ann.pinned ? 'pinned' : ''}`;
  card.dataset.annId = ann.id;

  let contentHtml;

  if (isMobile) {
    const preview = truncateWords(ann.content, 30);
    contentHtml = `
      <div class="ann-card-body">
        ${ann.pinned ? '<div class="ann-pin-badge"><i class="fa fa-thumbtack"></i> Pinned</div>' : ''}
        <h2 class="ann-card-title">${esc(ann.title)}</h2>
        <div class="ann-card-content-preview">
          ${esc(preview.text)}${preview.truncated ? '<span class="ann-read-more" onclick="openAnnDetail(\'' + ann.id + '\', event)">... Read more</span>' : ''}
        </div>
        <div class="ann-card-footer">
          <div class="ann-card-author">
            ${author.profile_picture
              ? `<img src="${author.profile_picture}" class="ann-author-av" onerror="this.outerHTML='<div class=\\'ann-author-av-fallback\\'>${(author.display_name||'A')[0].toUpperCase()}</div>'">`
              : `<div class="ann-author-av-fallback" style="background:${author.profile_color||'#555'}">${(author.display_name||'A')[0].toUpperCase()}</div>`
            }
            <div>
              <span class="ann-author-name">${esc(author.display_name || 'Admin')} ${getRoleBadge(author.role || 'admin')}</span>
              <span class="ann-card-date">${new Date(ann.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
            </div>
          </div>
          ${isAdmin ? `<div class="ann-card-actions">
            <button class="icon-btn" onclick="event.stopPropagation();openAnnModal('${ann.id}')" title="Edit" aria-label="Edit announcement"><i class="fa fa-pen" aria-hidden="true"></i></button>
            <button class="icon-btn" onclick="event.stopPropagation();deleteAnn('${ann.id}')" title="Delete" style="color:var(--danger)" aria-label="Delete announcement"><i class="fa fa-trash" aria-hidden="true"></i></button>
          </div>` : ''}
        </div>
        <div class="ann-card-btns">
          <button class="ann-card-btn primary" onclick="event.stopPropagation();openAnnDetail('${ann.id}')"><i class="fa fa-expand-alt"></i> Expand &amp; Comment</button>
        </div>
      </div>`;
  } else {
    const imageSection = ann.image ? `
      <div class="ann-card-img-wrap" onclick="openAnnImageViewer(${onclickStr(ann.image)})" title="Click to view full image">
        <img src="${ann.image}" class="ann-card-img" alt="Announcement image" loading="lazy" onerror="this.closest('.ann-card-img-wrap').remove()">
        <div class="ann-img-overlay"><i class="fa fa-expand-alt"></i></div>
      </div>` : '';
    contentHtml = `
      <div class="ann-card-body">
        ${ann.pinned ? '<div class="ann-pin-badge"><i class="fa fa-thumbtack"></i> Pinned</div>' : ''}
        <h2 class="ann-card-title">${esc(ann.title)}</h2>
        <p class="ann-card-content">${esc(ann.content)}</p>
        <div class="ann-card-footer">
          <div class="ann-card-author">
            ${author.profile_picture
              ? `<img src="${author.profile_picture}" class="ann-author-av" onerror="this.outerHTML='<div class=\\'ann-author-av-fallback\\'>${(author.display_name||'A')[0].toUpperCase()}</div>'">`
              : `<div class="ann-author-av-fallback" style="background:${author.profile_color||'#555'}">${(author.display_name||'A')[0].toUpperCase()}</div>`
            }
            <div>
              <span class="ann-author-name">${esc(author.display_name || 'Admin')} ${getRoleBadge(author.role || 'admin')}</span>
              <span class="ann-card-date">${new Date(ann.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="ann-card-btn primary" onclick="event.stopPropagation();openAnnDetail('${ann.id}')"><i class="fa fa-expand-alt"></i> Expand &amp; Comment</button>
            ${isAdmin ? `
            <button class="icon-btn" onclick="event.stopPropagation();openAnnModal('${ann.id}')" title="Edit" aria-label="Edit announcement"><i class="fa fa-pen" aria-hidden="true"></i></button>
            <button class="icon-btn" onclick="event.stopPropagation();deleteAnn('${ann.id}')" title="Delete" style="color:var(--danger)" aria-label="Delete announcement"><i class="fa fa-trash" aria-hidden="true"></i></button>` : ''}
          </div>
        </div>
      </div>
      ${imageSection}`;
  }

  card.innerHTML = contentHtml;
  return card;
}

// ── Announcement Detail Modal ──

function openAnnDetail(annId, event) {
  if (event) event.stopPropagation();
  const anns = document.querySelectorAll('[data-ann-id]');
  let annData = null;
  for (const card of anns) {
    if (card.dataset.annId === annId) {
      const title = card.querySelector('.ann-card-title')?.textContent || '';
      const isPinned = card.classList.contains('pinned');
      annData = { id: annId, title, pinned: isPinned };
      break;
    }
  }
  if (!annData) return;
  fetchAnnDetail(annData);
}

async function fetchAnnDetail(annData) {
  try {
    const { announcements } = await api.getAnnouncements();
    const ann = announcements.find(a => a.id === annData.id);
    if (!ann) { showToast('Announcement not found', 'error'); return; }
    renderAnnDetail(ann);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderAnnDetail(ann) {
  const id = ann.id;
  const author = ann.author || {};
  const pinned = ann.pinned;
  const canComment = (state.roles.find(r => r.name === state.user?.role)?.permissions?.canCommentAnnouncements) && !state.user?.is_banned_from_global;

  const body = document.getElementById('ann-detail-body');
  const modal = document.getElementById('m-ann-detail');

  body.innerHTML = `
    <div class="ann-detail-scroll">
      ${pinned ? '<div class="ann-detail-pin"><i class="fa fa-thumbtack"></i> Pinned</div>' : ''}
      <h1 class="ann-detail-title">${esc(ann.title)}</h1>
      <div class="ann-detail-meta">
        ${author.profile_picture
          ? `<img src="${author.profile_picture}" class="ann-detail-author-av" onerror="this.outerHTML='<div class=\\'ann-detail-author-av-fallback\\'>${(author.display_name||'A')[0].toUpperCase()}</div>'">`
          : `<div class="ann-detail-author-av-fallback" style="background:${author.profile_color||'#555'}">${(author.display_name||'A')[0].toUpperCase()}</div>`
        }
        <span class="ann-detail-meta-name">${esc(author.display_name || 'Admin')} ${getRoleBadge(author.role || 'admin')}</span>
        <span class="ann-detail-date">${new Date(ann.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</span>
      </div>
      ${ann.image ? `<img src="${ann.image}" class="ann-detail-img" alt="Announcement image" loading="lazy" onclick="openAnnImageViewer('${esc(ann.image)}')">` : ''}
      <div class="ann-detail-content">${esc(ann.content)}</div>
      <div class="ann-detail-comments">
        <div class="ann-comments-section">
          <button class="ann-comments-toggle" onclick="toggleComments('${id}', this)" aria-expanded="true">
            <i class="fa fa-comment" aria-hidden="true"></i> <span class="comment-btn-label">Comments</span>
            <span class="comment-count-badge" id="cc-det-${id}"></span>
          </button>
          <div class="ann-comments-body" id="comments-det-${id}">
            <div class="comments-list" id="comments-list-det-${id}">
              <div class="comments-loading"><i class="fa fa-spinner fa-spin"></i></div>
            </div>
            ${canComment ? `
            <div class="comment-input-row">
              ${makeAvEl(state.user, 'xs').outerHTML}
              <div class="comment-input-wrap">
                <input type="text" class="comment-input" id="ci-det-${id}" placeholder="Write a comment..." onkeydown="detailCommentKey(event,'${id}')">
                <button class="comment-send-btn" onclick="submitDetailComment('${id}')" aria-label="Send comment"><i class="fa fa-paper-plane" aria-hidden="true"></i></button>
              </div>
            </div>` : `<p class="comment-banned-note"><i class="fa fa-lock"></i> ${state.user?.is_banned_from_global ? 'Banned users cannot comment.' : 'You cannot comment.'}</p>`}
          </div>
        </div>
      </div>
    </div>`;

  openModal('m-ann-detail');
  loadDetailComments(id);
}

async function loadDetailComments(annId) {
  const list = document.getElementById(`comments-list-det-${annId}`);
  list.innerHTML = '<div class="comments-loading"><i class="fa fa-spinner fa-spin"></i></div>';
  try {
    const { comments } = await api.getComments(annId);
    const countBadge = document.getElementById(`cc-det-${annId}`);
    if (countBadge) countBadge.textContent = comments.length ? comments.length : '';
    renderComments(comments, list, annId, 'det');
  } catch (err) {
    list.innerHTML = `<p style="color:var(--danger);font-size:12px;padding:8px">${esc(err.message)}</p>`;
  }
}

function renderComments(comments, list, annId, prefix) {
  list.innerHTML = '';
  if (!comments.length) {
    list.innerHTML = `<p class="no-comments"><i class="fa fa-comment" style="display:block;margin:0 auto 6px;font-size:18px;opacity:.5"></i>No comments yet. Be the first!</p>`;
    return;
  }
  comments.forEach(c => list.appendChild(makeCommentEl(c, annId, prefix)));
}

function makeCommentEl(comment, annId, prefix) {
  const isOwn = comment.author_id === state.user?.id;
  const canDelete = isOwn || state.roles.find(r => r.name === state.user?.role)?.permissions?.canDeleteMessages;
  const author = comment.author || {};
  const el = document.createElement('div');
  el.className = 'comment-item';
  el.dataset.commentId = comment.id;
  const av = makeAvEl(author, 'xs');
  const listId = prefix ? `comments-list-${prefix}-${annId}` : `comments-list-${annId}`;
  el.innerHTML = `
    ${av.outerHTML}
    <div class="comment-body">
      <div class="comment-header">
        <span class="comment-author">${esc(author.display_name)} ${getRoleBadge(author.role)}</span>
        <span class="comment-time">${fmtTime(comment.created_at)}</span>
        ${canDelete ? `<button class="comment-del-btn" onclick="deleteDetailComment('${annId}','${comment.id}')" title="Delete" aria-label="Delete comment"><i class="fa fa-trash" aria-hidden="true"></i></button>` : ''}
      </div>
      <p class="comment-text">${esc(comment.content)}</p>
    </div>`;
  return el;
}

function detailCommentKey(e, annId) {
  if (e.key === 'Enter') { e.preventDefault(); submitDetailComment(annId); }
}

async function submitDetailComment(annId) {
  const input = document.getElementById(`ci-det-${annId}`);
  const content = input?.value.trim();
  if (!content) return;
  input.value = '';
  try {
    const { comment } = await api.postComment(annId, content);
    const list = document.getElementById(`comments-list-det-${annId}`);
    const noComments = list.querySelector('.no-comments');
    if (noComments) noComments.remove();
    list.appendChild(makeCommentEl(comment, annId, 'det'));
    const badge = document.getElementById(`cc-det-${annId}`);
    if (badge) {
      const current = parseInt(badge.textContent) || 0;
      badge.textContent = current + 1;
    }
    list.scrollTop = list.scrollHeight;
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteDetailComment(annId, commentId) {
  showConfirm('Delete Comment', 'Remove this comment?', async () => {
    try {
      await api.deleteComment(annId, commentId);
      document.querySelector(`[data-comment-id="${commentId}"]`)?.remove();
      const badge = document.getElementById(`cc-det-${annId}`);
      if (badge) { const c = parseInt(badge.textContent) || 1; badge.textContent = c > 1 ? c - 1 : ''; }
      showToast('Comment deleted', 'info');
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function closeAnnDetail() {
  closeModal();
}

// ── Original functions kept for compatibility ──

function openAnnImageViewer(src) {
  const overlay = document.createElement('div');
  overlay.className = 'ann-img-viewer';
  overlay.onclick = (e) => { if (e.target === overlay || e.target.classList.contains('ann-img-viewer-close')) overlay.remove(); };

  overlay.innerHTML = `
    <div class="ann-img-viewer-inner">
      <button class="ann-img-viewer-close" title="Close"><i class="fa fa-times"></i></button>
      <img src="${src}" class="ann-img-viewer-img" alt="Announcement image" draggable="false" onclick="event.stopPropagation()">
      <div class="ann-img-viewer-actions">
        <a href="${src}" target="_blank" class="ann-img-viewer-link" onclick="event.stopPropagation()">
          <i class="fa fa-external-link-alt"></i> Open full size
        </a>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const imgEl = overlay.querySelector('.ann-img-viewer-img');
  let imgScale = 1, imgPanX = 0, imgPanY = 0;
  let isPanning = false, panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0;

  function resetTransform() { imgScale = 1; imgPanX = 0; imgPanY = 0; applyTransform(); imgEl.classList.remove('iv-zoomed'); }
  function applyTransform() {
    imgEl.style.transform = imgScale !== 1 ? `translate(${imgPanX}px,${imgPanY}px) scale(${imgScale})` : 'none';
    imgEl.classList.toggle('iv-zoomed', imgScale > 1);
  }

  imgEl.addEventListener('wheel', function(e) {
    e.preventDefault();
    const rect = imgEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const newScale = Math.max(0.5, Math.min(5, imgScale * (1 + delta)));
    if (newScale !== imgScale) {
      const ratio = newScale / imgScale;
      imgPanX = mx - (mx - imgPanX) * ratio;
      imgPanY = my - (my - imgPanY) * ratio;
      imgScale = newScale;
      applyTransform();
    }
  }, { passive: false });

  imgEl.addEventListener('mousedown', function(e) {
    if (imgScale <= 1) return;
    e.preventDefault(); isPanning = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panOrigX = imgPanX; panOrigY = imgPanY;
    imgEl.classList.add('iv-dragging');
  });
  window.addEventListener('mousemove', function(e) {
    if (!isPanning) return;
    imgPanX = panOrigX + (e.clientX - panStartX);
    imgPanY = panOrigY + (e.clientY - panStartY);
    applyTransform();
  });
  window.addEventListener('mouseup', function() { if (isPanning) { isPanning = false; imgEl.classList.remove('iv-dragging'); } });

  imgEl.addEventListener('dblclick', function(e) {
    e.preventDefault();
    if (imgScale > 1) { resetTransform(); return; }
    const rect = imgEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const newScale = 2.5;
    const ratio = newScale / imgScale;
    imgPanX = mx - (mx - imgPanX) * ratio;
    imgPanY = my - (my - imgPanY) * ratio;
    imgScale = newScale;
    applyTransform();
  });

  function removeAnnImgViewer() {
    isPanning = false;
    overlay.remove();
  }

  const escHandler = (e) => { if (e.key === 'Escape') { removeAnnImgViewer(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
  overlay.onclick = (e) => { if (e.target === overlay || e.target.classList.contains('ann-img-viewer-close')) removeAnnImgViewer(); };
}

async function toggleComments(annId, btn) {
  const body = document.getElementById(`comments-${annId}`) || document.getElementById(`comments-det-${annId}`);
  const isOpen = !body.classList.contains('hidden');
  const label = btn.querySelector('.comment-btn-label');
  if (isOpen) {
    body.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
    label.textContent = 'Comments';
    return;
  }
  body.classList.remove('hidden');
  btn.setAttribute('aria-expanded', 'true');
  label.textContent = 'Comments';
  await loadComments(annId);
}

async function loadComments(annId) {
  const list = document.getElementById(`comments-list-${annId}`) || document.getElementById(`comments-list-det-${annId}`);
  list.innerHTML = '<div class="comments-loading"><i class="fa fa-spinner fa-spin"></i></div>';
  try {
    const { comments } = await api.getComments(annId);
    const countBadge = document.getElementById(`cc-${annId}`) || document.getElementById(`cc-det-${annId}`);
    if (countBadge) countBadge.textContent = comments.length ? comments.length : '';
    const list2 = document.getElementById(`comments-list-${annId}`);
    const listDet = document.getElementById(`comments-list-det-${annId}`);
    if (list2) {
      list2.innerHTML = '';
      if (!comments.length) { list2.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>'; }
      else { comments.forEach(c => list2.appendChild(makeCommentEl(c, annId, ''))); }
    }
    if (listDet) {
      listDet.innerHTML = '';
      if (!comments.length) { listDet.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>'; }
      else { comments.forEach(c => listDet.appendChild(makeCommentEl(c, annId, 'det'))); }
    }
  } catch (err) {
    if (list) list.innerHTML = `<p style="color:var(--danger);font-size:12px;padding:8px">${esc(err.message)}</p>`;
  }
}

async function openAnnModal(annId) {
  editingAnnId = annId;
  document.getElementById('ann-img-preview-wrap').classList.add('hidden');
  document.getElementById('ann-img-input').value = '';
  if (annId) {
    document.getElementById('ann-modal-title').innerHTML = '<i class="fa fa-pen"></i> Edit Announcement';
    document.getElementById('ann-submit-label').textContent = 'Save Changes';
    try {
      const { announcements } = await api.getAnnouncements();
      const ann = announcements.find(a => a.id === annId);
      if (ann) {
        document.getElementById('ann-title').value = ann.title;
        document.getElementById('ann-content').value = ann.content;
        document.getElementById('ann-pinned').checked = ann.pinned;
        if (ann.image) { document.getElementById('ann-img-preview').src = ann.image; document.getElementById('ann-img-preview-wrap').classList.remove('hidden'); }
      }
    } catch {}
  } else {
    document.getElementById('ann-modal-title').innerHTML = '<i class="fa fa-bullhorn"></i> New Announcement';
    document.getElementById('ann-submit-label').textContent = 'Post Announcement';
    document.getElementById('ann-title').value = '';
    document.getElementById('ann-content').value = '';
    document.getElementById('ann-pinned').checked = false;
  }
  openModal('m-ann');
}

function previewAnnImg(input) {
  if (!input.files[0]) return;
  const url = URL.createObjectURL(input.files[0]);
  document.getElementById('ann-img-preview').src = url;
  document.getElementById('ann-img-preview-wrap').classList.remove('hidden');
}

async function submitAnnouncement() {
  const title = document.getElementById('ann-title').value.trim();
  const content = document.getElementById('ann-content').value.trim();
  const pinned = document.getElementById('ann-pinned').checked;
  const imgFile = document.getElementById('ann-img-input').files[0];
  if (!title || !content) { showToast('Title and content are required', 'error'); return; }
  const fd = new FormData();
  fd.append('title', title); fd.append('content', content); fd.append('pinned', pinned);
  if (imgFile) fd.append('image', imgFile);
  const method = editingAnnId ? 'PUT' : 'POST';
  const path = editingAnnId ? '/announcements/' + editingAnnId : '/announcements';
  const doPost = async function() {
    showUploadProgress(true);
    setUploadProgress(0, editingAnnId ? 'Updating...' : 'Posting...');
    try {
      await uploadWithProgress(method, path, fd, function(pct) {
        setUploadProgress(pct, Math.round(pct * 100) + '%');
      });
      showUploadProgress(false);
      showToast(editingAnnId ? 'Announcement updated!' : 'Announcement posted!', 'success');
      closeModal();
      await openAnnouncements();
    } catch (err) {
      showUploadRetry(doPost);
    }
  };
  await doPost();
}

async function deleteAnn(annId) {
  showConfirm('Delete Announcement', 'This cannot be undone.', async () => {
    try { await api.deleteAnnouncement(annId); document.querySelector(`[data-ann-id="${annId}"]`)?.remove(); showToast('Deleted', 'info'); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

window.openAnnouncements = openAnnouncements;
window.openAnnModal = openAnnModal;
window.submitAnnouncement = submitAnnouncement;
window.deleteAnn = deleteAnn;
window.toggleComments = toggleComments;
window.previewAnnImg = previewAnnImg;
window.openAnnDetail = openAnnDetail;
window.closeAnnDetail = closeAnnDetail;
window.detailCommentKey = detailCommentKey;
window.submitDetailComment = submitDetailComment;
window.deleteDetailComment = deleteDetailComment;
