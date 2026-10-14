/* EVENTIX venue calendar - frontend only. */
let availabilityVenues = [];
let availabilityVenueId = '';
let availabilityMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let availabilityStartTime = '09:00';
let availabilityEndTime = '17:00';
let availabilityRecords = [];
let availabilityEvents = [];
let availabilityRequestId = 0;
let availabilitySelectedDate = '';

async function renderAvailability() {
  const toolbar = document.getElementById('availability-toolbar');
  const list = document.getElementById('availability-list');
  const addButton = document.getElementById('availability-add-btn');
  if (!toolbar || !list) return;
  if (addButton) addButton.style.display = 'none';

  toolbar.innerHTML = `
    <div class="venue-calendar-toolbar">
      <div class="availability-field venue-calendar-venue-field">
        <label for="availability-venue-filter">Selected venue</label>
        <select id="availability-venue-filter"><option value="">Loading venues...</option></select>
      </div>
      <div class="availability-field">
        <label for="availability-start-time">Start time</label>
        <input id="availability-start-time" type="time" value="${availabilityStartTime}">
      </div>
      <div class="availability-field">
        <label for="availability-end-time">End time</label>
        <input id="availability-end-time" type="time" value="${availabilityEndTime}">
      </div>
      <div class="venue-calendar-time-note">Calendar dates update automatically when you change the venue or times.</div>
    </div>`;

  list.innerHTML = '<div class="loading-text">Loading venue calendar...</div>';
  const pagination = document.getElementById('availability-pagination');
  if (pagination) pagination.innerHTML = '';

  try {
    availabilityVenues = await fetchAllVenues();
    const select = document.getElementById('availability-venue-filter');
    if (!availabilityVenues.length) {
      select.innerHTML = '<option value="">No venues found</option>';
      list.innerHTML = '<div class="empty-state">There are no venues to display.</div>';
      return;
    }
    select.innerHTML = availabilityVenues.map(v =>
      `<option value="${escapeHtml(String(v.id))}">${escapeHtml(v.name || `Venue ${v.id}`)}</option>`
    ).join('');
    if (availabilityVenueId && availabilityVenues.some(v => String(v.id) === String(availabilityVenueId))) {
      select.value = String(availabilityVenueId);
    } else {
      availabilityVenueId = String(availabilityVenues[0].id);
      select.value = availabilityVenueId;
    }

    select.addEventListener('change', async () => {
      availabilityVenueId = select.value;
      availabilitySelectedDate = '';
      await loadVenueCalendar();
    });
    document.getElementById('availability-start-time').addEventListener('change', async e => {
      availabilityStartTime = e.target.value || '09:00';
      await loadVenueCalendar();
    });
    document.getElementById('availability-end-time').addEventListener('change', async e => {
      availabilityEndTime = e.target.value || '17:00';
      if (availabilityStartTime >= availabilityEndTime) {
        toast('End time must be later than start time.');
        e.target.value = availabilityEndTime = '17:00';
      }
      await loadVenueCalendar();
    });
    await loadVenueCalendar();
  } catch (error) {
    console.error('Venue calendar load failed:', error);
    list.innerHTML = '<div class="empty-state">Could not load venues. Check your login and API connection.</div>';
  }
}

function availabilityItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function availabilityGetAll(path) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const response = await apiGet(`${path}${separator}page=${page}&per_page=100`);
    if (!response.ok) throw new Error(response.message || `Failed to load ${path}`);
    const data = response.data;
    all.push(...availabilityItems(data));
    const meta = data?.pagination || data?.meta || {};
    const pages = Number(meta.total_pages ?? meta.last_page ?? 1);
    totalPages = Number.isFinite(pages) ? Math.max(1, pages) : 1;
    page++;
  } while (page <= totalPages);
  return all;
}

async function loadVenueCalendar() {
  const requestId = ++availabilityRequestId;
  const list = document.getElementById('availability-list');
  const venue = availabilityVenues.find(v => String(v.id) === String(availabilityVenueId));
  if (!venue) {
    list.innerHTML = '<div class="empty-state">Select a venue to view its calendar.</div>';
    return;
  }
  list.innerHTML = '<div class="loading-text">Updating calendar...</div>';
  try {
    const [unavailabilityResponse, events] = await Promise.all([
      apiGet(`/venues/${encodeURIComponent(venue.id)}/unavailability`),
      availabilityGetAll('/events')
    ]);
    if (!unavailabilityResponse.ok) throw new Error(unavailabilityResponse.message || 'Could not load unavailability.');
    availabilityRecords = availabilityItems(unavailabilityResponse.data);
    availabilityEvents = events;
    if (requestId !== availabilityRequestId) return;
    renderVenueCalendar(venue);
  } catch (error) {
    if (requestId !== availabilityRequestId) return;
    console.error('Venue calendar request failed:', error);
    list.innerHTML = '<div class="empty-state">Could not load this venue calendar. Please check the API response and try again.</div>';
    toast(error.message || 'Could not load venue calendar.');
  }
}

function renderVenueCalendar(venue) {
  const list = document.getElementById('availability-list');
  const year = availabilityMonth.getFullYear();
  const month = availabilityMonth.getMonth();
  const monthName = availabilityMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = localDateString(new Date());
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push('<div class="venue-calendar-day empty-day" aria-hidden="true"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const state = getVenueDateState(date);
    const isPast = date < today;
    const classes = ['venue-calendar-day', state.available ? 'day-available' : 'day-busy'];
    if (date === availabilitySelectedDate) classes.push('day-selected');
    if (isPast) classes.push('day-past');
    const label = state.available ? 'Available' : 'In use';
    cells.push(`<button type="button" class="${classes.join(' ')}" data-calendar-date="${date}" ${isPast ? 'disabled' : ''} aria-label="${date}: ${label}">
      <span class="calendar-day-number">${day}</span>
      <span class="calendar-day-dot" aria-hidden="true"></span>
      <span class="calendar-day-label">${isPast ? 'Past date' : label}</span>
      ${state.reason ? `<span class="calendar-day-reason">${escapeHtml(state.reason)}</span>` : ''}
    </button>`);
  }

  const selected = availabilitySelectedDate ? getVenueDateState(availabilitySelectedDate) : null;
  const canBook = String(getCurrentUser()?.role || '').toLowerCase() === 'organiser';
  list.innerHTML = `
    <section class="venue-calendar-panel">
      <div class="venue-calendar-topline">
        <div class="venue-calendar-title-block">
          <h3>${escapeHtml(venue.name || `Venue ${venue.id}`)}</h3>
          <p>${escapeHtml(venue.address || 'Venue address not provided')}${venue.capacity != null ? ` · Capacity ${escapeHtml(String(venue.capacity))}` : ''}</p>
        </div>
        <div class="venue-calendar-month-controls">
          <button type="button" class="calendar-month-btn" id="availability-prev-month" aria-label="Previous month">‹</button>
          <strong>${escapeHtml(monthName)}</strong>
          <button type="button" class="calendar-month-btn" id="availability-next-month" aria-label="Next month">›</button>
        </div>
      </div>
      <div class="venue-calendar-legend">
        <span><i class="legend-dot available-dot"></i> Available for selected time</span>
        <span><i class="legend-dot busy-dot"></i> In use / blocked</span>
        <span><i class="legend-dot past-dot"></i> Past date</span>
      </div>
      <div class="venue-calendar-grid venue-calendar-weekdays">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div>${d}</div>`).join('')}
      </div>
      <div class="venue-calendar-grid venue-calendar-days">${cells.join('')}</div>
      <div class="venue-calendar-details">
        <div class="calendar-details-copy">
          <span class="calendar-details-eyebrow">SELECTED DATE</span>
          <h4>${availabilitySelectedDate ? escapeHtml(availabilitySelectedDate) : 'Choose a date on the calendar'}</h4>
          <p>${availabilitySelectedDate && selected ? (selected.available ? `Available from ${escapeHtml(availabilityStartTime)} to ${escapeHtml(availabilityEndTime)}.` : `This venue is in use during ${escapeHtml(availabilityStartTime)}–${escapeHtml(availabilityEndTime)}${selected.reason ? ` (${escapeHtml(selected.reason)})` : ''}.`) : 'Select any future date to see availability details.'}</p>
        </div>
        ${canBook && availabilitySelectedDate && selected?.available ? `<button type="button" class="btn" id="availability-book-selected">Book hall</button>` : ''}
        ${String(getCurrentUser()?.role || '').toLowerCase() === 'admin' && availabilitySelectedDate ? `<button type="button" class="btn secondary" id="availability-block-selected">Block selected date/time</button>` : ''}
      </div>
      ${venue.description ? `<p class="venue-calendar-description">${escapeHtml(venue.description)}</p>` : ''}
    </section>`;

  document.getElementById('availability-prev-month').addEventListener('click', () => {
    availabilityMonth = new Date(year, month - 1, 1);
    availabilitySelectedDate = '';
    renderVenueCalendar(venue);
  });
  document.getElementById('availability-next-month').addEventListener('click', () => {
    availabilityMonth = new Date(year, month + 1, 1);
    availabilitySelectedDate = '';
    renderVenueCalendar(venue);
  });
  list.querySelectorAll('[data-calendar-date]').forEach(button => {
    button.addEventListener('click', () => {
      availabilitySelectedDate = button.dataset.calendarDate;
      renderVenueCalendar(venue);
    });
  });
  const blockSelectedButton = document.getElementById('availability-block-selected');
  if (blockSelectedButton) blockSelectedButton.addEventListener('click', () => openAvailabilityBlockModal(venue, availabilitySelectedDate));
  const bookButton = document.getElementById('availability-book-selected');
  if (bookButton) bookButton.addEventListener('click', () => {
    // Keep this frontend-only and hand off to the existing venue booking flow.
    window.location.href = `dashboard.html?section=venues&venue_id=${encodeURIComponent(venue.id)}&date=${encodeURIComponent(availabilitySelectedDate)}&start_time=${encodeURIComponent(availabilityStartTime)}&end_time=${encodeURIComponent(availabilityEndTime)}&action=book`;
  });
}

function getVenueDateState(date) {
  const start = availabilityTimestamp(date, availabilityStartTime);
  const end = availabilityTimestamp(date, availabilityEndTime);
  const record = availabilityRecords.find(item => {
    const recordDate = item.unavailability_date || item.date;
    if (recordDate !== date) return false;
    const type = String(item.record_type || '').toLowerCase();
    const status = String(item.status || '').toLowerCase();
    const blocking = ['admin_block', 'organiser_booking'].includes(type) || ['blocked', 'unavailable'].includes(status);
    if (!blocking) return false;
    const recordStart = availabilityTimestamp(date, String(item.start_time || '').slice(0, 5));
    const recordEnd = availabilityTimestamp(date, String(item.end_time || '').slice(0, 5));
    return availabilityOverlaps(start, end, recordStart, recordEnd);
  });
  if (record) {
    const type = String(record.record_type || '').toLowerCase();
    return { available: false, reason: type === 'admin_block' ? 'Admin block' : 'Reservation' };
  }
  const event = availabilityEvents.find(item => {
    if (String(item.venue_id) !== String(availabilityVenueId)) return false;
    const status = String(item.status || '').toLowerCase();
    if (['cancelled', 'canceled', 'completed'].includes(status)) return false;
    if (!item.start_datetime || !item.end_datetime) return false;
    const eventStart = availabilityParseDateTime(item.start_datetime);
    const eventEnd = availabilityParseDateTime(item.end_datetime);
    return availabilityOverlaps(start, end, eventStart, eventEnd);
  });
  if (event) return { available: false, reason: 'Scheduled event' };
  return { available: true, reason: '' };
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function availabilityTimestamp(date, time) {
  if (!date || !time) return NaN;
  const value = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(value) ? value : NaN;
}
function availabilityParseDateTime(value) {
  if (!value) return NaN;
  const valueMs = new Date(String(value).replace(' ', 'T')).getTime();
  return Number.isFinite(valueMs) ? valueMs : NaN;
}
function availabilityOverlaps(startA, endA, startB, endB) {
  if (![startA, endA, startB, endB].every(Number.isFinite)) return true;
  return startA < endB && startB < endA;
}


// Admin-only venue block form. This uses the existing unavailability API; no backend changes.
function openAvailabilityBlockModal(venueArg, dateArg) {
  if (String(getCurrentUser()?.role || '').toLowerCase() !== 'admin') {
    toast('Only admins can block venue availability.', 'error');
    return;
  }
  const venue = venueArg || availabilityVenues.find(v => String(v.id) === String(availabilityVenueId));
  if (!venue) { toast('Select a venue first.', 'error'); return; }
  const date = dateArg || availabilitySelectedDate || localDateString(new Date());
  openModal(`
    <h3>Block venue availability</h3>
    <p class="record-sub">${escapeHtml(venue.name || `Venue ${venue.id}`)} · Mark a date or time range as unavailable.</p>
    <form id="availability-block-form">
      <label for="block-date">Date</label>
      <input id="block-date" type="date" value="${escapeHtml(date)}" min="${localDateString(new Date())}" required>
      <label for="block-start">Start time</label>
      <input id="block-start" type="time" value="${escapeHtml(availabilityStartTime)}" required>
      <label for="block-end">End time</label>
      <input id="block-end" type="time" value="${escapeHtml(availabilityEndTime)}" required>
      <label for="block-reason">Reason</label>
      <input id="block-reason" type="text" maxlength="255" placeholder="Maintenance, private event, etc." required>
      <div class="form-actions"><button type="button" class="btn secondary" id="block-cancel">Cancel</button><button type="submit" class="btn">Block date</button></div>
    </form>`);
  document.getElementById('block-cancel').addEventListener('click', closeModal);
  document.getElementById('availability-block-form').addEventListener('submit', async e => {
    e.preventDefault();
    const dateValue = document.getElementById('block-date').value;
    const start = document.getElementById('block-start').value;
    const end = document.getElementById('block-end').value;
    if (!dateValue || !start || !end || start >= end) { toast('Choose a valid date and an end time later than the start time.', 'error'); return; }
    const submit = e.submitter;
    if (submit) { submit.disabled = true; submit.textContent = 'Saving...'; }
    const response = await apiPost('/unavailability', {
      venue_id: Number(venue.id),
      unavailability_date: dateValue,
      date: dateValue,
      start_time: start,
      end_time: end,
      record_type: 'admin_block',
      status: 'unavailable',
      reason: document.getElementById('block-reason').value.trim()
    });
    if (response.ok) {
      toast('Venue date/time blocked.');
      availabilitySelectedDate = dateValue;
      closeModal();
      await loadVenueCalendar();
    } else {
      toastApiError(response);
      if (submit) { submit.disabled = false; submit.textContent = 'Block date'; }
    }
  });
}
