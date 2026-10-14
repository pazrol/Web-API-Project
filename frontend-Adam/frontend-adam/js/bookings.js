/* =========================================================
   BOOKINGS
   Frontend-only booking filters and Upcoming / Past grids.
   Existing backend API contract is preserved.
   ========================================================= */

let bookingsPage = 1;
// Cache booking list details so the QR popup can show event information even when the QR endpoint returns only the booking reference.
const bookingDetailsCache = new Map();
let bookingsFilters = {
  search: "",
  status: "pending",
};

async function renderBookings() {
  const user = getCurrentUser();
  const title = document.getElementById("bookings-title");

  if (title) {
    title.textContent = user.role === "customer" ? "My bookings" : "Bookings";
  }

  const toolbar = document.getElementById("bookings-toolbar");

  toolbar.innerHTML = `
    <div class="booking-controls">
      <input
        type="search"
        id="booking-search"
        class="booking-search"
        placeholder="Search by code or event..."
        value="${escapeHtml(bookingsFilters.search)}"
        aria-label="Search bookings"
      />
    </div>

    <nav class="booking-status-tabs" aria-label="Booking status">
      <button type="button" class="booking-status-tab"
        data-status="pending">Pending</button>
      <button type="button" class="booking-status-tab"
        data-status="confirmed">Confirmed</button>
      <button type="button" class="booking-status-tab"
        data-status="cancelled">Cancelled</button>
    </nav>
  `;

  updateBookingTabs();

  toolbar.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      bookingsFilters.status = button.dataset.status;
      bookingsPage = 1;
      updateBookingTabs();
      loadBookingsList();
    });
  });

  document.getElementById("booking-search").addEventListener("input", (e) => {
    bookingsFilters.search = e.target.value;
    bookingsPage = 1;
    loadBookingsList();
  });

  loadBookingsList();
}

function updateBookingTabs() {
  document.querySelectorAll(".booking-status-tab").forEach((tab) => {
    const active = tab.dataset.status === bookingsFilters.status;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
}

async function loadBookingsList() {
  const container = document.getElementById("bookings-list");
  const pagination = document.getElementById("bookings-pagination");

  container.innerHTML = '<div class="loading-text">Loading bookings...</div>';

  pagination.innerHTML = "";

  const result = await apiGet(
    "/bookings" +
      buildQuery({
        search: bookingsFilters.search,
        status: bookingsFilters.status,
        page: bookingsPage,
        per_page: 100,
      }),
  );

  if (!result.ok) {
    container.innerHTML =
      '<div class="empty-state">Could not load bookings. Please try again.</div>';
    toastApiError(result);
    return;
  }

  const data = result.data || {};
  const bookings = Array.isArray(data.items) ? data.items : [];
  bookings.forEach((booking) =>
    bookingDetailsCache.set(String(booking.id), booking),
  );
  const user = getCurrentUser();

  if (!bookings.length) {
    container.innerHTML = `
      <div class="booking-empty">
        <div class="booking-empty-icon">▤</div>
        <h3>No ${escapeHtml(bookingsFilters.status)} bookings</h3>
        <p>Bookings with this status will appear here.</p>
      </div>
    `;
    renderPagination(pagination, data.pagination, (page) => {
      bookingsPage = page;
      loadBookingsList();
    });
    return;
  }

  const now = new Date();

  const upcoming = [];
  const past = [];

  bookings.forEach((booking) => {
    const eventDate = parseBookingDate(booking.start_datetime);

    if (eventDate && eventDate < now) {
      past.push(booking);
    } else {
      upcoming.push(booking);
    }
  });

  upcoming.sort((a, b) => {
    return getBookingTimestamp(a) - getBookingTimestamp(b);
  });

  past.sort((a, b) => {
    return getBookingTimestamp(b) - getBookingTimestamp(a);
  });

  container.innerHTML = `
    <section class="booking-group">
      <div class="booking-group-heading">
        <div>
          <h3>Upcoming</h3>
          <p>Your upcoming events and tickets</p>
        </div>
        <span class="booking-count">${upcoming.length}</span>
      </div>

      ${
        upcoming.length
          ? `<div class="booking-grid">
              ${upcoming.map((b) => bookingCardHtml(b, user, "upcoming")).join("")}
            </div>`
          : `<div class="booking-empty booking-empty-compact">
              <p>No upcoming bookings in this status.</p>
            </div>`
      }
    </section>

    <section class="booking-group booking-past-group">
      <div class="booking-group-heading">
        <div>
          <h3>Past</h3>
          <p>Your previous events and bookings</p>
        </div>
        <span class="booking-count">${past.length}</span>
      </div>

      ${
        past.length
          ? `<div class="booking-grid">
              ${past.map((b) => bookingCardHtml(b, user, "past")).join("")}
            </div>`
          : `<div class="booking-empty booking-empty-compact">
              <p>No past bookings in this status.</p>
            </div>`
      }
    </section>
  `;

  // Keep all existing booking actions connected to their original handlers.
  bookings.forEach((booking) => {
    const payButton = container.querySelector(`[data-pay="${booking.id}"]`);
    const cancelButton = container.querySelector(
      `[data-cancel="${booking.id}"]`,
    );
    const qrButton = container.querySelector(`[data-qr="${booking.id}"]`);

    if (payButton) {
      payButton.addEventListener("click", () => openPaymentModal(booking));
    }

    if (cancelButton) {
      cancelButton.addEventListener("click", () => cancelBooking(booking.id));
    }

    if (qrButton) {
      qrButton.addEventListener("click", () => openQrModal(booking.id));
    }
  });

  renderPagination(pagination, data.pagination, (page) => {
    bookingsPage = page;
    loadBookingsList();
  });
}

function parseBookingDate(value) {
  if (!value) return null;

  // MySQL DATETIME commonly arrives without a timezone.
  // Treat it as local time instead of silently converting to UTC.
  const normalized = String(value).includes("T")
    ? String(value)
    : String(value).replace(" ", "T");

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBookingTimestamp(booking) {
  const date = parseBookingDate(booking.start_datetime);
  return date ? date.getTime() : 0;
}

function bookingCardHtml(b, user, section) {
  const canPay = user.role === "customer" && b.status === "pending";

  const canCancel = b.status !== "cancelled";
  const canQr = b.status === "confirmed";

  const date = parseBookingDate(b.start_datetime);
  const dateLabel = date
    ? date.toLocaleDateString("en-MY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Date unavailable";

  const timeLabel = date
    ? date.toLocaleTimeString("en-MY", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";

  const bookingCode = escapeHtml(b.booking_code || "Booking");
  const eventTitle = escapeHtml(b.event_title || "Untitled event");
  const venueName = escapeHtml(b.venue_name || "Venue unavailable");
  const customerName = escapeHtml(b.customer_name || "");
  const status = escapeHtml(String(b.status || "").toLowerCase());
  const paymentStatus = String(b.payment_status || "").toLowerCase();

  return `
    <article class="booking-card booking-card-${section}">
      <div class="booking-card-top">
        <span class="booking-code">${bookingCode}</span>
        <span class="booking-status-pill status-${status}">
          ${status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown"}
        </span>
      </div>

      <div class="booking-card-content">
        <h4 class="booking-event-title">${eventTitle}</h4>

        <div class="booking-card-tags">
          ${
            b.payment_status
              ? `<span class="booking-payment-pill status-${escapeHtml(paymentStatus)}">
                  Payment: ${escapeHtml(paymentStatus)}
                </span>`
              : ""
          }
        </div>

        <div class="booking-event-details">
          <div class="booking-detail">
            <span class="booking-detail-icon">▦</span>
            <span>${dateLabel}${timeLabel ? " · " + timeLabel : ""}</span>
          </div>

          <div class="booking-detail">
            <span class="booking-detail-icon">⌖</span>
            <span>${venueName}</span>
          </div>

          <div class="booking-detail">
            <span class="booking-detail-icon">♟</span>
            <span>Qty ${Number(b.quantity) || 0}</span>
          </div>

          ${
            customerName
              ? `<div class="booking-detail booking-customer-detail">
                  <span>${customerName}</span>
                </div>`
              : ""
          }
        </div>
      </div>

      <div class="booking-card-footer">
        <div class="booking-price">
          ${formatMoney(b.total_amount)}
        </div>

        <div class="booking-card-actions">
          ${
            canPay
              ? `<button type="button" class="btn small booking-action-primary"
                  data-pay="${b.id}">Pay now</button>`
              : ""
          }

          ${
            canQr
              ? `<button type="button" class="btn small secondary"
                  data-qr="${b.id}">QR ticket</button>`
              : ""
          }

          ${
            canCancel
              ? `<button type="button" class="icon-btn booking-cancel-btn"
                  data-cancel="${b.id}" title="Cancel booking"
                  aria-label="Cancel booking ${bookingCode}">&#10005;</button>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

async function cancelBooking(id) {
  if (!confirm("Cancel this booking?")) return;

  const result = await apiDelete("/bookings/" + id);

  if (result.ok) {
    toast("Booking cancelled.");
    loadBookingsList();
  } else {
    toastApiError(result);
  }
}

function openQrModal(bookingId) {
  openModal(`
    <div class="qr-ticket-card qr-ticket-compact">
      <h3>Ticket QR code</h3>
      <div class="loading-text" id="qr-loading">Generating QR code...</div>
      <img class="qr-preview" id="qr-image"
        style="display:none;" alt="Ticket QR code" />
      <div class="qr-ticket-code" id="qr-ticket-code"></div>
      <div class="qr-ticket-data" id="qr-ticket-data"></div>
      <div class="qr-copy-row">
        <button class="btn small secondary" id="qr-copy-btn"
          type="button" style="display:none;">Copy ticket data</button>
      </div>
      <section class="qr-event-details" id="qr-event-details" style="display:none;" aria-label="Event information">
        <h4>Event information</h4>
        <div class="qr-event-grid" id="qr-event-grid"></div>
      </section>
      <p class="qr-ticket-note" id="qr-ticket-note" style="display:none;">
        Present this QR code to event staff upon arrival for booking verification.
      </p>
    </div>
  `);

  apiGet("/bookings/" + bookingId + "/qr", {
    extraHeaders: { "X-API-Key": API_KEY },
  })
    .then((result) => {
      const loading = document.getElementById("qr-loading");
      const img = document.getElementById("qr-image");
      const code = document.getElementById("qr-ticket-code");
      const data = document.getElementById("qr-ticket-data");
      const copyBtn = document.getElementById("qr-copy-btn");
      const note = document.getElementById("qr-ticket-note");
      const eventDetails = document.getElementById("qr-event-details");
      const eventGrid = document.getElementById("qr-event-grid");

      if (!loading || !img) return;

      if (!result.ok) {
        loading.textContent =
          result.message || "Could not generate the QR code.";
        return;
      }

      const ticketData = String(
        result.data.booking_code || result.data.qr_data || "",
      ).trim();

      if (!ticketData) {
        loading.textContent = "No ticket data was returned by the API.";
        return;
      }

      // QR image generation is frontend-only. No backend files are changed.
      const qrUrl =
        "https://api.qrserver.com/v1/create-qr-code/" +
        "?size=400x400&margin=12&ecc=Q&data=" +
        encodeURIComponent(ticketData);

      img.onload = () => {
        loading.style.display = "none";
        img.style.display = "block";
      };

      img.onerror = () => {
        loading.style.display = "block";
        loading.textContent =
          "Could not load the QR image. Check your internet connection.";
        img.style.display = "none";
      };

      img.src = qrUrl;
      // Keep the QR payload limited to the booking reference. Event information
      // belongs in the popup panel, sourced first from the booking card cache.
      const cachedBooking = bookingDetailsCache.get(String(bookingId)) || {};
      const ticket = { ...cachedBooking, ...(result.data || {}) };
      // Some QR endpoints return only booking_code/qr_data, so prefer cached
      // booking-list values for display fields when the QR response omits them.
      const pick = (...values) =>
        values.find(
          (v) => v !== undefined && v !== null && String(v).trim() !== "",
        );
      code.textContent = pick(
        cachedBooking.booking_code,
        ticket.booking_code,
        "Ticket",
      );

      // Remove the duplicate booking reference below the QR code.
      data.textContent = "";
      data.style.display = "none";

      const dateValue = pick(
        cachedBooking.start_datetime,
        cachedBooking.event_start_datetime,
        cachedBooking.event?.start_datetime,
        ticket.start_datetime,
        ticket.event_start_datetime,
        ticket.event?.start_datetime,
      );
      const endValue = pick(
        cachedBooking.end_datetime,
        cachedBooking.event_end_datetime,
        cachedBooking.event?.end_datetime,
        ticket.end_datetime,
        ticket.event_end_datetime,
        ticket.event?.end_datetime,
      );
      const formatDate = (value) => {
        if (!value) return "Not available";
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime())
          ? String(value)
          : parsed.toLocaleString("en-MY", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
      };
      const eventName = pick(
        cachedBooking.event_title,
        cachedBooking.title,
        cachedBooking.event?.title,
        ticket.event_title,
        ticket.title,
        ticket.event?.title,
        "Event information unavailable",
      );
      const venueName = pick(
        cachedBooking.venue_name,
        cachedBooking.venue_title,
        cachedBooking.venue?.name,
        ticket.venue_name,
        ticket.venue_title,
        ticket.venue?.name,
        "Venue unavailable",
      );
      const dateText = dateValue
        ? `${formatDate(dateValue)}${endValue ? " – " + formatDate(endValue) : ""}`
        : "Date/time unavailable";
      const details = [
        ["Event", eventName],
        ["Date & time", dateText],
        ["Venue", venueName],
        [
          "Address",
          pick(
            cachedBooking.venue_address,
            cachedBooking.address,
            cachedBooking.venue?.address,
            ticket.venue_address,
            ticket.address,
            ticket.venue?.address,
          ),
        ],
        [
          "Ticket quantity",
          pick(
            cachedBooking.quantity,
            cachedBooking.ticket_quantity,
            ticket.quantity,
            ticket.ticket_quantity,
          ),
        ],
        [
          "Total",
          pick(
            cachedBooking.total_amount,
            cachedBooking.total_price,
            ticket.total_amount,
            ticket.total_price,
          ),
        ],
        ["Payment", pick(cachedBooking.payment_status, ticket.payment_status)],
        ["Booking status", pick(cachedBooking.status, ticket.status)],
      ].filter(
        ([, value]) =>
          value !== undefined && value !== null && String(value).trim() !== "",
      );
      if (eventGrid && eventDetails) {
        eventGrid.innerHTML = details
          .map(
            ([label, value]) =>
              `<div class="qr-event-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`,
          )
          .join("");
        eventDetails.style.display = "block";
      }

      copyBtn.style.display = "inline-flex";
      note.style.display = "block";

      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(ticketData);
          copyBtn.textContent = "Copied";
        } catch (error) {
          const helper = document.createElement("textarea");
          helper.value = ticketData;
          helper.setAttribute("readonly", "");
          helper.style.position = "fixed";
          helper.style.opacity = "0";
          document.body.appendChild(helper);
          helper.select();

          const copied = document.execCommand("copy");
          helper.remove();

          copyBtn.textContent = copied
            ? "Copied"
            : "Select the ticket data above to copy";
        }
      });
    })
    .catch(() => {
      const loading = document.getElementById("qr-loading");
      if (loading) {
        loading.textContent =
          "Could not load ticket QR data. Please try again.";
      }
    });
}
