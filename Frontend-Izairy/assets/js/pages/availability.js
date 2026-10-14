(() => {
  'use strict';

  const A = window.Ticket4uAPI;
  const $ = selector => document.querySelector(selector);
  let venues = [];
  let slots = [];
  let selectedVenue = '';
  const calendarCursor = new Date();
  calendarCursor.setDate(1);

  const venueId = venue => A.itemId(venue, ['id', 'venue_id']);
  const recordId = record => A.itemId(record, ['id', 'unavailability_id', 'availability_id']);
  const recordDate = record => String(
    record?.unavailability_date || record?.availability_date || record?.date || ''
  ).slice(0, 10);
  const isAdmin = () => A.currentRole() === 'admin';
  const isOrganiser = () => A.currentRole() === 'organiser';
  const recordType = record => String(record?.record_type || '').toLowerCase();

  function canManage(record) {
    if (isAdmin()) return true;
    if (!isOrganiser()) return false;
    return recordType(record) === 'organiser_booking'
      && String(record?.booked_by ?? '') === String(A.currentUserId());
  }

  function normaliseRecords(payload) {
    const data = A.dataOf(payload);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      for (const key of ['unavailability', 'venue_unavailability', 'slots', 'items', 'results', 'records']) {
        if (Array.isArray(data[key])) return data[key];
      }
    }
    return A.listOf(payload);
  }

  async function init() {
    try {
      const payload = await A.request('/venues?page=1&per_page=100');
      venues = A.listOf(payload);
      const select = $('#availability-venue-filter');
      select.innerHTML = venues.length
        ? venues.map((venue, index) => `<option value="${A.escapeHtml(venueId(venue))}" ${index === 0 ? 'selected' : ''}>${A.escapeHtml(A.venueName(venue))}</option>`).join('')
        : '<option value="">No venues found</option>';
      selectedVenue = select.value;
      updateActionLabel();
      await refresh();
    } catch (error) {
      $('#availability-venue-filter').innerHTML = '<option value="">Venues unavailable</option>';
      A.showLoadError('#availability-table', error.message);
      A.setNotice('Venues could not be loaded. Check the API connection.', 'error');
    }
  }

  function updateActionLabel() {
    const button = $('#add-availability-button');
    if (!button) return;
    if (isAdmin()) button.textContent = '＋ Block a date';
    else if (isOrganiser()) button.textContent = '＋ Book hall';
    else button.hidden = true;
  }

  async function refresh() {
    selectedVenue = $('#availability-venue-filter').value;
    if (!selectedVenue) {
      slots = [];
      render();
      return;
    }
    $('#availability-table').innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading venue records…</div>';
    try {
      const payload = await A.request(`/venues/${encodeURIComponent(selectedVenue)}/unavailability`);
      slots = normaliseRecords(payload);
      render();
    } catch (error) {
      slots = [];
      renderCalendar();
      A.showLoadError('#availability-table', `${error.message} The backend must implement GET /venues/{id}/unavailability and query venue_unavailability.`);
      A.setNotice('Could not load venue unavailability. Check the backend route and table field names.', 'error');
    }
  }

  function renderCalendar() {
    const host = $('#venue-calendar');
    if (!host) return;
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    $('#calendar-month-label').textContent = calendarCursor.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dateCounts = new Map();
    for (const slot of slots) {
      const key = recordDate(slot);
      if (key) dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('');
    for (let blank = 0; blank < firstDay; blank++) {
      html += '<div class="calendar-day calendar-day-empty" aria-hidden="true"></div>';
    }

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const count = dateCounts.get(key) || 0;
      const busy = count > 0;
      const state = busy ? 'red' : 'green';
      html += `<button type="button" class="calendar-day ${state}${key === todayKey ? ' is-today' : ''}" data-calendar-date="${key}" title="${key}: ${busy ? `${count} occupied or blocked record(s)` : 'No unavailability record'}">
        <span class="calendar-day-number">${day}</span><i class="calendar-dot ${state}"></i>
        <small>${busy ? 'In use' : 'Available'}</small>${count ? `<em>${count} record${count === 1 ? '' : 's'}</em>` : ''}
      </button>`;
    }
    host.innerHTML = html;
  }

  function typeLabel(record) {
    if (recordType(record) === 'organiser_booking') return 'Hall reservation';
    if (recordType(record) === 'admin_block') return 'Admin block';
    return recordType(record) ? recordType(record).replaceAll('_', ' ') : 'Unavailable';
  }

  function render() {
    renderCalendar();
    const table = $('#availability-table');
    if (!slots.length) {
      table.innerHTML = `<div class="empty-state"><div class="empty-icon">▦</div><strong>No blocked or occupied periods</strong><p>This venue has no unavailability records for the dates returned by the API. Dates without records are treated as available.</p></div>`;
      return;
    }

    const rows = [...slots].sort((a, b) => `${recordDate(a)} ${a.start_time || ''}`.localeCompare(`${recordDate(b)} ${b.start_time || ''}`));
    table.innerHTML = `<table><thead><tr><th>Date</th><th>Start</th><th>End</th><th>Record type</th><th>Reason</th><th>Actions</th></tr></thead><tbody>${rows.map(record => {
      const id = recordId(record);
      const actions = canManage(record)
        ? `<div class="table-actions"><button class="btn btn-muted btn-small" data-edit-unavailability="${A.escapeHtml(id)}">Edit</button><button class="btn btn-danger btn-small" data-delete-unavailability="${A.escapeHtml(id)}">Delete</button></div>`
        : '<span class="table-sub">Managed by admin / owner</span>';
      return `<tr><td><span class="table-primary">${A.escapeHtml(A.fmtDate(recordDate(record)))}</span><span class="table-sub">Record ID: ${A.escapeHtml(id)}</span></td><td>${A.escapeHtml(String(record.start_time || '').slice(0, 5) || '—')}</td><td>${A.escapeHtml(String(record.end_time || '').slice(0, 5) || '—')}</td><td>${A.badge(typeLabel(record))}</td><td>${A.escapeHtml(record.reason || '—')}</td><td>${actions}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function openForm(id = '') {
    const record = id ? slots.find(item => String(recordId(item)) === String(id)) || {} : {};
    if (id && !canManage(record)) {
      A.notify('You do not have permission to edit this record.', 'error');
      return;
    }
    const venueOptions = venues.map(venue => ({ value: venueId(venue), label: A.venueName(venue) }));
    const date = recordDate(record);
    const title = isAdmin() ? (id ? 'Edit venue block' : 'Block a date') : (id ? 'Edit hall reservation' : 'Book hall');
    const submitLabel = id ? 'Save changes' : (isAdmin() ? 'Block time' : 'Book hall');
    const form = `<form id="unavailability-form" data-id="${A.escapeHtml(id)}">
      <div class="form-grid">
        ${A.selectField('Venue', 'venue_id', venueOptions, record.venue_id || selectedVenue, 'required')}
        ${A.textField('Date', 'unavailability_date', date, 'date', 'required')}
        ${A.textField('Start time', 'start_time', String(record.start_time || '09:00').slice(0, 5), 'time', 'required')}
        ${A.textField('End time', 'end_time', String(record.end_time || '17:00').slice(0, 5), 'time', 'required')}
        ${A.textField('Reason', 'reason', record.reason || '', 'text', 'maxlength="255" required')}
      </div>
      <p class="form-help">No record means available. The selected period will be marked unavailable. The API must reject overlapping events and reservations.</p>
      <div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Cancel</button><button class="btn btn-primary" type="submit">${submitLabel}</button></div>
    </form>`;
    A.showDialog(title, form);
  }

  document.addEventListener('click', async event => {
    if (event.target.closest('#add-availability-button, [data-new-slot]')) openForm();
    const edit = event.target.closest('[data-edit-unavailability]');
    if (edit) openForm(edit.dataset.editUnavailability);
    const remove = event.target.closest('[data-delete-unavailability]');
    if (remove && window.confirm('Remove this block or reservation? The selected period will become available if no other event or record occupies it.')) {
      try {
        await A.request(`/unavailability/${encodeURIComponent(remove.dataset.deleteUnavailability)}`, { method: 'DELETE' });
        A.notify('Venue unavailability record removed.');
        await refresh();
      } catch (error) {
        A.notify(error.message, 'error');
      }
    }
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.id !== 'unavailability-form') return;
    event.preventDefault();
    const id = form.dataset.id;
    const body = Object.fromEntries(new FormData(form).entries());
    body.venue_id = Number(body.venue_id);
    body.unavailability_date = String(body.unavailability_date || '').slice(0, 10);
    if (body.start_time >= body.end_time) {
      A.notify('End time must be later than start time.', 'error');
      return;
    }
    try {
      await A.request(id ? `/unavailability/${encodeURIComponent(id)}` : '/unavailability', {
        method: id ? 'PUT' : 'POST',
        body
      });
      A.closeDialog();
      selectedVenue = String(body.venue_id);
      $('#availability-venue-filter').value = selectedVenue;
      A.notify(id ? 'Venue record updated.' : (isAdmin() ? 'Venue time blocked.' : 'Hall reservation created.'));
      await refresh();
    } catch (error) {
      A.notify(`${error.message} Check that the backend implements the /unavailability route and uses venue_unavailability.`, 'error');
    }
  });

  $('#availability-venue-filter')?.addEventListener('change', refresh);
  $('#calendar-prev')?.addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendar(); });
  $('#calendar-next')?.addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendar(); });

  document.addEventListener('click', event => {
    const day = event.target.closest('[data-calendar-date]');
    if (!day) return;
    const date = day.dataset.calendarDate;
    const record = slots.find(item => recordDate(item) === date);
    if (!record) {
      A.notify(`${date}: no unavailable period is recorded for this venue.`, 'info');
      return;
    }
    const id = recordId(record);
    const row = document.querySelector(`[data-edit-unavailability="${CSS.escape(String(id))}"]`)?.closest('tr');
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.classList.add('calendar-highlight');
    window.setTimeout(() => row?.classList.remove('calendar-highlight'), 1500);
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-retry-page]')) return;
    init();
  });

  init();
})();
