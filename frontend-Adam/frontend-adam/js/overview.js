// Eventix role-aware dashboard landing page.
async function renderOverview() {
  const user = getCurrentUser();
  if (!user) return;

  const role = String(user.role || 'customer').toLowerCase();
  document.getElementById('overview-greeting').textContent = `Welcome back, ${user.name || 'User'}`;
  document.getElementById('overview-description').textContent = ({
    customer: 'Discover events, manage your bookings and keep track of payments.',
    organiser: 'Manage your events, review bookings and check venue availability.',
    admin: 'Monitor TixNation and manage users, events, venues and categories.'
  })[role] || 'Manage your TixNation activities from one place.';

  const actionsByRole = {
    customer: [
      ['Explore events', 'Find events and discover what is coming up.', '▦', 'events'],
      ['My bookings', 'Review your event bookings.', '▤', 'bookings'],
      ['Payments', 'Review your payment information.', '▱', 'payments'],
      ['Browse venues', 'Explore venue information.', '⌂', 'venues']
    ],
    organiser: [
      ['Manage events', 'Review and manage your events.', '▦', 'events'],
      ['Manage bookings', 'Review event bookings.', '▤', 'bookings'],
      ['Venue availability', 'Check venues for your schedule.', '▦', 'availability'],
      ['Manage venues', 'View venue information.', '⌂', 'venues'],
      ['Payments', 'Review accessible payment records.', '▱', 'payments']
    ],
    admin: [
      ['Manage users', 'View and manage user accounts.', '♧', 'users'],
      ['Manage events', 'Review events on the platform.', '▦', 'events'],
      ['Manage venues', 'Review venue records.', '⌂', 'venues'],
      ['Venue availability', 'Review venue availability.', '▦', 'availability'],
      ['Categories', 'Manage event categories.', '▤', 'categories'],
      ['Payments', 'Review payment records.', '▱', 'payments']
    ]
  };

  const actions = actionsByRole[role] || actionsByRole.customer;
  const actionContainer = document.getElementById('overview-quick-actions');
  actionContainer.innerHTML = actions.map(([title, desc, icon, section]) => `
    <button type="button" class="overview-action-card" data-overview-section="${section}">
      <span class="overview-action-icon">${icon}</span>
      <span class="overview-action-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></span>
      <span class="overview-action-arrow" aria-hidden="true">→</span>
    </button>`).join('');

  actionContainer.querySelectorAll('[data-overview-section]').forEach(button => {
    button.addEventListener('click', () => showSection(button.dataset.overviewSection));
  });

  const checklistByRole = {
    customer: [['Explore upcoming events', 'events'], ['Review your bookings', 'bookings'], ['Check payment records', 'payments']],
    organiser: [['Review your events', 'events'], ['Check event bookings', 'bookings'], ['Check venue availability', 'availability']],
    admin: [['Review user accounts', 'users'], ['Review events and venues', 'events'], ['Check payments', 'payments']]
  };
  const checklist = checklistByRole[role] || checklistByRole.customer;
  const checklistContainer = document.getElementById('overview-getting-started');
  checklistContainer.innerHTML = checklist.map(([label, section], i) => `
    <button type="button" class="overview-checklist-item" data-overview-section="${section}">
      <span class="overview-check-number">${i + 1}</span><span>${escapeHtml(label)}</span><span class="overview-action-arrow">→</span>
    </button>`).join('');
  checklistContainer.querySelectorAll('[data-overview-section]').forEach(button => {
    button.addEventListener('click', () => showSection(button.dataset.overviewSection));
  });

  await loadOverviewData();
}

async function loadOverviewData() {
  const definitions = [
    ['events', '/events', 'overview-events-count'],
    ['venues', '/venues', 'overview-venues-count'],
    ['bookings', '/bookings', 'overview-bookings-count'],
    ['payments', '/payments', 'overview-payments-count']
  ];
  definitions.forEach(([, , id]) => { document.getElementById(id).textContent = '—'; });
  document.getElementById('overview-recent-events').innerHTML = '<p>Loading events...</p>';

  const results = await Promise.all(definitions.map(async ([key, path, id]) => {
    try {
      const response = await apiGet(path + buildQuery({ page: 1, per_page: 100 }));
      if (!response.ok) return { key, ok: false, items: [] };
      const data = response.data;
      const items = Array.isArray(data) ? data :
        Array.isArray(data?.items) ? data.items :
        Array.isArray(data?.data) ? data.data : [];
      const meta = data?.pagination || data?.meta || {};
      const total = Number(meta.total);
      document.getElementById(id).textContent = Number.isFinite(total) && meta.total != null ? total : items.length;
      return { key, ok: true, items };
    } catch (error) {
      console.warn(`Overview: failed to load ${key}`, error);
      return { key, ok: false, items: [] };
    }
  }));

  const eventResult = results.find(result => result.key === 'events');
  const container = document.getElementById('overview-recent-events');
  if (!eventResult?.ok) {
    container.innerHTML = '<p>Events could not be loaded. Open Events to try again.</p>';
    return;
  }
  const events = eventResult.items.slice().sort((a, b) =>
    String(a.start_datetime || '').localeCompare(String(b.start_datetime || ''))
  ).slice(0, 5);
  if (!events.length) {
    container.innerHTML = '<p>No events to display yet.</p>';
    return;
  }
  container.innerHTML = events.map(event => `
    <article class="overview-event-row">
      <div class="overview-event-date">${escapeHtml(event.start_datetime ? String(event.start_datetime).slice(0, 10) : 'Date TBC')}</div>
      <div class="overview-event-info"><strong>${escapeHtml(event.title || 'Untitled event')}</strong>
      <span>${escapeHtml(event.status || 'Scheduled')}${event.start_datetime ? ' · ' + escapeHtml(String(event.start_datetime).slice(11, 16)) : ''}</span></div>
      <button type="button" class="btn secondary small overview-event-button">View</button>
    </article>`).join('');
  container.querySelectorAll('.overview-event-button').forEach(button => {
    button.addEventListener('click', () => showSection('events'));
  });
}
