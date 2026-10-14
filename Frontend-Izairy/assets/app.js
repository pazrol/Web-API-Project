(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const appRoot = $('#app');
  const state = {
    page: 'dashboard', token: localStorage.getItem('eventra_token') || '',
    user: readStoredUser(), apiBase: (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || 'http://localhost/event-ticketing-backend/api',
    events: [], venues: [], categories: [], bookings: [], notifications: [], users: [], availability: [],
    selectedVenueId: '', eventSearch: '', lastPayment: null, loading: false
  };

  function readStoredUser() {
    try { return JSON.parse(localStorage.getItem('eventra_user') || 'null'); } catch (_) { return null; }
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function normaliseRole(value) {
    const role = String(value || '').toLowerCase().trim();
    if (['admin','administrator','system_admin'].includes(role)) return 'admin';
    if (['organiser','organizer','event_organiser','event_organizer'].includes(role)) return 'organiser';
    if (role === 'customer' || role === 'user') return 'customer';
    return role || 'customer';
  }
  function decodeToken(token) {
    try {
      const part = String(token).split('.')[1];
      if (!part) return {};
      const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
      return JSON.parse(decodeURIComponent(escape(atob(padded))));
    } catch (_) { return {}; }
  }
  function saveSession(token, user) {
    state.token = token;
    state.user = user || {};
    localStorage.setItem('eventra_token', token);
    localStorage.setItem('eventra_user', JSON.stringify(state.user));
  }
  function clearSession() {
    state.token = ''; state.user = null;
    localStorage.removeItem('eventra_token'); localStorage.removeItem('eventra_user');
  }
  function userRole() { return normaliseRole(state.user && (state.user.role || state.user.user_role)); }
  function isAdmin() { return userRole() === 'admin'; }
  function isStaff() { return ['admin','organiser'].includes(userRole()); }
  function isCustomer() { return userRole() === 'customer'; }
  function currentUserId() {
    const u = state.user || {};
    return u.id ?? u.user_id ?? u.sub ?? u.userId ?? '';
  }
  function currentUserName() {
    const u = state.user || {};
    return u.name || u.full_name || u.username || u.email || 'Account';
  }
  function toast(message, kind = 'success') {
    const region = $('#toast-region'); if (!region) return;
    const el = document.createElement('div'); el.className = `toast ${kind}`;
    const symbol = kind === 'error' ? '!' : kind === 'info' ? 'i' : '✓';
    el.innerHTML = `<strong>${symbol}</strong><span>${escapeHtml(message)}</span>`;
    region.appendChild(el); setTimeout(() => el.remove(), 4200);
  }
  class ApiError extends Error {
    constructor(message, status, payload) { super(message); this.name = 'ApiError'; this.status = status; this.payload = payload; }
  }
  function apiUrl(path) {
    const base = state.apiBase.replace(/\/+$/, '');
    return base + (path.startsWith('/') ? path : '/' + path);
  }
  async function apiRequest(path, options = {}) {
    const method = options.method || 'GET';
    const headers = Object.assign({}, options.headers || {});
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.auth !== false && state.token) headers.Authorization = `Bearer ${state.token}`;
    let response;
    try {
      response = await fetch(apiUrl(path), {
        method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store'
      });
    } catch (_) {
      throw new ApiError(`Could not connect to the API at ${state.apiBase}. Check that Apache and MySQL are running and that the local API URL is correct.`, 0, null);
    }
    let payload;
    const text = await response.text();
    try { payload = text ? JSON.parse(text) : {}; }
    catch (_) { payload = { message: text.slice(0, 500) || `HTTP ${response.status}` }; }
    if (!response.ok || payload.success === false) {
      let message = payload.message || payload.error || `Request failed (HTTP ${response.status}).`;
      if (payload.errors && typeof payload.errors === 'object') {
        const details = Object.values(payload.errors).flat().filter(Boolean).join(' ');
        if (details) message += ` ${details}`;
      }
      if (response.status === 401 && options.auth !== false && state.token) {
        clearSession();
        if (!$('#auth-screen')) renderAuth('login');
        toast('Your session has expired. Please sign in again.', 'error');
      }
      throw new ApiError(message, response.status, payload);
    }
    return payload;
  }
  function responseData(payload) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
    return payload;
  }
  function responseList(payload) {
    const data = responseData(payload);
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    for (const key of ['items','results','records','events','venues','bookings','notifications','users','availability','categories','payments']) {
      if (Array.isArray(data[key])) return data[key];
    }
    return [];
  }
  async function safeList(path) {
    try { return responseList(await apiRequest(path)); } catch (_) { return []; }
  }
  function itemId(item, type = '') {
    if (!item) return '';
    const candidates = type === 'event' ? ['id','event_id'] : type === 'venue' ? ['id','venue_id'] : type === 'user' ? ['id','user_id'] : type === 'booking' ? ['id','booking_id'] : type === 'availability' ? ['id','availability_id'] : type === 'category' ? ['id','category_id'] : type === 'notification' ? ['id','notification_id'] : type === 'payment' ? ['id','payment_id'] : ['id'];
    for (const k of candidates) if (item[k] !== undefined && item[k] !== null) return item[k];
    return '';
  }
  function eventTitle(e) { return e && (e.title || e.event_title || (e.event && e.event.title)) || 'Untitled event'; }
  function venueName(v) { return v && (v.name || v.venue_name || v.title) || 'Venue'; }
  function categoryName(c) { return c && (c.category_name || c.name || c.title) || 'General'; }
  function bookingEventTitle(b) { return b && (b.event_title || b.title || (b.event && b.event.title) || (b.event_details && b.event_details.title)) || `Event #${b && (b.event_id || '')}`; }
  function bookingVenue(b) { return b && (b.venue_name || (b.event && b.event.venue_name) || 'Venue details not provided'); }
  function bookingStatus(b) { return b && (b.booking_status || b.status || 'pending'); }
  function paymentStatus(b) { return b && (b.payment_status || (b.payment && b.payment.status) || '—'); }
  function paymentIdOf(b) { return b && (b.payment_id || (b.payment && (b.payment.id || b.payment.payment_id)) || (Array.isArray(b.payments) && b.payments[0] && (b.payments[0].id || b.payments[0].payment_id))) || ''; }
  function amountOf(b) { return Number(b && (b.total_amount ?? b.total_price ?? b.amount ?? (b.payment && b.payment.amount)) || 0); }
  function fmtMoney(value) { const n = Number(value); return `RM ${Number.isFinite(n) ? n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}) : '0.00'}`; }
  function fmtDate(value, withTime = false) {
    if (!value) return 'Date not set';
    const raw = String(value).replace(' ', 'T');
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(value);
    const options = withTime ? {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'} : {day:'2-digit',month:'short',year:'numeric'};
    return d.toLocaleString('en-MY', options);
  }
  function fmtDateTile(value) {
    if (!value) return {day:'—',month:'TBA'};
    const d = new Date(String(value).replace(' ','T'));
    if (Number.isNaN(d.getTime())) return {day:'—',month:'TBA'};
    return {day:d.getDate(),month:d.toLocaleString('en-MY',{month:'short'})};
  }
  function fieldValue(obj, keys, fallback = '') {
    for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    return fallback;
  }
  function statusBadge(status) {
    const value = String(status || 'unknown').toLowerCase().replaceAll('_',' ');
    let color = 'gray';
    if (['confirmed','paid','available','active','read','refunded'].includes(value)) color = 'green';
    else if (['pending','refund pending','unread'].includes(value)) color = 'amber';
    else if (['cancelled','canceled','failed','inactive','rejected'].includes(value)) color = 'red';
    else if (['completed','approved'].includes(value)) color = 'blue';
    else if (value === 'unknown') color = 'gray';
    return `<span class="badge ${color}">${escapeHtml(value)}</span>`;
  }
  function emptyState(icon, title, text, button = '') {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p>${button ? `<div style="margin-top:16px">${button}</div>` : ''}</div>`;
  }
  function pageTitle(title, description, actions = '') {
    return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
  }

  function renderAuth(mode = 'login', error = '') {
    document.body.classList.remove('app-view');
    const signup = mode === 'signup';
    appRoot.innerHTML = `
      <main class="auth-screen" id="auth-screen">
        <section class="auth-panel">
          <header class="auth-brand-row">
            <span class="brand-mark">E</span>
            <div><strong>Eventra</strong><small>Event ticketing & venue booking</small></div>
          </header>
          <div class="auth-heading">
            <p class="auth-overline">YOUR EVENT SPACE</p>
            <h1>${signup ? 'Create an account' : 'Sign in to Eventra'}</h1>
            <p class="auth-lead">${signup ? 'Use your details to get started. Your access follows the role you register for.' : 'Sign in to view events, manage bookings and continue where you left off.'}</p>
          </div>
          <div class="auth-tabs"><button type="button" class="${signup ? '' : 'active'}" data-auth-mode="login">Sign in</button><button type="button" class="${signup ? 'active' : ''}" data-auth-mode="signup">Create account</button></div>
          <div id="auth-error" class="auth-error ${error ? 'show' : ''}" role="alert">${escapeHtml(error)}</div>
          <form id="${signup ? 'signup-form' : 'login-form'}" novalidate>
            ${signup ? `<div class="form-field"><label for="signup-name">Full name</label><input id="signup-name" name="name" autocomplete="name" placeholder="Enter your full name" maxlength="100" required></div>` : ''}
            <div class="form-field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="name@example.com" maxlength="190" required></div>
            ${signup ? `<div class="form-field"><label for="signup-role">Account role</label><select id="signup-role" name="role" required><option value="customer">Customer</option><option value="organiser">Organiser</option><option value="admin">Admin</option></select><small class="field-hint">Choose the role that matches your access. Admin and Organiser registrations need an authorised reference key.</small></div>` : ''}
            <div class="form-field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'At least 8 characters' : 'Enter your password'}" minlength="${signup ? '8' : '1'}" required></div>
            ${signup ? `<div class="form-field"><label for="signup-confirm">Confirm password</label><input id="signup-confirm" name="confirm" type="password" autocomplete="new-password" placeholder="Enter the password again" minlength="8" required></div><div class="form-field hidden" id="signup-reference-wrap"><label for="signup-reference">Role reference key</label><input id="signup-reference" name="reference_key" type="password" autocomplete="off" placeholder="Enter the authorised reference key"><small class="field-hint" id="signup-reference-hint">This key is checked by the backend before an account is created.</small></div>` : `<div class="auth-helper-row"><span>Use your registered email and password.</span><span>Secure sign-in</span></div>`}
            <button class="btn btn-primary btn-block" type="submit" id="auth-submit">${signup ? 'Create account' : 'Sign in'}</button>
          </form>
          <p class="auth-fineprint">${signup ? 'Account details are saved to the project database through the backend API.' : 'Your account permissions are managed by the system.'}</p>
        </section>
        <footer class="auth-page-footer">Eventra <span>·</span> Event Ticketing & Venue Booking System</footer>
      </main>`;
  }

  const navItems = [
    {id:'dashboard', icon:'▦', label:'Overview', group:'WORKSPACE', roles:['admin','organiser','customer']},
    {id:'events', icon:'✦', label:'Events', roles:['admin','organiser','customer']},
    {id:'venues', icon:'⌂', label:'Venues', roles:['admin','organiser']},
    {id:'availability', icon:'◷', label:'Venue availability', roles:['admin','organiser']},
    {id:'bookings', icon:'▤', label:'Bookings', roles:['admin','organiser','customer']},
    {id:'payments', icon:'↗', label:'Payments & refunds', roles:['admin','organiser','customer']},
    {id:'notifications', icon:'♧', label:'Notifications', roles:['admin','organiser','customer']},
    {id:'users', icon:'♙', label:'User management', roles:['admin'], group:'ADMINISTRATION'},
  ];
  function renderShell() {
    const role = userRole();
    const items = navItems.filter(item => item.roles.includes(role));
    let lastGroup = '';
    const navHtml = items.map(item => {
      const label = item.group && item.group !== lastGroup ? `<div class="nav-label">${escapeHtml(item.group)}</div>` : '';
      if (item.group) lastGroup = item.group;
      return `${label}<button type="button" class="nav-item ${state.page === item.id ? 'active' : ''}" data-navigate="${item.id}"><span class="nav-icon">${item.icon}</span><span>${escapeHtml(item.label)}</span>${item.id === 'notifications' && state.notifications.some(n => !Number(n.is_read)) ? '<span class="badge purple" style="margin-left:auto;padding:4px 6px">NEW</span>' : ''}</button>`;
    }).join('');
    const initials = currentUserName().split(/[\s@._-]+/).filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('') || 'E';
    appRoot.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand"><span class="brand-mark">E</span><span>eventra<span style="color:var(--purple)">.</span><small class="brand-sub">EVENTS & VENUE BOOKING</small></span></div>
          <nav class="sidebar-nav">${navHtml}</nav>
          <div class="sidebar-spacer"></div>
          <div class="sidebar-help"><strong>Manage your events</strong><p>Events, venues and bookings in one place.</p><button type="button" class="btn btn-secondary btn-small" data-navigate="events">Explore events ↗</button></div>
          <div class="sidebar-footer"><div class="avatar">${escapeHtml(initials)}</div><div class="user-brief"><strong>${escapeHtml(currentUserName())}</strong><small>${escapeHtml(role)}</small></div><button class="logout-icon" type="button" title="Sign out" data-action="logout">↪</button></div>
        </aside>
        <div id="sidebar-backdrop" class="sidebar-backdrop hidden"></div>
        <section class="main-area">
          <header class="topbar"><div class="topbar-left"><button class="mobile-menu" type="button" data-action="toggle-menu" aria-label="Open navigation">☰</button><div class="crumb">Workspace <span style="padding:0 8px;color:#c5c7ce">/</span> <strong>${escapeHtml((navItems.find(n=>n.id===state.page)||{label:'Overview'}).label)}</strong></div></div><div class="topbar-right"><span class="health-chip"><span class="health-dot"></span> Workspace</span><span class="topbar-date">${new Date().toLocaleDateString('en-MY',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</span><div class="avatar" style="height:34px;width:34px;flex-basis:34px;border-radius:11px">${escapeHtml(initials)}</div></div></header>
          <main class="page-wrap"><div id="page-content"><div class="panel"><div class="skeleton" style="width:32%;margin-bottom:15px"></div><div class="skeleton" style="width:55%;height:28px;margin-bottom:30px"></div><div class="skeleton" style="height:180px"></div></div></div><div class="footer-note">Eventra · Event ticketing and venue booking</div></main>
        </section>
      </div>`;
  }

  function renderPageHeadingAndActions(page) {
    if (page === 'dashboard') return pageTitle('Overview', `Welcome back, ${currentUserName()}. Here’s what is happening in your workspace.`, `<button class="btn btn-primary" data-navigate="events">Explore events <span>→</span></button>`);
    if (page === 'events') return pageTitle('Events', 'Find upcoming events or manage event details and ticket capacity.', isStaff() ? '<button class="btn btn-primary" data-action="new-event">＋ Create event</button>' : '');
    if (page === 'venues') return pageTitle('Venues', 'Manage event spaces, venue details and capacity.', '<button class="btn btn-primary" data-action="new-venue">＋ Add venue</button>');
    if (page === 'availability') return pageTitle('Venue availability', 'Set available dates and time slots for each venue.', '<button class="btn btn-primary" data-action="new-availability">＋ Add time slot</button>');
    if (page === 'bookings') return pageTitle('Bookings', 'Review ticket bookings and keep each booking status up to date.');
    if (page === 'payments') return pageTitle('Payments & refunds', 'Review payment details and follow the refund workflow.', isAdmin() ? '<button class="btn btn-muted" data-action="payment-lookup">⌕ Find payment</button>' : '<button class="btn btn-muted" data-action="payment-lookup">⌕ Find payment</button>');
    if (page === 'notifications') return pageTitle('Notifications', 'Read important updates or send a message to a customer.', isStaff() ? '<button class="btn btn-primary" data-action="new-notification">＋ Send notification</button>' : '');
    if (page === 'users') return pageTitle('User management', 'Manage customer and staff accounts with role-based access.', '<button class="btn btn-primary" data-action="new-user">＋ Add user</button>');
    return '';
  }

  async function loadPage(page) {
    if (!state.token) { renderAuth('login'); return; }
    state.page = page;
    renderShell();
    const target = $('#page-content');
    if (!target) return;
    try {
      if (page === 'dashboard') await loadDashboardData();
      if (page === 'events') await loadEventsData();
      if (page === 'venues') state.venues = await safeList('/venues?page=1&per_page=100');
      if (page === 'availability') {
        state.venues = await safeList('/venues?page=1&per_page=100');
        if (!state.selectedVenueId && state.venues.length) state.selectedVenueId = String(itemId(state.venues[0], 'venue'));
        await loadAvailabilityData();
      }
      if (page === 'bookings') state.bookings = await safeList('/bookings?page=1&per_page=100');
      if (page === 'payments') state.bookings = await safeList('/bookings?page=1&per_page=100');
      if (page === 'notifications') state.notifications = await safeList('/notifications?page=1&per_page=100');
      if (page === 'users') state.users = await safeList('/users?page=1&per_page=100');
    } catch (error) {
      toast(error.message || 'Could not load this page.', 'error');
    }
    if (state.page === page && $('#page-content')) $('#page-content').innerHTML = renderPageContent(page);
  }
  async function loadDashboardData() {
    const [events, bookings, venues, notifications] = await Promise.all([
      safeList('/events?page=1&per_page=100'),
      safeList('/bookings?page=1&per_page=100'),
      isStaff() ? safeList('/venues?page=1&per_page=100') : Promise.resolve([]),
      safeList('/notifications?page=1&per_page=100')
    ]);
    state.events = events; state.bookings = bookings; state.venues = venues; state.notifications = notifications;
  }
  async function loadEventsData() {
    const suffix = state.eventSearch ? `?search=${encodeURIComponent(state.eventSearch)}&page=1&per_page=100` : '?page=1&per_page=100';
    const [events, categories, venues] = await Promise.all([
      safeList('/events' + suffix), safeList('/categories'), isStaff() ? safeList('/venues?page=1&per_page=100') : Promise.resolve([])
    ]);
    state.events = events; state.categories = categories; if (isStaff()) state.venues = venues;
  }
  async function loadAvailabilityData() {
    if (!state.selectedVenueId) { state.availability = []; return; }
    try { state.availability = responseList(await apiRequest(`/venues/${encodeURIComponent(state.selectedVenueId)}/availability`)); }
    catch (error) { state.availability = []; if (error.status !== 404) toast(error.message, 'error'); }
  }

  function renderPageContent(page) {
    return `${renderPageHeadingAndActions(page)}${page === 'dashboard' ? renderDashboard() : page === 'events' ? renderEvents() : page === 'venues' ? renderVenues() : page === 'availability' ? renderAvailability() : page === 'bookings' ? renderBookings() : page === 'payments' ? renderPayments() : page === 'notifications' ? renderNotifications() : page === 'users' ? renderUsers() : ''}`;
  }

  function renderDashboard() {
    const unread = state.notifications.filter(n => !Number(n.is_read)).length;
    const bookingCount = state.bookings.length;
    const eventCount = state.events.length;
    const venueCount = isStaff() ? state.venues.length : '—';
    const stats = [
      ['Events', eventCount, 'Available in the API', '✦'],
      ['Venues', venueCount, isStaff() ? 'Managed venue spaces' : 'Venue data is managed by staff', '⌂'],
      ['Bookings', bookingCount, isCustomer() ? 'Your bookings' : 'Bookings visible to your role', '▤'],
      ['Unread updates', unread, 'Notifications waiting for you', '♧']
    ];
    const recentEvents = state.events.slice().sort((a,b)=>new Date(String(a.start_datetime||'').replace(' ','T'))-new Date(String(b.start_datetime||'').replace(' ','T'))).slice(0,4);
    const quick = [
      ['events','✦','Browse events','Search events and ticket availability'],
      ...(isCustomer() ? [['bookings','▤','My bookings','Review your ticket details']] : [['venues','⌂','Manage venues','Keep venue information updated']]),
      ['notifications','♧','Notifications','See booking and event updates'],
      ['payments','↗','Payments','Check payment and refund status']
    ];
    return `
      <div class="stats-grid">${stats.map(s=>`<div class="stat-card"><div class="stat-top"><span>${escapeHtml(s[0])}</span><span class="stat-icon">${s[3]}</span></div><div class="stat-number">${escapeHtml(s[1])}</div><div class="stat-foot">${escapeHtml(s[2])}</div></div>`).join('')}</div>
      <div class="dashboard-grid">
        <section class="panel"><div class="panel-title"><div><h3>Upcoming events</h3><p>Discover what is coming up next.</p></div><button class="btn btn-muted btn-small" data-navigate="events">View all →</button></div>
          ${recentEvents.length ? `<div class="event-mini-list">${recentEvents.map(e=>{const tile=fmtDateTile(e.start_datetime);return `<div class="event-mini"><div class="date-tile"><b>${tile.day}</b><small>${escapeHtml(tile.month)}</small></div><div class="event-mini-info"><strong>${escapeHtml(eventTitle(e))}</strong><small>${escapeHtml(e.venue_name || venueName(state.venues.find(v=>String(itemId(v,'venue'))===String(e.venue_id))) || 'Venue details')} · ${fmtDate(e.start_datetime,true)}</small></div><div class="event-mini-price">${fmtMoney(e.ticket_price)}</div></div>`}).join('')}</div>` : emptyState('✦','No events available yet','Once event data is available from your API, it will appear here.','<button class="btn btn-primary btn-small" data-navigate="events">Open events</button>')}
        </section>
        <section class="panel"><div class="panel-title"><div><h3>Quick actions</h3><p>Jump straight to the next task.</p></div></div><div class="quick-grid">${quick.map(q=>`<button class="quick-action" data-navigate="${q[0]}"><span class="quick-icon">${q[1]}</span><span><strong>${q[2]}</strong><small>${q[3]}</small></span></button>`).join('')}</div><div class="callout" style="margin-top:17px"><span class="callout-symbol">✧</span><p><strong>Access based on your role.</strong><br>Your menu and available actions reflect Admin, Organiser or Customer permissions. The API remains responsible for enforcing each permission.</p></div></section>
      </div>
      <section class="panel" style="margin-top:18px"><div class="panel-title"><div><h3>Latest bookings</h3><p>Recent booking activity available to your account.</p></div><button class="btn btn-muted btn-small" data-navigate="bookings">View bookings →</button></div>${renderBookingTable(state.bookings.slice(0,5), true)}</section>`;
  }

  function renderEvents() {
    const actions = isStaff() ? '<button class="btn btn-primary btn-small" data-action="new-event">＋ New event</button>' : '';
    return `<div class="toolbar"><div class="toolbar-left"><form id="event-search-form" class="toolbar-search"><span>⌕</span><input name="search" value="${escapeHtml(state.eventSearch)}" placeholder="Search events by title…"><button class="btn btn-ghost btn-small" type="submit">Search</button></form></div><div class="toolbar-right"><span class="panel-note">${state.events.length} event${state.events.length===1?'':'s'} loaded</span>${actions}</div></div>
      ${state.events.length ? `<div class="events-grid">${state.events.map((e,i)=>renderEventCard(e,i)).join('')}</div>` : emptyState('✦',state.eventSearch?'No matching events':'No events found',state.eventSearch?'Try a different search term.':'The API returned no events. Check the database seed data or create an event if your role allows it.',isStaff()?'<button class="btn btn-primary btn-small" data-action="new-event">Create an event</button>':'')}`;
  }
  function renderEventCard(e, index) {
    const start = e.start_datetime || e.start_date || e.event_date;
    const date = fmtDateTile(start);
    const available = fieldValue(e,['available_tickets','tickets_available','remaining_tickets'],'—');
    const total = fieldValue(e,['total_tickets','ticket_capacity'],'—');
    const price = e.ticket_price ?? e.price ?? 0;
    const category = e.category_name || categoryName(state.categories.find(c=>String(itemId(c,'category'))===String(e.category_id)));
    const coverClass = ['','alt-blue','alt-pink','alt-teal','alt-orange'][index%5];
    const venue = e.venue_name || venueName(state.venues.find(v=>String(itemId(v,'venue'))===String(e.venue_id)));
    return `<article class="event-card"><div class="event-cover ${coverClass}"><span class="cover-kicker">${escapeHtml(category)}</span><span class="cover-date">${escapeHtml(date.month)} ${escapeHtml(date.day)}</span></div><div class="event-content"><h3>${escapeHtml(eventTitle(e))}</h3><p>${escapeHtml(e.description || 'Join this event and make it a memorable experience.')}</p><div class="event-meta"><div class="event-meta-row"><span>◷ Date & time</span><span>${escapeHtml(fmtDate(start,true))}</span></div><div class="event-meta-row"><span>⌂ Venue</span><span>${escapeHtml(venue)}</span></div><div class="event-meta-row"><span>▤ Tickets left</span><span>${escapeHtml(available)}${total!=='—'?` / ${escapeHtml(total)}`:''}</span></div></div><div class="event-card-footer"><div class="event-price">${fmtMoney(price)}<small>per ticket</small></div><div class="table-actions">${isCustomer()?`<button class="btn btn-primary btn-small" data-action="book-event" data-id="${escapeHtml(itemId(e,'event'))}" ${Number(available)===0?'disabled':''}>Book tickets</button>`:''}${isStaff()?`<button class="btn btn-secondary btn-small" data-action="edit-event" data-id="${escapeHtml(itemId(e,'event'))}">Edit</button><button class="btn btn-ghost btn-small" title="Delete event" data-action="delete-event" data-id="${escapeHtml(itemId(e,'event'))}">⋯</button>`:''}</div></div></div></article>`;
  }

  function renderVenues() {
    if (!state.venues.length) return emptyState('⌂','No venues found','Add a venue to connect it to upcoming events.','<button class="btn btn-primary btn-small" data-action="new-venue">＋ Add venue</button>');
    return `<section class="panel"><div class="panel-title"><div><h3>Venue directory</h3><p>Venue name, location and capacity.</p></div><span class="badge purple">${state.venues.length} locations</span></div><div class="table-wrap"><table><thead><tr><th>Venue</th><th>Address</th><th>Capacity</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${state.venues.map(v=>`<tr><td><span class="table-primary">${escapeHtml(venueName(v))}</span><span class="table-sub">Venue ID: ${escapeHtml(itemId(v,'venue'))}</span></td><td>${escapeHtml(v.address || '—')}</td><td>${escapeHtml(v.capacity ?? '—')} people</td><td>${escapeHtml(v.description || '—')}</td><td><div class="table-actions"><button class="btn btn-secondary btn-small" data-action="venue-availability" data-id="${escapeHtml(itemId(v,'venue'))}">Availability</button><button class="btn btn-muted btn-small" data-action="edit-venue" data-id="${escapeHtml(itemId(v,'venue'))}">Edit</button><button class="btn btn-danger btn-small" data-action="delete-venue" data-id="${escapeHtml(itemId(v,'venue'))}">Delete</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function renderAvailability() {
    if (!state.venues.length) return `<section class="panel">${emptyState('◷','Add a venue first','Availability slots belong to a specific venue.','<button class="btn btn-primary btn-small" data-navigate="venues">Open venues</button>')}</section>`;
    const selected = state.venues.find(v=>String(itemId(v,'venue'))===String(state.selectedVenueId)) || state.venues[0];
    return `<section class="panel"><div class="panel-title"><div><h3>Availability schedule</h3><p>Choose a venue to view and maintain its available time slots.</p></div><span class="badge purple">${state.availability.length} slot${state.availability.length===1?'':'s'}</span></div><div class="toolbar"><div class="toolbar-left"><label style="font-size:12px;font-weight:700;color:var(--ash-600)" for="availability-venue">Venue</label><select class="select-control" id="availability-venue">${state.venues.map(v=>`<option value="${escapeHtml(itemId(v,'venue'))}" ${String(itemId(v,'venue'))===String(state.selectedVenueId)?'selected':''}>${escapeHtml(venueName(v))}</option>`).join('')}</select></div><button class="btn btn-primary btn-small" data-action="new-availability">＋ Add time slot</button></div>${state.availability.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead><tbody>${state.availability.map(a=>`<tr><td><span class="table-primary">${escapeHtml(fmtDate(a.availability_date || a.date))}</span></td><td>${escapeHtml(a.start_time || '—')}</td><td>${escapeHtml(a.end_time || '—')}</td><td>${statusBadge(a.status || 'available')}</td><td><div class="table-actions"><button class="btn btn-muted btn-small" data-action="edit-availability" data-id="${escapeHtml(itemId(a,'availability'))}">Edit</button><button class="btn btn-danger btn-small" data-action="delete-availability" data-id="${escapeHtml(itemId(a,'availability'))}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`:emptyState('◷','No availability slots yet','Add an available date and time range for this venue.','<button class="btn btn-primary btn-small" data-action="new-availability">＋ Add time slot</button>')}</section><div class="footer-note">Selected venue: ${escapeHtml(venueName(selected))}</div>`;
  }

  function renderBookingTable(bookings, compact = false) {
    if (!bookings || !bookings.length) return emptyState('▤','No bookings yet',isCustomer()?'When you book tickets, your booking details will appear here.':'Booking records will appear here when available.');
    return `<div class="table-wrap"><table><thead><tr><th>Booking</th><th>Event</th><th>Quantity</th><th>Total</th><th>Booking status</th><th>Payment</th>${compact?'':'<th>Actions</th>'}</tr></thead><tbody>${bookings.map(b=>{
      const id=itemId(b,'booking'); const code=fieldValue(b,['booking_code','code'],`BK-${id}`); const quantity=fieldValue(b,['quantity','ticket_quantity'],1); const pId=paymentIdOf(b); const status=bookingStatus(b); const pStatus=paymentStatus(b);
      const canCancel=!['cancelled','canceled','refunded'].includes(String(status).toLowerCase());
      const actions = `${isCustomer() && String(status).toLowerCase()==='pending'?`<button class="btn btn-primary btn-small" data-action="pay-booking" data-id="${escapeHtml(id)}">Pay</button>`:''}${canCancel?`<button class="btn btn-danger btn-small" data-action="cancel-booking" data-id="${escapeHtml(id)}">Cancel</button>`:''}${pId?`<button class="btn btn-muted btn-small" data-action="view-payment" data-id="${escapeHtml(pId)}">Payment</button>`:''}`;
      return `<tr><td><span class="table-primary">${escapeHtml(code)}</span><span class="table-sub">ID ${escapeHtml(id)}</span></td><td><span class="table-primary">${escapeHtml(bookingEventTitle(b))}</span><span class="table-sub">${escapeHtml(b.venue_name || '')}</span></td><td>${escapeHtml(quantity)}</td><td>${fmtMoney(amountOf(b))}</td><td>${statusBadge(status)}</td><td>${statusBadge(pStatus)}</td>${compact?'':`<td><div class="table-actions">${actions || '<span class="panel-note">No action</span>'}</div></td>`}</tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function renderBookings() {
    return `<section class="panel"><div class="panel-title"><div><h3>${isCustomer()?'My bookings':'Booking register'}</h3><p>${isCustomer()?'Only bookings belonging to your account are returned by the API.':'Records visible to your current role.'}</p></div><span class="badge purple">${state.bookings.length} record${state.bookings.length===1?'':'s'}</span></div>${renderBookingTable(state.bookings)}</section>`;
  }
  function renderPayments() {
    const rows = state.bookings.filter(b=>paymentIdOf(b) || b.payment_status || b.payment);
    return `<div class="split-panels"><section class="panel"><div class="panel-title"><div><h3>Payment records from bookings</h3><p>Use a payment ID to retrieve the full API response.</p></div><button class="btn btn-muted btn-small" data-action="payment-lookup">Find payment</button></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Booking</th><th>Event</th><th>Amount</th><th>Payment status</th><th>Action</th></tr></thead><tbody>${rows.map(b=>{const id=itemId(b,'booking'),pId=paymentIdOf(b);return `<tr><td><span class="table-primary">${escapeHtml(fieldValue(b,['booking_code','code'],`BK-${id}`))}</span></td><td>${escapeHtml(bookingEventTitle(b))}</td><td>${fmtMoney(amountOf(b))}</td><td>${statusBadge(paymentStatus(b))}</td><td>${pId?`<button class="btn btn-secondary btn-small" data-action="view-payment" data-id="${escapeHtml(pId)}">Details</button>`:'<span class="panel-note">No payment ID in response</span>'}</td></tr>`}).join('')}</tbody></table></div>`:emptyState('↗','No payment details embedded in bookings','Your API has a payment-by-ID endpoint. Use the payment ID from a successful payment response to retrieve its details.','<button class="btn btn-primary btn-small" data-action="payment-lookup">Find a payment</button>')}</section><section class="panel"><div class="panel-title"><div><h3>Refund workflow</h3><p>Refund requests are only available when the backend marks a payment as refund pending.</p></div></div><div class="callout"><span class="callout-symbol">ⓘ</span><p><strong>${isAdmin()?'Administrator access':'Role-based access'}</strong><br>${isAdmin()?'Open payment details and select Refund when the status is refund pending.':'Refund permissions are enforced by the API. If a refund action is not available to your role, ask an administrator to complete it.'}</p></div><button class="btn btn-muted" style="margin-top:18px" data-action="payment-lookup">⌕ Look up payment by ID</button></section></div>`;
  }
  function renderNotifications() {
    const list = state.notifications;
    if (!list.length) return `<section class="panel">${emptyState('♧','You are all caught up','New booking, payment and event updates will appear here.')}</section>`;
    return `<section class="panel"><div class="panel-title"><div><h3>Your notification inbox</h3><p>Notifications returned by the API for your account.</p></div><span class="badge purple">${list.filter(n=>!Number(n.is_read)).length} unread</span></div><div style="display:flex;flex-direction:column;gap:10px">${list.map(n=>{const read=Number(n.is_read)===1||n.is_read===true;const id=itemId(n,'notification');return `<article style="display:flex;gap:14px;padding:16px;border:1px solid var(--ash-200);border-radius:13px;background:${read?'#fff':'#fbf9ff'}"><div class="quick-icon" style="flex:0 0 38px">${read?'✓':'♧'}</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><strong style="font:800 13px Manrope">${escapeHtml(n.title || 'Notification')}</strong>${read?'<span class="badge gray">Read</span>':'<span class="badge purple">New</span>'}</div><p style="font-size:12px;line-height:1.7;color:var(--ash-600);margin:7px 0">${escapeHtml(n.message || '')}</p><small style="color:var(--ash-500);font-size:10px">${escapeHtml(n.notification_type || 'general')} · ${escapeHtml(fmtDate(n.created_at || n.sent_at,true))}</small></div>${read?'':`<button class="btn btn-muted btn-small" style="align-self:flex-start" data-action="read-notification" data-id="${escapeHtml(id)}">Mark read</button>`}</article>`}).join('')}</div></section>`;
  }
  function renderUsers() {
    if (!isAdmin()) return emptyState('♙','Access restricted','Only administrators can manage user accounts.');
    if (!state.users.length) return emptyState('♙','No user records returned','Check the API response or add a user.','<button class="btn btn-primary btn-small" data-action="new-user">＋ Add user</button>');
    return `<section class="panel"><div class="panel-title"><div><h3>System users</h3><p>Assign the right access role for each account.</p></div><span class="badge purple">${state.users.length} users</span></div><div class="table-wrap"><table><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead><tbody>${state.users.map(u=>`<tr><td><span class="table-primary">${escapeHtml(u.name || u.full_name || 'User')}</span><span class="table-sub">User ID: ${escapeHtml(itemId(u,'user'))}</span></td><td>${escapeHtml(u.email || '—')}</td><td>${statusBadge(normaliseRole(u.role))}</td><td>${escapeHtml(fmtDate(u.created_at))}</td><td><div class="table-actions"><button class="btn btn-muted btn-small" data-action="edit-user" data-id="${escapeHtml(itemId(u,'user'))}">Edit</button><button class="btn btn-danger btn-small" data-action="delete-user" data-id="${escapeHtml(itemId(u,'user'))}">Delete</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
  }


  function showModal(title, body, opts = {}) {
    let modalRoot = $('#modal-root');
    if (!modalRoot) { modalRoot = document.createElement('div'); modalRoot.id = 'modal-root'; appRoot.appendChild(modalRoot); }
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal ${opts.wide?'wide':''}" role="dialog" aria-modal="true"><header class="modal-header"><div><h2>${escapeHtml(title)}</h2>${opts.description?`<p>${escapeHtml(opts.description)}</p>`:''}</div><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">×</button></header><div class="modal-body">${body}</div>${opts.noFooter?'':`<footer class="modal-footer"><button class="btn btn-muted" type="button" data-action="close-modal">Cancel</button>${opts.footer || ''}</footer>`}</section></div>`;
  }
  function closeModal() { const root = $('#modal-root'); if (root) root.remove(); }
  function textInput(label, name, value = '', type = 'text', extra = '') {
    return `<div class="form-field"><label for="f-${escapeHtml(name)}">${escapeHtml(label)}</label><input id="f-${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${extra}></div>`;
  }
  function textArea(label, name, value = '', extra = '') {
    return `<div class="form-field"><label for="f-${escapeHtml(name)}">${escapeHtml(label)}</label><textarea id="f-${escapeHtml(name)}" name="${escapeHtml(name)}" ${extra}>${escapeHtml(value)}</textarea></div>`;
  }
  function selectInput(label, name, options, current = '', extra = '') {
    return `<div class="form-field"><label for="f-${escapeHtml(name)}">${escapeHtml(label)}</label><select id="f-${escapeHtml(name)}" name="${escapeHtml(name)}" ${extra}>${options.map(o=>`<option value="${escapeHtml(o.value)}" ${String(o.value)===String(current)?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
  }
  function apiDateTime(value) { return String(value || '').replace('T',' ') + (String(value || '').length === 16 ? ':00' : ''); }
  function inputDateTime(value) { return String(value || '').replace(' ','T').slice(0,16); }
  async function openEventForm(id = '') {
    if (!isStaff()) return toast('Your role cannot manage events.', 'error');
    const existing = id ? state.events.find(e=>String(itemId(e,'event'))===String(id)) || {} : {};
    state.categories = await safeList('/categories');
    state.venues = await safeList('/venues?page=1&per_page=100');
    if (isAdmin()) state.users = await safeList('/users?page=1&per_page=100');
    const cats = [{value:'',label:'Choose a category'},...state.categories.map(c=>({value:itemId(c,'category'),label:categoryName(c)}))];
    const venues = [{value:'',label:'Choose a venue'},...state.venues.map(v=>({value:itemId(v,'venue'),label:venueName(v)}))];
    const organisers = state.users.filter(u=>normaliseRole(u.role)==='organiser');
    const who = String(existing.organiser_id || currentUserId());
    const organiserField = isAdmin()
      ? (organisers.length ? selectInput('Organiser','organiser_id',[{value:'',label:'Choose an organiser'},...organisers.map(u=>({value:itemId(u,'user'),label:`${u.name || u.email} (#${itemId(u,'user')})`}))],who,'required') : textInput('Organiser user ID','organiser_id',who,'number','min="1" required'))
      : `<input type="hidden" name="organiser_id" value="${escapeHtml(currentUserId())}">`;
    const body = `<form id="event-form" data-id="${escapeHtml(id)}"><div class="form-grid">
      <div class="span-2">${textInput('Event title','title',existing.title || '','text','required maxlength="180"')}</div>
      <div class="span-2">${textArea('Description','description',existing.description || '','maxlength="1500"')}</div>
      ${selectInput('Category','category_id',cats,existing.category_id || '', 'required')}
      ${selectInput('Venue','venue_id',venues,existing.venue_id || '', 'required')}
      ${textInput('Start date & time','start_datetime',inputDateTime(existing.start_datetime),'datetime-local','required')}
      ${textInput('End date & time','end_datetime',inputDateTime(existing.end_datetime),'datetime-local','required')}
      ${textInput('Ticket price (RM)','ticket_price',existing.ticket_price ?? '0','number','min="0" step="0.01" required')}
      ${textInput('Total tickets','total_tickets',existing.total_tickets ?? '100','number','min="1" step="1" required')}
      <div class="span-2">${organiserField}</div>
      </div><p class="field-hint">Available ticket quantity is enforced by the backend. Changes to total tickets use the event update endpoint.</p><div class="modal-footer" style="padding:15px 0 0;margin-top:14px"><button class="btn btn-muted" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${id?'Save changes':'Create event'}</button></div></form>`;
    showModal(id?'Edit event':'Create event', body, {wide:true,noFooter:true,description:'Enter the details that will be saved through the Eventra API.'});
  }
  function openVenueForm(id = '') {
    if (!isStaff()) return toast('Your role cannot manage venues.', 'error');
    const existing = id ? state.venues.find(v=>String(itemId(v,'venue'))===String(id)) || {} : {};
    const body = `<form id="venue-form" data-id="${escapeHtml(id)}"><div class="form-grid"><div class="span-2">${textInput('Venue name','name',venueName(id?existing:{name:''})==='Venue'?'':venueName(existing),'text','required maxlength="180"')}</div><div class="span-2">${textInput('Address','address',existing.address || '','text','required maxlength="250"')}</div>${textInput('Capacity','capacity',existing.capacity ?? '100','number','required min="1"') }<div class="span-2">${textArea('Description','description',existing.description || '')}</div></div><div class="modal-footer" style="padding:15px 0 0;margin-top:14px"><button class="btn btn-muted" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${id?'Save venue':'Create venue'}</button></div></form>`;
    showModal(id?'Edit venue':'Add venue',body,{noFooter:true});
  }
  function openAvailabilityForm(id = '') {
    if (!isStaff()) return toast('Your role cannot manage venue availability.', 'error');
    const existing = id ? state.availability.find(a=>String(itemId(a,'availability'))===String(id)) || {} : {};
    const body = `<form id="availability-form" data-id="${escapeHtml(id)}"><div class="form-grid">${selectInput('Venue','venue_id',state.venues.map(v=>({value:itemId(v,'venue'),label:venueName(v)})),existing.venue_id || state.selectedVenueId || '')}${textInput('Availability date','availability_date',String(existing.availability_date || '').slice(0,10),'date','required')}${textInput('Start time','start_time',String(existing.start_time || '09:00').slice(0,5),'time','required')}${textInput('End time','end_time',String(existing.end_time || '17:00').slice(0,5),'time','required')}${selectInput('Status','status',[{value:'available',label:'Available'},{value:'unavailable',label:'Unavailable'}],existing.status || 'available')}</div><div class="modal-footer" style="padding:15px 0 0;margin-top:14px"><button class="btn btn-muted" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${id?'Save slot':'Add time slot'}</button></div></form>`;
    showModal(id?'Edit availability slot':'Add availability slot',body,{noFooter:true});
  }
  function openUserForm(id = '') {
    if (!isAdmin()) return toast('Only administrators can manage users.', 'error');
    const existing = id ? state.users.find(u=>String(itemId(u,'user'))===String(id)) || {} : {};
    const roleOpts = [{value:'customer',label:'Customer'},{value:'organiser',label:'Organiser'},{value:'admin',label:'Admin'}];
    const body = `<form id="user-form" data-id="${escapeHtml(id)}"><div class="form-grid">${textInput('Full name','name',existing.name || '','text','required maxlength="100"')}${textInput('Email address','email',existing.email || '','email','required maxlength="190"')}${id?'':textInput('Temporary password','password','','password','minlength="8" required')} ${selectInput('Role','role',roleOpts,existing.role || 'customer')}<div class="span-2"><p class="field-hint">For an existing user, leave password changes to the authentication process. Newly created passwords are hashed by the API.</p></div></div><div class="modal-footer" style="padding:15px 0 0;margin-top:14px"><button class="btn btn-muted" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${id?'Save user':'Create user'}</button></div></form>`;
    showModal(id?'Edit user':'Create user',body,{noFooter:true});
  }
  function openBookingForm(id) {
    if (!isCustomer()) return toast('Only customers can create bookings.', 'error');
    const event = state.events.find(e=>String(itemId(e,'event'))===String(id));
    if (!event) return toast('Event details were not found. Refresh the Events page and try again.', 'error');
    const available = Number(fieldValue(event,['available_tickets','tickets_available','remaining_tickets'],999999));
    const body = `<form id="booking-form" data-event-id="${escapeHtml(id)}"><div class="callout" style="margin-bottom:17px"><span class="callout-symbol">✦</span><p><strong>${escapeHtml(eventTitle(event))}</strong><br>${escapeHtml(fmtDate(event.start_datetime,true))} · ${fmtMoney(event.ticket_price)} per ticket · ${escapeHtml(available)} ticket(s) showing as available.</p></div>${textInput('Number of tickets','quantity','1','number',`min="1" max="${Number.isFinite(available)&&available>0?available:999}" step="1" required`)}<p class="field-hint">The API checks ticket availability and calculates the total amount when the booking is created.</p><div class="modal-footer" style="padding:15px 0 0;margin-top:14px"><button class="btn btn-muted" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Create booking</button></div></form>`;
    showModal('Book tickets',body,{noFooter:true});
  }
  function openPaymentForm(bookingId) {
    const booking = state.bookings.find(b=>String(itemId(b,'booking'))===String(bookingId));
    const eventTitleText = booking ? bookingEventTitle(booking) : `Booking #${bookingId}`;
    const body = `<form id="payment-form" data-booking-id="${escapeHtml(bookingId)}"><div class="callout" style="margin-bottom:17px"><span class="callout-symbol">↗</span><p><strong>Payment for ${escapeHtml(eventTitleText)}</strong><br>Booking #${escapeHtml(bookingId)} · ${booking?fmtMoney(amountOf(booking)):'Amount calculated by the API'}</p></div>${selectInput('Payment method','payment_method',[{value:'e_wallet',label:'E-wallet'},{value:'credit_card',label:'Credit card'},{value:'online_banking',label:'Online banking'}],'e_wallet')}<p class="field-hint">This demo records a payment through the API. It does not collect card numbers or connect to a real payment gateway.</p><div class="modal-footer" style="padding:15px 0 0;margin-top:14px"><button class="btn btn-muted" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Confirm payment</button></div></form>`;
    showModal('Complete payment',body,{noFooter:true});
  }
  function openNotificationForm() {
    if (!isStaff()) return toast('Your role cannot send notifications.', 'error');
    const eventOpts = [{value:'',label:'General notification'},...state.events.map(e=>({value:itemId(e,'event'),label:eventTitle(e)}))];
    const body = `<form id="notification-form"><div class="form-grid"><div class="span-2">${textInput('Notification title','title','','text','required maxlength="180"')}</div><div class="span-2">${textArea('Message','message','','required maxlength="1500"')}</div>${textInput('Recipient user ID (leave empty for broadcast)','recipient_id','','number','min="1"')}${selectInput('Related event (optional)','event_id',eventOpts,'')}${selectInput('Type','notification_type',[{value:'general',label:'General'},{value:'event_reminder',label:'Event reminder'},{value:'booking_update',label:'Booking update'},{value:'payment_update',label:'Payment update'}],'general')}</div><p class="field-hint">For a broadcast, leave Recipient user ID empty. Your backend must support the broadcast flag for that request.</p><div class="modal-footer" style="padding:15px 0 0;margin-top:14px"><button class="btn btn-muted" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Send notification</button></div></form>`;
    showModal('Send notification',body,{noFooter:true});
  }
  function openPaymentLookup(initialId = '') {
    const body = `<form id="payment-lookup-form"><div class="inline-form"><div class="form-field" style="margin:0;min-width:150px"><label for="payment-lookup-id">Payment ID</label><input id="payment-lookup-id" name="payment_id" type="number" min="1" value="${escapeHtml(initialId)}" placeholder="Enter payment ID" required></div><button class="btn btn-primary" type="submit">Look up</button></div></form><div id="payment-result" style="margin-top:18px">${state.lastPayment?renderPaymentDetails(state.lastPayment):'<p class="field-hint">Payment details will appear here after lookup.</p>'}</div>`;
    showModal('Find payment',body,{wide:true,description:'Retrieves one payment using GET /payments/{id}. The API applies its own role and ownership checks.'});
  }
  function renderPaymentDetails(payload) {
    const d = responseData(payload) || payload || {};
    const payment = d.payment || d;
    const id = itemId(payment,'payment') || payment.id || payment.payment_id || '—';
    const status = payment.status || payment.payment_status || 'unknown';
    const amt = payment.amount ?? payment.total_amount ?? 0;
    const booking = payment.booking_code || payment.booking_id || d.booking_code || '—';
    const method = payment.payment_method || payment.method || '—';
    const refund = payment.refund_amount ?? d.refund_amount;
    return `<div class="panel" style="padding:16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px"><div><span class="panel-note">PAYMENT ID</span><div style="font:800 24px Manrope;margin-top:5px">#${escapeHtml(id)}</div></div>${statusBadge(status)}</div><div class="form-grid"><div><span class="panel-note">Amount</span><div style="font:800 17px Manrope;margin-top:5px">${fmtMoney(amt)}</div></div><div><span class="panel-note">Payment method</span><div style="font-weight:700;margin-top:6px">${escapeHtml(method)}</div></div><div><span class="panel-note">Booking</span><div style="font-weight:700;margin-top:6px">${escapeHtml(booking)}</div></div><div><span class="panel-note">Refund amount</span><div style="font-weight:700;margin-top:6px">${refund===undefined?'—':fmtMoney(refund)}</div></div></div><div class="table-actions" style="margin-top:17px">${isAdmin() && String(status).toLowerCase().replaceAll(' ','_')==='refund_pending'?`<button class="btn btn-primary btn-small" data-action="refund-payment" data-id="${escapeHtml(id)}">Process refund</button>`:''}<button class="btn btn-muted btn-small" data-action="show-payment-json">View API JSON</button></div><pre id="payment-json" class="hidden">${escapeHtml(JSON.stringify(payload,null,2))}</pre></div>`;
  }

  async function deleteResource(path, label, reloadPage = state.page) {
    if (!confirm(`Delete this ${label}? This action cannot be undone.`)) return;
    try { await apiRequest(path,{method:'DELETE'}); closeModal(); toast(`${label[0].toUpperCase()+label.slice(1)} deleted.`); await loadPage(reloadPage); }
    catch (error) { toast(error.message,'error'); }
  }

  // Click actions and navigation are delegated so the app survives page re-renders.
  appRoot.addEventListener('click', async event => {
    const authMode = event.target.closest('[data-auth-mode]');
    if (authMode) { renderAuth(authMode.dataset.authMode); return; }
    const nav = event.target.closest('[data-navigate]');
    if (nav) { const sidebar=$('#sidebar'); if(sidebar)sidebar.classList.remove('open'); $('#sidebar-backdrop')?.classList.add('hidden'); await loadPage(nav.dataset.navigate); return; }
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action; const id = actionEl.dataset.id;
    try {
      if (action === 'toggle-menu') { $('#sidebar')?.classList.toggle('open'); $('#sidebar-backdrop')?.classList.toggle('hidden'); }
      else if (action === 'logout') { closeModal(); clearSession(); renderAuth('login'); toast('You have signed out.','info'); }
      else if (action === 'close-modal') closeModal();
      else if (action === 'backdrop-close' && event.target === actionEl) closeModal();
      else if (action === 'new-event') await openEventForm();
      else if (action === 'edit-event') await openEventForm(id);
      else if (action === 'delete-event') await deleteResource(`/events/${encodeURIComponent(id)}`,'event','events');
      else if (action === 'book-event') openBookingForm(id);
      else if (action === 'new-venue') openVenueForm();
      else if (action === 'edit-venue') openVenueForm(id);
      else if (action === 'delete-venue') await deleteResource(`/venues/${encodeURIComponent(id)}`,'venue','venues');
      else if (action === 'venue-availability') { state.selectedVenueId=String(id); await loadPage('availability'); }
      else if (action === 'new-availability') { if (!state.venues.length) state.venues=await safeList('/venues?page=1&per_page=100'); if (!state.availability.length) await loadAvailabilityData(); openAvailabilityForm(); }
      else if (action === 'edit-availability') openAvailabilityForm(id);
      else if (action === 'delete-availability') await deleteResource(`/availability/${encodeURIComponent(id)}`,'availability slot','availability');
      else if (action === 'new-user') openUserForm();
      else if (action === 'edit-user') openUserForm(id);
      else if (action === 'delete-user') { if(String(id)===String(currentUserId())) return toast('You cannot delete the account you are currently using.','error'); await deleteResource(`/users/${encodeURIComponent(id)}`,'user','users'); }
      else if (action === 'pay-booking') openPaymentForm(id);
      else if (action === 'cancel-booking') await deleteResource(`/bookings/${encodeURIComponent(id)}`,'booking','bookings');
      else if (action === 'view-payment') { try { state.lastPayment=await apiRequest(`/payments/${encodeURIComponent(id)}`); openPaymentLookup(id); } catch (error) { toast(error.message,'error'); } }
      else if (action === 'payment-lookup') openPaymentLookup();
      else if (action === 'refund-payment') {
        if (!isAdmin()) return toast('Only an administrator can process this refund in the current API workflow.','error');
        if (!confirm(`Process refund for payment #${id}?`)) return;
        const result=await apiRequest(`/payments/${encodeURIComponent(id)}/refund`,{method:'POST',body:{}}); state.lastPayment=result; toast('Refund request completed.');
        if ($('#payment-result')) $('#payment-result').innerHTML=renderPaymentDetails(result); else openPaymentLookup(id);
        await loadPage('payments');
      }
      else if (action === 'new-notification') { if (!state.events.length) state.events=await safeList('/events?page=1&per_page=100'); openNotificationForm(); }
      else if (action === 'read-notification') { await apiRequest(`/notifications/${encodeURIComponent(id)}/read`,{method:'PUT',body:{}}); toast('Notification marked as read.'); await loadPage('notifications'); }
      else if (action === 'show-payment-json') $('#payment-json')?.classList.toggle('hidden');
    } catch (error) { toast(error.message || 'Action failed.','error'); }
  });

  appRoot.addEventListener('change', async event => {
    if (event.target.id === 'signup-role') {
      const role = event.target.value;
      const wrap = $('#signup-reference-wrap');
      const input = $('#signup-reference');
      const label = wrap && wrap.querySelector('label');
      const hint = $('#signup-reference-hint');
      const needed = role !== 'customer';
      if (wrap) wrap.classList.toggle('hidden', !needed);
      if (input) { input.required = needed; if (!needed) input.value = ''; input.placeholder = role === 'admin' ? 'Enter the admin reference key' : 'Enter the organiser reference key'; }
      if (label) label.textContent = role === 'admin' ? 'Admin reference key' : 'Organiser reference key';
      if (hint) hint.textContent = role === 'admin' ? 'Admin accounts are created only when the backend verifies the admin reference key.' : 'Organiser accounts are created only when the backend verifies the organiser reference key.';
    }
    if (event.target.id === 'availability-venue') {
      state.selectedVenueId = event.target.value;
      await loadAvailabilityData();
      if ($('#page-content')) $('#page-content').innerHTML = renderPageContent('availability');
    }
  });

  appRoot.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.id) return;
    event.preventDefault();
    const fd = new FormData(form);
    const val = key => String(fd.get(key) ?? '').trim();
    const setError = (message) => {
      const target = $('#auth-error');
      if (target) { target.textContent = message; target.classList.add('show'); }
      else toast(message,'error');
    };
    try {
      if (form.id === 'login-form') {
        const button=$('#auth-submit'); button.disabled=true; button.textContent='Signing in…';
        try {
          const payload=await apiRequest('/auth/login',{method:'POST',auth:false,body:{email:val('email'),password:val('password')}});
          const data=responseData(payload)||{}; const token=data.token || data.access_token || data.jwt || payload.token;
          if(!token) throw new Error('The API response did not include a JWT token. Check POST /auth/login response format.');
          const claims=decodeToken(token); const userCandidate=data.user || data.profile || payload.user || {};
          const user=Object.assign({},claims,userCandidate);
          user.id=user.id ?? user.user_id ?? claims.user_id ?? claims.id ?? claims.sub ?? '';
          user.name=user.name || user.full_name || claims.name || val('email');
          user.email=user.email || claims.email || val('email');
          user.role=normaliseRole(user.role || user.user_role || claims.role || claims.user_role || 'customer');
          saveSession(token,user); state.page='dashboard'; await loadPage('dashboard'); toast(`Welcome back, ${user.name}.`,'success');
        } catch(error) { setError(error.message || 'Sign in failed.'); }
        finally { const b=$('#auth-submit'); if(b){b.disabled=false;b.textContent='Sign in';} }
      }
      else if (form.id === 'signup-form') {
        const name=val('name'), email=val('email'), password=val('password'), confirmPass=val('confirm');
        const role=val('role') || 'customer';
        const referenceKey=val('reference_key');
        if (!name) throw new Error('Enter your full name.');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (password !== confirmPass) throw new Error('The passwords do not match.');
        if (!['customer','organiser','admin'].includes(role)) throw new Error('Choose a valid account role.');
        if (role !== 'customer' && !referenceKey) throw new Error('Enter the role reference key.');
        const button=$('#auth-submit'); if(button){button.disabled=true;button.textContent='Creating account…';}
        let created=false;
        try {
          const result=await apiRequest('/auth/register',{method:'POST',auth:false,body:{name,email,password,role,reference_key:referenceKey}});
          created=true;
          toast((result.message || 'Account created. Please sign in.'),'success');
        } catch(error) {
          setError(error.message || 'Registration could not be completed. Confirm that the updated backend is installed.');
        } finally { const b=$('#auth-submit'); if(b){b.disabled=false;b.textContent='Create account';} }
        if(created) {
          renderAuth('login');
          const emailInput=$('#auth-email'); if(emailInput) emailInput.value=email;
          const err=$('#auth-error'); if(err){err.textContent='Account created. Sign in using your new email and password.';err.classList.add('show');err.classList.add('success-message');}
        }
      }
      else if (form.id === 'event-search-form') { state.eventSearch=val('search'); await loadPage('events'); }
      else if (form.id === 'event-form') {
        const id=form.dataset.id; const body={title:val('title'),description:val('description'),category_id:Number(val('category_id')),venue_id:Number(val('venue_id')),start_datetime:apiDateTime(val('start_datetime')),end_datetime:apiDateTime(val('end_datetime')),ticket_price:Number(val('ticket_price')),total_tickets:Number(val('total_tickets'))};
        const organiser=val('organiser_id') || currentUserId(); if(organiser)body.organiser_id=Number(organiser);
        if (!body.category_id || !body.venue_id) throw new Error('Choose a category and venue.');
        const result=await apiRequest(id?`/events/${encodeURIComponent(id)}`:'/events',{method:id?'PUT':'POST',body});
        closeModal(); toast((result.message || (id?'Event updated.':'Event created.')),'success'); await loadPage('events');
      }
      else if (form.id === 'venue-form') {
        const id=form.dataset.id; const body={name:val('name'),address:val('address'),capacity:Number(val('capacity')),description:val('description')};
        const result=await apiRequest(id?`/venues/${encodeURIComponent(id)}`:'/venues',{method:id?'PUT':'POST',body});
        closeModal(); toast(result.message || (id?'Venue updated.':'Venue created.')); await loadPage('venues');
      }
      else if (form.id === 'availability-form') {
        const id=form.dataset.id; const body={venue_id:Number(val('venue_id')),availability_date:val('availability_date'),start_time:val('start_time') + (val('start_time').length===5?':00':''),end_time:val('end_time') + (val('end_time').length===5?':00':''),status:val('status')};
        if(!id) state.selectedVenueId=String(body.venue_id);
        const result=await apiRequest(id?`/availability/${encodeURIComponent(id)}`:'/availability',{method:id?'PUT':'POST',body});
        closeModal(); toast(result.message || (id?'Availability updated.':'Availability created.')); await loadPage('availability');
      }
      else if (form.id === 'user-form') {
        const id=form.dataset.id; const body={name:val('name'),email:val('email'),role:val('role')}; if(!id)body.password=val('password');
        const result=await apiRequest(id?`/users/${encodeURIComponent(id)}`:'/users',{method:id?'PUT':'POST',body});
        closeModal(); toast(result.message || (id?'User updated.':'User created.')); await loadPage('users');
      }
      else if (form.id === 'booking-form') {
        const eventId=form.dataset.eventId; const quantity=Number(val('quantity'));
        if(!Number.isInteger(quantity)||quantity<1) throw new Error('Enter a valid ticket quantity.');
        const result=await apiRequest('/bookings',{method:'POST',body:{event_id:Number(eventId),quantity}});
        closeModal(); toast(result.message || 'Booking created. Please complete payment.'); await loadPage('bookings');
        const d=responseData(result)||{}; const bookingId= d.id ?? d.booking_id ?? (d.booking && (d.booking.id || d.booking.booking_id));
        if(bookingId) openPaymentForm(bookingId);
      }
      else if (form.id === 'payment-form') {
        const bookingId=Number(form.dataset.bookingId); const result=await apiRequest('/payments',{method:'POST',body:{booking_id:bookingId,payment_method:val('payment_method')}});
        const d=responseData(result)||{}; state.lastPayment=result; closeModal(); toast(result.message || `Payment ${d.status || 'submitted'} successfully.`); await loadPage('bookings'); openPaymentLookup(d.id || d.payment_id || '');
      }
      else if (form.id === 'notification-form') {
        const recipient=val('recipient_id'); const eventId=val('event_id'); const body={title:val('title'),message:val('message'),notification_type:val('notification_type')||'general'};
        if(recipient)body.recipient_id=Number(recipient); else body.broadcast=true;
        if(eventId)body.event_id=Number(eventId);
        const result=await apiRequest('/notifications',{method:'POST',body}); closeModal(); toast(result.message || 'Notification sent.'); await loadPage('notifications');
      }
      else if (form.id === 'payment-lookup-form') {
        const id=val('payment_id'); const target=$('#payment-result'); if(target)target.innerHTML='<div class="skeleton" style="height:90px"></div>';
        try { state.lastPayment=await apiRequest(`/payments/${encodeURIComponent(id)}`); if($('#payment-result'))$('#payment-result').innerHTML=renderPaymentDetails(state.lastPayment); }
        catch(error) { if($('#payment-result'))$('#payment-result').innerHTML=`<div class="callout" style="background:var(--red-bg);border-color:#ffd5df;color:#a62e4d"><span>!</span><p>${escapeHtml(error.message)}</p></div>`; }
      }
    } catch (error) {
      if (['login-form','signup-form'].includes(form.id)) setError(error.message || 'Please check the form and try again.');
      else toast(error.message || 'The request could not be completed.','error');
    }
  });

  // Bootstrap from a previous session if there is a stored token. Server-side
  // permissions remain authoritative; client-side role checks only shape the UI.
  if (state.token) {
    const claims=decodeToken(state.token);
    state.user=Object.assign({},claims,state.user||{});
    state.user.id=state.user.id ?? state.user.user_id ?? claims.user_id ?? claims.id ?? claims.sub ?? '';
    state.user.role=normaliseRole(state.user.role || state.user.user_role || claims.role || claims.user_role || 'customer');
    state.user.name=state.user.name || state.user.full_name || claims.name || state.user.email || 'Account';
    localStorage.setItem('eventra_user',JSON.stringify(state.user));
    loadPage('dashboard');
  } else renderAuth('login');
})();
