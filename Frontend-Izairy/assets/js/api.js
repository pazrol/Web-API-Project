(() => {
  'use strict';
  const API_BASE = String((window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || '').replace(/\/+$/, '');
  const STORAGE_TOKEN = 'ticket4u_token';
  const STORAGE_USER = 'ticket4u_user';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function readUser() {
    try { return JSON.parse(localStorage.getItem(STORAGE_USER) || 'null'); } catch (_) { return null; }
  }
  function token() { return localStorage.getItem(STORAGE_TOKEN) || ''; }
  function normaliseRole(value) {
    const role = String(value || '').toLowerCase().trim();
    if (['admin','administrator','system_admin'].includes(role)) return 'admin';
    if (['organiser','organizer','event_organiser','event_organizer'].includes(role)) return 'organiser';
    if (['customer','user'].includes(role)) return 'customer';
    return role || 'customer';
  }
  function storeSession(jwt, user) {
    if (!jwt) throw new Error('The API response did not contain a JWT token.');
    localStorage.setItem(STORAGE_TOKEN, jwt);
    if (user) localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
  }
  function dataOf(payload) {
    return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
  }
  function listOf(payload) {
    const data = dataOf(payload);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      for (const key of ['items','results','records','events','venues','bookings','notifications','users','availability','unavailability','venue_unavailability','slots','categories','payments']) {
        if (Array.isArray(data[key])) return data[key];
      }
    }
    return [];
  }
  async function request(path, options = {}) {
    if (!API_BASE) throw new Error('The API URL is empty. Check includes/config.php.');
    const headers = Object.assign({Accept:'application/json'}, options.headers || {});
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const jwt = token();
    if (options.auth !== false && jwt) headers.Authorization = `Bearer ${jwt}`;
    const method = options.method || 'GET';
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 12000;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let raw;
    try {
      response = await fetch(API_BASE + (path.startsWith('/') ? path : '/' + path), {
        method, headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache:'no-store', signal:controller.signal
      });
      raw = await response.text();
    } catch (cause) {
      if (cause && cause.name === 'AbortError') {
        throw new Error(`The API did not respond within ${Math.round(timeoutMs / 1000)} seconds (${method} ${path}). Check that Apache is running and that includes/config.php points to the correct backend URL.`);
      }
      throw new Error(`Could not connect to the API at ${API_BASE}. Start Apache and MySQL and check the backend URL in includes/config.php.`);
    } finally {
      window.clearTimeout(timeoutId);
    }
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch (_) { payload = {message: raw.slice(0, 400) || `HTTP ${response.status}`}; }
    if (!response.ok || payload.success === false) {
      let message = payload.message || payload.error || `Request failed (HTTP ${response.status}).`;
      const errors = payload.errors;
      if (errors && typeof errors === 'object') {
        const detail = Object.values(errors).flat().filter(Boolean).join(' ');
        if (detail) message += ' ' + detail;
      }
      if (response.status === 401 && options.auth !== false && jwt) {
        clearSession();
        if (document.body.dataset.requiresAuth === 'true') {
          window.location.href = 'login.php';
        }
      }
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }
  function notify(message, type = 'success') {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<b>${type === 'error' ? '!' : type === 'info' ? 'i' : '✓'}</b><span>${escapeHtml(message)}</span>`;
    region.appendChild(el);
    window.setTimeout(() => el.remove(), 4200);
  }
  function setNotice(message, type = 'info') {
    const area = document.getElementById('notice-area');
    if (!area) return;
    area.innerHTML = message ? `<div class="notice ${escapeHtml(type)}">${escapeHtml(message)}</div>` : '';
  }
  function fmtMoney(value) {
    const n = Number(value || 0);
    return `RM ${n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  }
  function fmtDate(value, withTime = false) {
    if (!value) return 'Date not set';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-MY', withTime
      ? {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}
      : {day:'2-digit',month:'short',year:'numeric'});
  }
  function fmtDateTile(value) {
    const date = new Date(String(value || '').replace(' ', 'T'));
    if (!value || Number.isNaN(date.getTime())) return {day:'—',month:'TBA'};
    return {day:date.getDate(),month:date.toLocaleString('en-MY',{month:'short'})};
  }
  function badge(value) {
    const text = String(value || 'unknown').toLowerCase().replaceAll('_',' ');
    let type = 'gray';
    if (['confirmed','paid','available','active','read','refunded','completed'].includes(text)) type = 'green';
    else if (['pending','refund pending','unread'].includes(text)) type = 'amber';
    else if (['cancelled','canceled','failed','inactive','rejected'].includes(text)) type = 'red';
    else if (['approved'].includes(text)) type = 'blue';
    return `<span class="badge ${type}">${escapeHtml(text)}</span>`;
  }
  function itemId(item, keys = ['id']) {
    if (!item) return '';
    for (const key of keys) if (item[key] !== undefined && item[key] !== null) return item[key];
    return '';
  }
  function showDialog(title, content, wide = false) {
    const root = document.getElementById('dialog-root');
    if (!root) return;
    root.innerHTML = `<div class="dialog-backdrop" data-dialog-backdrop><section class="dialog ${wide?'wide':''}" role="dialog" aria-modal="true"><header class="dialog-header"><div><h2>${escapeHtml(title)}</h2></div><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header><div class="dialog-body">${content}</div></section></div>`;
  }
  function closeDialog() {
    const root = document.getElementById('dialog-root');
    if (root) root.innerHTML = '';
  }
  function textField(label, name, value = '', type = 'text', attributes = '') {
    const id = `field-${name.replace(/[^a-z0-9_-]/gi,'-')}`;
    return `<div class="form-field"><label for="${escapeHtml(id)}">${escapeHtml(label)}</label><input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${attributes}></div>`;
  }
  function areaField(label, name, value = '', attributes = '') {
    const id = `field-${name.replace(/[^a-z0-9_-]/gi,'-')}`;
    return `<div class="form-field"><label for="${escapeHtml(id)}">${escapeHtml(label)}</label><textarea id="${escapeHtml(id)}" name="${escapeHtml(name)}" ${attributes}>${escapeHtml(value)}</textarea></div>`;
  }
  function selectField(label, name, options, current = '', attributes = '') {
    const id = `field-${name.replace(/[^a-z0-9_-]/gi,'-')}`;
    return `<div class="form-field"><label for="${escapeHtml(id)}">${escapeHtml(label)}</label><select id="${escapeHtml(id)}" name="${escapeHtml(name)}" ${attributes}>${options.map(option=>`<option value="${escapeHtml(option.value)}" ${String(option.value)===String(current)?'selected':''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
  }
  function showLoadError(target, message) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return;
    element.innerHTML = `<div class="load-error"><strong>Could not load this section</strong><p>${escapeHtml(message || 'Please check the API connection and try again.')}</p><button class="btn btn-muted btn-small" type="button" data-retry-page>Try again</button></div>`;
  }
  function pageHeading(subtitle, actions = '') {
    const target = document.getElementById('page-subtitle');
    const actionTarget = document.getElementById('page-actions');
    if (target) target.textContent = subtitle || '';
    if (actionTarget) actionTarget.innerHTML = actions || '';
  }
  async function getBookingQr(bookingId) {
    const jwt = token();
    if (!jwt) throw new Error('Please log in again before opening your ticket QR code.');
    const response = await fetch(`../qr-proxy.php?booking_id=${encodeURIComponent(bookingId)}`, {
      method: 'GET',
      headers: {Accept: 'application/json', Authorization: `Bearer ${jwt}`},
      cache: 'no-store'
    });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch (_) { payload = {message: raw || `Request failed (HTTP ${response.status}).`}; }
    if (!response.ok || payload.success === false) throw new Error(payload.message || `QR request failed (HTTP ${response.status}).`);
    return payload;
  }
  function currentRole() { const user = readUser() || {}; return normaliseRole(user.role || user.user_role); }
  function currentUser() { return readUser() || {}; }
  function currentUserId() { const u = currentUser(); return u.id ?? u.user_id ?? u.sub ?? ''; }
  function currentUserName() { const u = currentUser(); return u.name || u.full_name || u.username || u.email || 'Account'; }
  function isAdmin() { return currentRole() === 'admin'; }
  function isOrganiser() { return currentRole() === 'organiser'; }
  function isStaff() { return ['admin','organiser'].includes(currentRole()); }
  function isCustomer() { return currentRole() === 'customer'; }
  function eventTitle(item) { return item && (item.title || item.event_title || (item.event && item.event.title)) || 'Untitled event'; }
  function venueName(item) { return item && (item.name || item.venue_name || item.title) || 'Venue'; }
  function categoryName(item) { return item && (item.category_name || item.name || item.title) || 'General'; }
  function bookingEventTitle(item) { return item && (item.event_title || item.title || (item.event && item.event.title) || (item.event_details && item.event_details.title)) || `Event #${item && item.event_id || ''}`; }
  function bookingStatus(item) { return item && (item.booking_status || item.status) || 'pending'; }
  function paymentStatus(item) { return item && (item.payment_status || (item.payment && item.payment.status)) || '—'; }
  function paymentId(item) {
    return item && (item.payment_id || (item.payment && (item.payment.id || item.payment.payment_id)) || (Array.isArray(item.payments) && item.payments[0] && (item.payments[0].id || item.payments[0].payment_id))) || '';
  }
  function amountOf(item) { return Number(item && (item.total_amount ?? item.total_price ?? item.amount ?? (item.payment && item.payment.amount)) || 0); }

  window.Ticket4uAPI = {request,dataOf,listOf,notify,setNotice,showLoadError,escapeHtml,fmtMoney,fmtDate,fmtDateTile,badge,itemId,showDialog,closeDialog,textField,areaField,selectField,pageHeading,currentRole,currentUser,currentUserId,currentUserName,isAdmin,isOrganiser,isStaff,isCustomer,eventTitle,venueName,categoryName,bookingEventTitle,bookingStatus,paymentStatus,paymentId,amountOf,normaliseRole,storeSession,clearSession,token,readUser,getBookingQr,apiBase:API_BASE};
})();
