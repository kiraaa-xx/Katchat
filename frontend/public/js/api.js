const API = '/api';

async function req(method, path, body = null, isForm = false) {
  const token = localStorage.getItem('kc_token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm && body) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) { const text = await res.text(); throw new Error(`Server error (${res.status}): ${text.substring(0, 100)}`); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function uploadWithProgress(method, path, formData, onProgress) {
  return new Promise(function(resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, API + path);
    const token = localStorage.getItem('kc_token');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = function() {
      const ct = xhr.getResponseHeader('content-type') || '';
      if (!ct.includes('application/json')) { reject(new Error('Server error (' + xhr.status + ')')); return; }
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'Upload failed'));
      } catch (e) { reject(new Error('Invalid server response')); }
    };
    xhr.onerror = function() { reject(new Error('Network error')); };
    xhr.ontimeout = function() { reject(new Error('Upload timed out')); };
    xhr.send(formData);
  });
}

// ── Upload progress UI helpers ──
let _uploadRetryFn = null;

function showUploadProgress(show) {
  const el = document.getElementById('upload-progress-container');
  if (el) el.classList.toggle('hidden', !show);
}

function setUploadProgress(pct, text) {
  const bar = document.getElementById('upload-progress-bar');
  const txt = document.getElementById('upload-progress-text');
  if (bar) bar.style.width = Math.round(pct * 100) + '%';
  if (txt && text) txt.textContent = text;
}

function showUploadRetry(fn) {
  _uploadRetryFn = fn;
  const btn = document.getElementById('upload-retry-btn');
  if (btn) { btn.classList.remove('hidden'); btn.onclick = function() { btn.classList.add('hidden'); if (_uploadRetryFn) _uploadRetryFn(); }; }
  setUploadProgress(0, 'Upload failed');
}

const api = {
  login: (d) => req('POST', '/auth/login', d),
  register: (d) => req('POST', '/auth/register', d),
  me: () => req('GET', '/auth/me'),
  changePassword: (d) => req('PUT', '/auth/change-password', d),
  resetUserPassword: (userId) => req('POST', '/auth/admin/reset-password', { userId }),
  markIntroSeen: () => req('PUT', '/auth/mark-intro-seen'),
  searchUsers: (q) => req('GET', `/users/search?q=${encodeURIComponent(q)}`),
  getSuggestions: () => req('GET', '/users/suggestions'),
  getFriends: () => req('GET', '/users/friends'),
  sendFriendReq: (id) => req('POST', `/users/friend-request/${id}`),
  cancelFriendReq: (id) => req('DELETE', `/users/friend-request/${id}`),
  removeFriend: (id) => req('DELETE', `/users/friend/${id}`),
  updateProfile: (d) => req('PUT', '/users/profile', d),
  uploadAvatar: (fd) => req('POST', '/users/avatar', fd, true),
  getAllUsers: () => req('GET', '/users/all'),
  updateRole: (id, role) => req('PUT', `/users/role/${id}`, { role }),
  banUser: (id, reason) => req('PUT', `/users/ban/${id}`, { reason }),
  unbanUser: (id) => req('PUT', `/users/unban/${id}`),
  getMutual: (id) => req('GET', `/users/mutual/${id}`),
  saveSageHistory: (history) => req('PUT', '/users/sage-history', { history }),
  getRoles: () => req('GET', '/roles'),
  createRole: (d) => req('POST', '/roles', d),
  updateRoleData: (name, d) => req('PUT', `/roles/${name}`, d),
  deleteRole: (name) => req('DELETE', `/roles/${name}`),
  getPrivateMsgs: (id, page = 1) => req('GET', `/messages/private/${id}?page=${page}`),
  getGlobalMsgs: () => req('GET', '/messages/global'),
  deleteMsg: (id) => req('DELETE', `/messages/${id}`),
  getUnreadCounts: () => req('GET', '/messages/unread-counts'),
  getAnnouncements: () => req('GET', '/announcements'),
  createAnnouncement: (fd) => req('POST', '/announcements', fd, true),
  updateAnnouncement: (id, fd) => req('PUT', `/announcements/${id}`, fd, true),
  deleteAnnouncement: (id) => req('DELETE', `/announcements/${id}`),
  getComments: (annId) => req('GET', `/announcements/${annId}/comments`),
  postComment: (annId, content) => req('POST', `/announcements/${annId}/comments`, { content }),
  deleteComment: (annId, commentId) => req('DELETE', `/announcements/${annId}/comments/${commentId}`),
  chatSage: (messages, imageBase64, imageMime, chatId) => req('POST', '/ai/chat', { messages, imageBase64, imageMime, chatId }),
  generateSageTitle: (userMessage, assistantReply) => req('POST', '/ai/generate-title', { userMessage, assistantReply }),
  getSageHistory: () => req('GET', '/ai/history'),
  getSageChats: () => req('GET', '/ai/chats'),
  saveSageChat: (chat) => req('POST', '/ai/chats', { chat }),
  deleteSageChat: (chatId) => req('DELETE', `/ai/chats/${chatId}`),
  deleteSageMessage: (chatId, messageIndex) => req('POST', `/ai/chats/${chatId}/delete-message`, { messageIndex }),
  getImageUploadLimit: () => req('GET', '/users/image-upload-limit'),
  incrementImageUpload: () => req('POST', '/users/image-upload-increment'),
  getBannedUsers: () => req('GET', '/users/banned'),
  getHelpContent: () => req('GET', '/help'),
  updateHelpSection: (key, body) => req('PUT', `/help/${key}`, { body }),
  sendOwnerMessage: (content) => req('POST', '/owner-messages', { content }),
  getOwnerMessages: () => req('GET', '/owner-messages'),
  checkOwnerMessageStatus: () => req('GET', '/owner-messages/status'),
  markOwnerMessageRead: (id) => req('PUT', `/owner-messages/${id}/read`),
  replyToOwnerMessage: (id, reply) => req('PUT', `/owner-messages/${id}/reply`, { reply }),
  deleteOwnerMessage: (id) => req('DELETE', `/owner-messages/${id}`),
  getMyOwnerMessages: () => req('GET', '/owner-messages/my-messages'),
  markOwnerRepliesRead: () => req('PUT', '/owner-messages/read-replies'),
};
