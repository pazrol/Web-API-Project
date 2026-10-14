(() => {
  'use strict';
  const API = window.Ticket4uAPI;
  const body = document.body;
  if (!body || body.dataset.requiresAuth !== 'true') return;
  const token = API.token();
  const user = API.readUser();
  if (!token) {
    window.location.replace('login.php');
    return;
  }
  const role = API.currentRole();
  const allowedRoles = (body.dataset.allowedRoles || 'admin,organiser,customer').split(',').map(s=>s.trim());
  if (!allowedRoles.includes(role)) {
    window.location.replace('dashboard.php?denied=1');
    return;
  }
  const name = API.currentUserName();
  const roleLabel = role === 'admin' ? 'Administrator' : role === 'organiser' ? 'Organiser' : 'Customer';
  document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = name; });
  document.querySelectorAll('[data-user-role]').forEach(el => { el.textContent = roleLabel; });
  document.querySelectorAll('[data-user-initials]').forEach(el => { el.textContent = name.split(/[\s@._-]+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('') || 'E'; });
  document.querySelectorAll('[data-roles]').forEach(el => {
    const roles = (el.dataset.roles || '').split(',').map(s=>s.trim());
    if (roles.length && !roles.includes(role)) el.remove();
  });
  const page = body.dataset.page || '';
  const titles = {
    dashboard:'A quick look at your upcoming events, bookings and recent activity.',
    events:'Browse upcoming events, or manage the events listed in your system.',
    venues:'Keep event spaces and venue details up to date.',
    availability:'Manage the dates and time slots that venues can be booked for.',
    bookings:'Keep track of booking details, ticket quantities and booking status.',
    payments:'Review payment records and follow up on refund status.',
    notifications:'Updates and reminders related to your event activity.',
    users:'Manage registered accounts and their assigned roles.'
  };
  if (titles[page]) API.pageHeading(titles[page]);
  if (new URLSearchParams(window.location.search).get('denied') === '1') API.notify('That page is not available for your account role.','error');
  document.addEventListener('click', (event) => {
    const logout = event.target.closest('[data-logout]');
    if (event.target.closest('[data-retry-page]')) {
      window.location.reload();
      return;
    }
    if (logout) {
      API.clearSession();
      window.location.href = 'login.php';
      return;
    }
    const toggle = event.target.closest('[data-menu-toggle]');
    if (toggle) document.getElementById('sidebar')?.classList.toggle('open');
    if (event.target.matches('[data-dialog-backdrop]')) API.closeDialog();
    if (event.target.closest('[data-dialog-close]')) API.closeDialog();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') API.closeDialog(); });
  // Do not allow a broken page script or an unresponsive service to leave an endless spinner.
  window.setTimeout(() => {
    document.querySelectorAll('.loading-state').forEach((element) => {
      element.className = 'load-error';
      element.innerHTML = '<strong>This section is taking too long.</strong><p>The page could not finish loading. Check the API connection, then try again.</p><button class="btn btn-muted btn-small" type="button" data-retry-page>Try again</button>';
    });
  }, 18000);
  // Prevent a stale session from silently remaining on a protected page if API calls return 401.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !API.token()) window.location.replace('login.php');
  });
})();
