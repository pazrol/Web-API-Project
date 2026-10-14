// ============================================================
// notifications.js
// The bell dropdown + mark-as-read live in app.js (loadNotifications)
// since they're part of the shared top nav. This file only builds
// the full-page "compose notification" screen for admin/organiser.
// ============================================================

let selectedRecipientId = null; // null = nothing picked, "all" = broadcast

async function renderComposeForm() {
  const user = getCurrentUser();
  const wrap = document.getElementById("compose-form-wrap");

  // Hide the compose entry point entirely for customers.
  document.getElementById("notif-compose-wrap").style.display =
    user.role === "admin" || user.role === "organiser" ? "block" : "none";

  wrap.innerHTML = '<div class="loading-text">Loading customers...</div>';

  // GET /users is admin-only (see PERMISSION-MATRIX.md), so an organiser
  // can't list every customer that way. Instead, for organisers we pull
  // the list of customers from their own events' bookings (GET /bookings
  // is already scoped server-side to "own-event bookings" for organisers).
  let customers = [];
  if (user.role === "admin") {
    const result = await apiGet("/users" + buildQuery({ role: "customer", per_page: 50 }));
    if (!result.ok) {
      wrap.innerHTML = '<div class="empty-state">Could not load customers.</div>';
      toastApiError(result);
      return;
    }
    customers = result.data.items || [];
  } else {
    const result = await apiGet("/bookings" + buildQuery({ per_page: 50 }));
    if (!result.ok) {
      wrap.innerHTML = '<div class="empty-state">Could not load customers.</div>';
      toastApiError(result);
      return;
    }
    const seen = new Set();
    (result.data.items || []).forEach((b) => {
      if (!seen.has(b.customer_id)) {
        seen.add(b.customer_id);
        customers.push({ id: b.customer_id, name: b.customer_name, email: "" });
      }
    });
  }
  selectedRecipientId = null;

  wrap.innerHTML = `
    <form id="compose-form">
      <label>Recipient</label>
      <div class="recipient-grid" id="recipient-grid">
        <div class="recipient-option all-option" data-id="all">
          <div class="ro-avatar">ALL</div>
          <div>
            <div class="ro-name">All customers</div>
            <div class="ro-role">broadcast</div>
          </div>
        </div>
        ${customers
          .map(
            (c) => `
          <div class="recipient-option" data-id="${c.id}">
            <div class="ro-avatar">${(c.name || "?").slice(0, 2).toUpperCase()}</div>
            <div>
              <div class="ro-name">${escapeHtml(c.name)}</div>
              <div class="ro-role">${escapeHtml(c.email || "customer")}</div>
            </div>
          </div>`
          )
          .join("")}
      </div>

      <label for="notif_title">Title</label>
      <input type="text" id="notif_title" required />

      <label for="notif_message">Message</label>
      <textarea id="notif_message" rows="4" required></textarea>

      <label for="notif_type">Type</label>
      <select id="notif_type">
        <option value="general">General</option>
        <option value="event_updated">Event updated</option>
        <option value="event_reminder">Event reminder</option>
        <option value="booking_confirmed">Booking confirmed</option>
        <option value="booking_cancelled">Booking cancelled</option>
        <option value="payment">Payment</option>
        <option value="refund">Refund</option>
      </select>

      <div class="form-actions">
        <button type="submit" class="btn btn-full">Send notification</button>
      </div>
    </form>
  `;

  document.querySelectorAll("#recipient-grid .recipient-option").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll("#recipient-grid .recipient-option").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      selectedRecipientId = el.dataset.id;
    });
  });

  document.getElementById("compose-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedRecipientId) {
      toast("Pick a recipient first.", "error");
      return;
    }

    const body = {
      title: document.getElementById("notif_title").value.trim(),
      message: document.getElementById("notif_message").value.trim(),
      notification_type: document.getElementById("notif_type").value,
    };

    if (selectedRecipientId === "all") {
      body.broadcast = true;
    } else {
      body.recipient_id = Number(selectedRecipientId);
    }

    const result = await apiPost("/notifications", body);
    if (result.ok) {
      toast("Notification sent.");
      closeComposePage();
      loadNotifications();
    } else {
      toastApiError(result);
    }
  });
}


// Full inbox page used by organiser/admin roles.
async function renderNotificationsPage() {
  const list = document.getElementById("notifications-page-list");
  if (!list) return;

  // Customers can read their inbox but cannot compose notifications.
  const currentUser = getCurrentUser();
  const notificationsSection = document.getElementById("section-notifications");
  const actions = notificationsSection?.querySelector(".notification-page-actions");
  const composer = document.getElementById("notification-compose-panel");
  const canCompose = currentUser && ["admin", "organiser"].includes(String(currentUser.role).toLowerCase());
  if (notificationsSection) notificationsSection.classList.toggle("customer-readonly", !canCompose);
  if (actions) actions.style.display = canCompose ? "flex" : "none";
  if (!canCompose && composer) composer.hidden = true;
  list.innerHTML = '<div class="loading-text">Loading notifications...</div>';
  const result = await apiGet("/notifications" + buildQuery({ page: 1, per_page: 50 }));
  if (!result.ok) {
    list.innerHTML = '<div class="empty-state">Could not load notifications.</div>';
    toastApiError(result);
    return;
  }
  const data = result.data || {};
  const items = Array.isArray(data) ? data : (data.items || []);
  const total = data.pagination?.total ?? items.length;
  document.getElementById("notification-total").textContent = `${total} Total`;
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">No notifications yet.</div>';
    return;
  }
  list.innerHTML = items.map(n => `
    <article class="notification-page-item ${n.is_read ? "is-read" : "is-unread"}">
      <div class="notification-page-symbol">${n.is_read ? "✓" : "♧"}</div>
      <div class="notification-page-copy">
        <div class="notification-page-title">${escapeHtml(n.title || "Notification")}
          <span class="notification-state ${n.is_read ? "read" : "unread"}">${n.is_read ? "Read" : "Unread"}</span>
        </div>
        <p>${escapeHtml(n.message || "")}</p>
        <small>${escapeHtml(n.notification_type || "general")} · ${escapeHtml(formatDateTime(n.created_at))}</small>
      </div>
      ${n.is_read ? "" : `<button class="btn secondary small" data-notification-read="${escapeHtml(String(n.id))}">Mark read</button>`}
    </article>`).join("");
  list.querySelectorAll("[data-notification-read]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const response = await apiPut(`/notifications/${encodeURIComponent(btn.dataset.notificationRead)}/read`, {});
      if (response.ok) { toast("Notification marked as read."); renderNotificationsPage(); }
      else toastApiError(response);
    });
  });
}

function openNotificationComposer(broadcastDefault) {
  const panel = document.getElementById("notification-compose-panel");
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  renderNotificationPageForm(broadcastDefault);
}

function closeNotificationComposer() {
  const panel = document.getElementById("notification-compose-panel");
  if (panel) panel.hidden = true;
}

async function renderNotificationPageForm(broadcastDefault) {
  const wrap = document.getElementById("notification-compose-form");
  const user = getCurrentUser();
  wrap.innerHTML = '<div class="loading-text">Loading recipients...</div>';
  let customers = [];
  if (user.role === "admin") {
    const r = await apiGet("/users" + buildQuery({ role: "customer", per_page: 50 }));
    if (!r.ok) { wrap.innerHTML = '<div class="empty-state">Could not load customers.</div>'; toastApiError(r); return; }
    customers = r.data?.items || [];
  } else {
    const r = await apiGet("/bookings" + buildQuery({ per_page: 50 }));
    if (!r.ok) { wrap.innerHTML = '<div class="empty-state">Could not load booking customers.</div>'; toastApiError(r); return; }
    const seen = new Set();
    (r.data?.items || []).forEach(b => {
      if (b.customer_id && !seen.has(String(b.customer_id))) {
        seen.add(String(b.customer_id));
        customers.push({ id: b.customer_id, name: b.customer_name || `Customer ${b.customer_id}` });
      }
    });
  }
  wrap.innerHTML = `
    <form id="notification-page-form" class="notification-form">
      <div class="notification-form-grid">
        <div class="availability-field"><label for="np-recipient">Recipient</label>
          <select id="np-recipient"><option value="">Select customer</option><option value="all">All customers (announcement)</option>
          ${customers.map(c => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name || `Customer ${c.id}`)}</option>`).join("")}</select>
        </div>
        <div class="availability-field"><label for="np-type">Notification type</label>
          <select id="np-type"><option value="general">General</option><option value="event_reminder">Event reminder</option><option value="booking_update">Booking update</option><option value="payment_update">Payment update</option><option value="event_updated">Event updated</option><option value="refund">Refund</option></select>
        </div>
        <div class="availability-field notification-form-wide"><label for="np-title">Notification title</label><input id="np-title" maxlength="150" required></div>
        <div class="availability-field notification-form-wide"><label for="np-message">Message</label><textarea id="np-message" rows="4" required></textarea></div>
      </div>
      <div class="form-actions"><button class="btn" type="submit">Send notification</button></div>
    </form>`;
  const recipient = document.getElementById("np-recipient");
  if (broadcastDefault) recipient.value = "all";
  document.getElementById("notification-page-form").addEventListener("submit", async e => {
    e.preventDefault();
    const recipientValue = recipient.value;
    if (!recipientValue) { toast("Please select a recipient.", "error"); return; }
    const body = {
      title: document.getElementById("np-title").value.trim(),
      message: document.getElementById("np-message").value.trim(),
      notification_type: document.getElementById("np-type").value
    };
    if (recipientValue === "all") body.broadcast = true;
    else body.recipient_id = Number(recipientValue);
    const submit = e.submitter;
    if (submit) { submit.disabled = true; submit.textContent = "Sending..."; }
    const result = await apiPost("/notifications", body);
    if (result.ok) {
      toast("Notification sent successfully.");
      closeNotificationComposer();
      renderNotificationsPage();
    } else {
      toastApiError(result);
      if (submit) { submit.disabled = false; submit.textContent = "Send notification"; }
    }
  });
}
