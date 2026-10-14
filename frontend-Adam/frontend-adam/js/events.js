// ============================================================
// events.js
// Browse/search/filter events, create/edit/delete (admin &
// organiser), and book tickets (customer). Also fills the
// "My bookings" sidebar card for customers.
// ============================================================

let eventsPage = 1;
let eventsFilters = { search: "", status: "", category_id: "", venue_id: "" };

async function renderEvents() {
  const user = getCurrentUser();
  const canWrite = user.role === "admin" || user.role === "organiser";

  // Sidebar is only useful for customers; hide it for staff roles.
  document.getElementById("my-bookings-card").style.display =
    user.role === "customer" ? "block" : "none";

  const [categories, venues] = await Promise.all([
    fetchAllCategories(),
    fetchAllVenues(),
  ]);

  const toolbar = document.getElementById("events-toolbar");
  toolbar.innerHTML = `
    <input type="text" id="event-search" placeholder="Search events..." class="chip-search" value="${escapeHtml(eventsFilters.search)}" />
    <select id="event-venue-filter">
      <option value="">All venues</option>
      ${venues.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("")}
    </select>
    ${canWrite ? '<button class="btn" id="event-add-btn">+ Add event</button>' : ""}
  `;
  document.getElementById("event-venue-filter").value = eventsFilters.venue_id;

  document.getElementById("event-search").addEventListener("input", (e) => {
    eventsFilters.search = e.target.value;
    eventsPage = 1;
    loadEventsList(categories, venues);
  });
  document
    .getElementById("event-venue-filter")
    .addEventListener("change", (e) => {
      eventsFilters.venue_id = e.target.value;
      eventsPage = 1;
      loadEventsList(categories, venues);
    });
  if (canWrite) {
    document
      .getElementById("event-add-btn")
      .addEventListener("click", () =>
        openEventModal(null, categories, venues),
      );
  }

  // Quick status filter chips, built from the daybar structure.
  const daybar = document.getElementById("events-daybar");
  const statuses = [
    { value: "", label: "All" },
    { value: "upcoming", label: "Upcoming" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];
  daybar.innerHTML = statuses
    .map(
      (s) => `
      <div class="day-card ${eventsFilters.status === s.value ? "active" : ""}" data-status="${s.value}">
        <div class="day-label">Status</div>
        <div class="day-value">${s.label}</div>
      </div>`,
    )
    .join("");

  daybar.querySelectorAll(".day-card").forEach((card) => {
    card.addEventListener("click", () => {
      const selectedStatus = card.dataset.status;

      // Save the selected status for when you revisit Events.
      eventsFilters.status = selectedStatus;
      eventsPage = 1;

      // Immediately move the active colour to the clicked card.
      daybar.querySelectorAll(".day-card").forEach((item) => {
        item.classList.toggle("active", item.dataset.status === selectedStatus);
      });

      // Refresh the event list without rebuilding the status cards.
      loadEventsList(categories, venues);
    });
  });

  loadEventsList(categories, venues);
  if (user.role === "customer") loadMyBookingsSidebar();
}

async function loadEventsList(categories, venues) {
  const user = getCurrentUser();
  const canWrite = user.role === "admin" || user.role === "organiser";
  const list = document.getElementById("events-list");
  list.innerHTML = '<div class="loading-text">Loading events...</div>';

  const result = await apiGet(
    "/events" +
      buildQuery({
        search: eventsFilters.search,
        venue_id: eventsFilters.venue_id,
        category_id: eventsFilters.category_id,
        page: eventsPage,
        per_page: user.role === "organiser" ? 100 : 10,
      }),
  );

  if (!result.ok) {
    list.innerHTML = '<div class="empty-state">Could not load events.</div>';
    toastApiError(result);
    return;
  }

  let events = (result.data.items || []).map((ev) => ({
    ...ev,
    display_status: getEventDisplayStatus(ev),
  }));

  // Customers may see completed events only when they have booked that event.
  if (user.role === "customer") {
    const bookingsResult = await apiGet("/bookings" + buildQuery({ per_page: 100 }));
    const bookings = bookingsResult.ok ? (bookingsResult.data.items || []) : [];
    const bookedEventIds = new Set(bookings
      .map((booking) => booking.event_id ?? booking.event?.id)
      .filter((id) => id !== undefined && id !== null)
      .map(String));
    events = events.filter((ev) =>
      ev.display_status !== "completed" || bookedEventIds.has(String(ev.id))
    );
  }

  // Filter with the calculated time-based status, not a potentially stale stored status.
  if (eventsFilters.status) {
    events = events.filter((ev) => ev.display_status === eventsFilters.status);
  }

  // Organisers must only see events they created. Admins and customers retain the API's normal event list.
  if (user.role === "organiser") {
    events = events.filter(ev => String(ev.organiser_id) === String(user.id));
    const start = (eventsPage - 1) * 10;
    events = events.slice(start, start + 10);
  }
  if (events.length === 0) {
    list.innerHTML = '<div class="empty-state">No events found.</div>';
  } else {
    list.innerHTML = events
      .map((ev) => eventRowHtml(ev, user, canWrite))
      .join("");

    events.forEach((ev) => {
      const editBtn = list.querySelector(`[data-edit="${ev.id}"]`);
      const delBtn = list.querySelector(`[data-delete="${ev.id}"]`);
      const bookBtn = list.querySelector(`[data-book="${ev.id}"]`);
      if (editBtn)
        editBtn.addEventListener("click", () =>
          openEventModal(ev, categories, venues),
        );
      if (delBtn) delBtn.addEventListener("click", () => deleteEvent(ev.id));
      if (bookBtn)
        bookBtn.addEventListener("click", () => openBookingModal(ev));
    });
  }

  renderPagination(
    document.getElementById("events-pagination"),
    user.role === "organiser"
      ? { current_page: eventsPage, total_pages: Math.max(1, Math.ceil((result.data.items || []).filter(ev => String(ev.organiser_id) === String(user.id)).length / 10)) }
      : result.data.pagination,
    (page) => {
      eventsPage = page;
      loadEventsList(categories, venues);
    },
  );
}

function getEventDisplayStatus(event) {
  const storedStatus = String(event.status || "").toLowerCase();
  if (storedStatus === "cancelled" || storedStatus === "canceled") return "cancelled";

  const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const start = parseDate(event.start_datetime);
  const end = parseDate(event.end_datetime);
  if (!start || !end) return storedStatus || "unknown";

  const now = new Date();
  if (now < end) return "upcoming";
  return "completed";
}

function eventRowHtml(ev, user, canWrite) {
  const displayStatus = ev.display_status || getEventDisplayStatus(ev);
  const start = new Date(String(ev.start_datetime || "").replace(" ", "T"));
  const timeLabel = isNaN(start.getTime())
    ? ""
    : start.toLocaleDateString(undefined, { day: "2-digit", month: "short" });

  const statusClass = "status-" + displayStatus;
  const canEditThis =
    user.role === "admin" ||
    (user.role === "organiser" && ev.organiser_id === user.id);
  const canDeleteThis = canEditThis;
  const canBook =
    user.role === "customer" &&
    displayStatus === "upcoming" &&
    ev.available_tickets > 0;

  return `
    <div class="agenda-row">
      <div class="agenda-time">${timeLabel}</div>
      <div class="agenda-body">
        <div class="tag-row">
          <span class="tag-pill highlight"><span class="dot" style="background:var(--accent)"></span>${escapeHtml(ev.category_name)}</span>
          <span class="tag-pill"><span class="dot" style="background:var(--accent-3)"></span>${escapeHtml(ev.venue_name)}</span>
          <span class="status-pill ${statusClass}">${escapeHtml(displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1))}</span>
        </div>
        <div class="agenda-title">${escapeHtml(ev.title)}</div>
        <div class="agenda-meta">
          ${formatDateTime(ev.start_datetime)} &middot;
          <span class="price">${formatMoney(ev.ticket_price)}</span> &middot;
          ${ev.available_tickets}/${ev.total_tickets} tickets left &middot;
          by ${escapeHtml(ev.organiser_name)}
        </div>
      </div>
      <div class="row-actions">
        ${canBook ? `<button class="btn small" data-book="${ev.id}">Book</button>` : ""}
        ${canEditThis ? `<button class="icon-btn" data-edit="${ev.id}" title="Edit">&#9998;</button>` : ""}
        ${canDeleteThis ? `<button class="icon-btn" data-delete="${ev.id}" title="Delete">&#128465;</button>` : ""}
      </div>
    </div>`;
}

function toLocalInputValue(mysqlDatetime) {
  // Turns "2026-05-01 19:00:00" into the "2026-05-01T19:00" format
  // the <input type="datetime-local"> control expects.
  if (!mysqlDatetime) return "";
  return mysqlDatetime.replace(" ", "T").slice(0, 16);
}

function openEventModal(ev, categories, venues) {
  const isEdit = !!ev;
  const user = getCurrentUser();

  openModal(`
    <h3>${isEdit ? "Edit event" : "Add event"}</h3>
    <form id="event-form">
      <label for="ev_title">Title</label>
      <input type="text" id="ev_title" value="${isEdit ? escapeHtml(ev.title) : ""}" required />

      <label for="ev_description">Description</label>
      <textarea id="ev_description" rows="3">${isEdit ? escapeHtml(ev.description || "") : ""}</textarea>

      <label for="ev_category">Category</label>
      <select id="ev_category" required>
        ${categories.map((c) => `<option value="${c.id}" ${isEdit && ev.category_id === c.id ? "selected" : ""}>${escapeHtml(c.category_name)}</option>`).join("")}
      </select>

      <label for="ev_venue">Venue</label>
      <select id="ev_venue" required>
        ${venues.map((v) => `<option value="${v.id}" ${isEdit && ev.venue_id === v.id ? "selected" : ""}>${escapeHtml(v.name)}</option>`).join("")}
      </select>
      <div class="field-hint" id="ev-venue-booking-hint">Choose a venue, date and time covered by your own confirmed venue reservation.</div>
      ${user.role === "organiser" ? `<p class="event-availability-shortcut"><a href="#" id="event-go-availability">Haven't booked a venue yet? Check Venue Availability →</a></p>` : ""}

      <label for="ev_start">Start date & time</label>
      <input type="datetime-local" id="ev_start" value="${isEdit ? toLocalInputValue(ev.start_datetime) : ""}" required />

      <label for="ev_end">End date & time</label>
      <input type="datetime-local" id="ev_end" value="${isEdit ? toLocalInputValue(ev.end_datetime) : ""}" required />

      <label for="ev_price">Ticket price (RM)</label>
      <input type="number" id="ev_price" min="0" step="0.01" value="${isEdit ? ev.ticket_price : ""}" required />

      <label for="ev_total">Total tickets</label>
      <input type="number" id="ev_total" min="1" value="${isEdit ? ev.total_tickets : ""}" required />

      ${
        isEdit
          ? `<label for="ev_status">Status</label>
             <select id="ev_status">
               <option value="upcoming" ${ev.status === "upcoming" ? "selected" : ""}>Upcoming</option>
               <option value="completed" ${ev.status === "completed" ? "selected" : ""}>Completed</option>
               <option value="cancelled" ${ev.status === "cancelled" ? "selected" : ""}>Cancelled</option>
             </select>`
          : ""
      }

      ${
        !isEdit && user.role === "admin"
          ? `<label for="ev_organiser">Organiser ID</label>
             <input type="number" id="ev_organiser" placeholder="user id of the organiser" required />
             <div class="field-hint">Admins must pick which organiser owns this event (check the Users tab for IDs).</div>`
          : ""
      }

      <div class="form-actions">
        <button type="button" class="btn secondary" id="event-cancel-btn">Cancel</button>
        <button type="submit" class="btn">${isEdit ? "Save changes" : "Create event"}</button>
      </div>
    </form>
  `);

  document
    .getElementById("event-cancel-btn")
    .addEventListener("click", closeModal);

  const availabilityLink = document.getElementById("event-go-availability");
  if (availabilityLink) {
    availabilityLink.addEventListener("click", (e) => {
      e.preventDefault();
      // Close the modal, then navigate to the calendar. The form is not submitted.
      closeModal();
      showSection("availability");
    });
  }

  const venueSelect = document.getElementById("ev_venue");
  const startInput = document.getElementById("ev_start");
  const endInput = document.getElementById("ev_end");

  async function refreshBookedVenueOptions() {
    if (user.role !== "organiser" || isEdit) return;
    const startValue = startInput.value;
    const endValue = endInput.value;
    const hint = document.getElementById("ev-venue-booking-hint");

    if (!startValue || !endValue || startValue >= endValue) {
      venueSelect.innerHTML = '<option value="">Choose event date and time first</option>';
      if (hint) hint.textContent = "Select the event start and end time to see venues you have reserved.";
      return;
    }

    venueSelect.innerHTML = '<option value="">Checking your venue reservations...</option>';
    const matching = [];
    for (const venue of venues) {
      try {
        const response = await apiGet(`/venues/${encodeURIComponent(venue.id)}/unavailability`);
        if (!response.ok) continue;
        const data = response.data;
        const records = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
        const covered = records.some(record => {
          const recordType = String(record.record_type || "").toLowerCase();
          if (recordType !== "organiser_booking") return false;
          if (String(record.booked_by) !== String(user.id)) return false;
          if (String(record.venue_id ?? venue.id) !== String(venue.id)) return false;
          const recordDate = record.unavailability_date || record.date;
          if (recordDate !== startValue.slice(0, 10) || recordDate !== endValue.slice(0, 10)) return false;
          const bookedStart = new Date(`${recordDate}T${String(record.start_time || "").slice(0, 5)}:00`).getTime();
          const bookedEnd = new Date(`${recordDate}T${String(record.end_time || "").slice(0, 5)}:00`).getTime();
          const eventStart = new Date(startValue).getTime();
          const eventEnd = new Date(endValue).getTime();
          return Number.isFinite(bookedStart) && Number.isFinite(bookedEnd) &&
            eventStart >= bookedStart && eventEnd <= bookedEnd && eventStart < eventEnd;
        });
        if (covered) matching.push(venue);
      } catch (error) {
        console.warn("Could not check organiser venue reservation", venue.id, error);
      }
    }

    venueSelect.innerHTML = matching.length
      ? matching.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("")
      : '<option value="">No matching venue reservation</option>';
    if (hint) hint.textContent = matching.length
      ? "Only venues reserved by you for the full selected event period are shown."
      : "You have no venue reservation covering this date and time. Use the link above to book a venue first.";
  }

  if (user.role === "organiser" && !isEdit) {
    startInput.addEventListener("change", refreshBookedVenueOptions);
    endInput.addEventListener("change", refreshBookedVenueOptions);
    refreshBookedVenueOptions();
  }

  document
    .getElementById("event-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const eventStartValue = document.getElementById("ev_start").value;
      const eventEndValue = document.getElementById("ev_end").value;
      if (!eventStartValue || !eventEndValue || eventStartValue >= eventEndValue) {
        toast("Event end date and time must be later than its start.");
        return;
      }

      if (!isEdit && user.role === "organiser") {
        // Re-check immediately before creating to avoid relying on a stale dropdown.
        await refreshBookedVenueOptions();
        const selectedVenue = document.getElementById("ev_venue").value;
        if (!selectedVenue) {
          toast("Book a venue for this date and time before creating the event.");
          return;
        }
      }

      const body = {
        title: document.getElementById("ev_title").value.trim(),
        description: document.getElementById("ev_description").value.trim(),
        category_id: Number(document.getElementById("ev_category").value),
        venue_id: Number(document.getElementById("ev_venue").value),
        start_datetime:
          document.getElementById("ev_start").value.replace("T", " ") + ":00",
        end_datetime:
          document.getElementById("ev_end").value.replace("T", " ") + ":00",
        ticket_price: Number(document.getElementById("ev_price").value),
        total_tickets: Number(document.getElementById("ev_total").value),
      };

      if (isEdit) {
        body.status = document.getElementById("ev_status").value;
      } else if (user.role === "admin") {
        body.organiser_id = Number(
          document.getElementById("ev_organiser").value,
        );
      }

      const result = isEdit
        ? await apiPut("/events/" + ev.id, body)
        : await apiPost("/events", body);

      if (result.ok) {
        toast(isEdit ? "Event updated." : "Event created.");
        closeModal();
        if (currentSection === "events") renderEvents();
      } else {
        toastApiError(result);
      }
    });
}

async function deleteEvent(id) {
  if (
    !confirm(
      "Delete this event? This only works if it has no pending/confirmed bookings.",
    )
  )
    return;
  const result = await apiDelete("/events/" + id);
  if (result.ok) {
    toast("Event deleted.");
    renderEvents();
  } else {
    toastApiError(result);
  }
}

// ---------------------------------------------------------------
// Booking a ticket (customer)
// ---------------------------------------------------------------

function openBookingModal(ev) {
  openModal(`
    <h3>Book: ${escapeHtml(ev.title)}</h3>
    <p class="field-hint">${ev.available_tickets} tickets left &middot; ${formatMoney(ev.ticket_price)} each</p>
    <form id="booking-form">
      <label for="book_quantity">Quantity</label>
      <div class="qty-stepper">
        <input type="number" id="book_quantity" min="1" max="${ev.available_tickets}" value="1" required />
        <span id="book_total">${formatMoney(ev.ticket_price)}</span>
      </div>

      <div class="form-actions">
        <button type="button" class="btn secondary" id="booking-cancel-btn">Cancel</button>
        <button type="submit" class="btn">Book now</button>
      </div>
    </form>
  `);

  const qtyInput = document.getElementById("book_quantity");
  const totalLabel = document.getElementById("book_total");
  qtyInput.addEventListener("input", () => {
    const qty = Number(qtyInput.value) || 0;
    totalLabel.textContent = formatMoney(qty * ev.ticket_price);
  });

  document
    .getElementById("booking-cancel-btn")
    .addEventListener("click", closeModal);
  document
    .getElementById("booking-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const quantity = Number(qtyInput.value);

      const result = await apiPost("/bookings", { event_id: ev.id, quantity });
      if (result.ok) {
        toast("Booking created. Go to the Bookings tab to pay for it.");
        closeModal();
        if (currentSection === "events") loadMyBookingsSidebar();
      } else {
        toastApiError(result);
      }
    });
}

// ---------------------------------------------------------------
// "My bookings" sidebar card (customers only)
// ---------------------------------------------------------------

async function loadMyBookingsSidebar() {
  const listEl = document.getElementById("my-bookings-list");
  const countEl = document.getElementById("my-bookings-count");
  listEl.innerHTML = '<div class="sidebar-empty">Loading...</div>';

  const result = await apiGet("/bookings" + buildQuery({ per_page: 5 }));
  if (!result.ok) {
    listEl.innerHTML =
      '<div class="sidebar-empty">Could not load bookings.</div>';
    return;
  }

  const bookings = result.data.items || [];
  countEl.textContent = result.data.pagination.total;

  if (bookings.length === 0) {
    listEl.innerHTML =
      '<div class="sidebar-empty">No bookings yet. Book an event to see it here.</div>';
    return;
  }

  listEl.innerHTML = bookings
    .map(
      (b) => `
      <div class="sidebar-item">
        <div class="si-when">${b.booking_code}</div>
        <div class="si-what">
          ${escapeHtml(b.event_title)}<br/>
          <span class="status-pill status-${b.status}">${b.status}</span>
        </div>
      </div>`,
    )
    .join("");

  const actions = document.createElement("div");
  actions.className = "sidebar-actions";
  actions.innerHTML = `<button class="btn" id="sidebar-view-bookings">View all bookings</button>`;
  listEl.appendChild(actions);
  document
    .getElementById("sidebar-view-bookings")
    .addEventListener("click", () => showSection("bookings"));
}
