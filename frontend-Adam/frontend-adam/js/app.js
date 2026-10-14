// ============================================================
// app.js
// The "shell" of the dashboard: top nav, section switching,
// modal helpers, toast messages and the notification bell.
// Each section (events, venues, ...) has its own js file that
// defines a render function; this file just calls it.
// ============================================================

// List of nav sections. "roles" controls who sees the nav link
// and tab, matching docs/PERMISSION-MATRIX.md. The backend also
// enforces this - this is just so the UI doesn't show buttons
// a user isn't allowed to use.
const NAV_ITEMS = [
  { id: "overview", label: "Overview", roles: ["admin", "organiser", "customer"], render: () => renderOverview() },
  { id: "events", label: "Event", roles: ["admin", "organiser", "customer"], render: () => renderEvents() },
  { id: "bookings", label: "Booking", roles: ["admin", "organiser", "customer"], render: () => renderBookings() },
  { id: "payments", label: "Payment", roles: ["admin", "organiser", "customer"], render: () => renderPayments() },
  { id: "notifications", label: "Notification", roles: ["admin", "organiser", "customer"], render: () => renderNotificationsPage() },
  { id: "venues", label: "Venue", roles: ["admin", "organiser", "customer"], render: () => renderVenues() },
  { id: "availability", label: "Venue Availability", roles: ["admin", "organiser"], render: () => renderAvailability() },
  { id: "users", label: "Users", roles: ["admin"], render: () => renderUsers() },
];

let currentSection = null;

document.addEventListener("DOMContentLoaded", () => {
  requireLogin();

  const user = getCurrentUser();
  if (!user) return;

  document.getElementById("topnav-name").textContent = user.name;
  document.getElementById("role-badge").textContent = user.role;

  buildNav(user);
  const usersSection = document.getElementById("section-users");
  if (usersSection) usersSection.style.display = user.role === "admin" ? "" : "none";
  wireTopnav();
  const isStaff = user.role === "admin" || user.role === "organiser";
  // Notifications are a navigation page for all roles; hide the bell for everyone.
  const notifWrap = document.querySelector(".notif-wrap");
  if (notifWrap) notifWrap.style.display = "none";
  const composeWrap = document.getElementById("notif-compose-wrap");
  if (composeWrap) composeWrap.style.display = "none";

  // Overview is the landing page for every role.
  showSection("overview");
});

// ---------------------------------------------------------------
// Nav bar
// ---------------------------------------------------------------

function buildNav(user) {
  const nav = document.getElementById("navlinks");
  nav.innerHTML = "";
  NAV_ITEMS.forEach((item) => {
    if (!item.roles.includes(user.role)) return;
    const btn = document.createElement("button");
    btn.className = "navlink";
    btn.textContent = item.label;
    btn.dataset.section = item.id;
    btn.addEventListener("click", () => showSection(item.id));
    nav.appendChild(btn);
  });
}

function showSection(id) {
  currentSection = id;

  document.querySelectorAll(".navlink").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === id);
  });
  document.querySelectorAll(".dash-section").forEach((el) => {
    el.classList.toggle("active", el.id === "section-" + id);
  });

  const item = NAV_ITEMS.find((i) => i.id === id);
  if (item) item.render();
}

function wireTopnav() {
  document.getElementById("logout-btn").addEventListener("click", logout);

  // Notification bell toggle
  const bellBtn = document.getElementById("notif-bell");
  const dropdown = document.getElementById("notif-dropdown");
  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== bellBtn) {
      dropdown.classList.remove("open");
    }
  });

  document.getElementById("notif-compose-link").addEventListener("click", openComposePage);
  document.getElementById("fullpage-back").addEventListener("click", closeComposePage);
  const sendBtn = document.getElementById("notification-send-btn");
  const announcementBtn = document.getElementById("notification-announcement-btn");
  const cancelBtn = document.getElementById("notification-compose-cancel");
  if (sendBtn) sendBtn.addEventListener("click", () => openNotificationComposer(false));
  if (announcementBtn) announcementBtn.addEventListener("click", () => openNotificationComposer(true));
  if (cancelBtn) cancelBtn.addEventListener("click", closeNotificationComposer);
}

// ---------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------

/**
 * Shows a small floating message. type is "success" or "error".
 * Used everywhere instead of alert() so API error messages are
 * always shown the same way.
 */
function toast(message, type = "success") {
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Convenience: show an error toast from an apiFetch() result.
function toastApiError(result) {
  let msg = result.message || "Something went wrong.";
  if (result.errors) {
    const firstKey = Object.keys(result.errors)[0];
    if (firstKey) msg = result.errors[firstKey];
  }
  toast(msg, "error");
}

// ---------------------------------------------------------------
// Modal (create/edit forms)
// ---------------------------------------------------------------

function openModal(innerHtml) {
  const backdrop = document.getElementById("modal-backdrop");
  const modal = document.getElementById("modal");
  modal.innerHTML = '<button type="button" class="modal-close" id="modal-close-btn">&times;</button>' + innerHtml;
  backdrop.classList.add("open");
  document.body.classList.add("modal-is-open");
  document.getElementById("modal-close-btn").addEventListener("click", closeModal);
}

function closeModal() {
  document.getElementById("modal-backdrop").classList.remove("open");
  document.body.classList.remove("modal-is-open");
  document.getElementById("modal").innerHTML = "";
}

// Close modal when clicking the dark backdrop itself (not its content)
document.addEventListener("DOMContentLoaded", () => {
  const backdrop = document.getElementById("modal-backdrop");
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
});

// ---------------------------------------------------------------
// Notifications (bell dropdown + full page compose screen)
// ---------------------------------------------------------------

async function loadNotifications() {
  const result = await apiGet("/notifications" + buildQuery({ per_page: 10 }));
  const dropdown = document.getElementById("notif-list");
  const badge = document.getElementById("notif-badge");

  if (!result.ok) {
    dropdown.innerHTML = '<div class="notif-empty">Could not load notifications.</div>';
    return;
  }

  const items = result.data.items || [];
  const unread = items.filter((n) => !n.is_read).length;

  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }

  if (items.length === 0) {
    dropdown.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }

  dropdown.innerHTML = items
    .map(
      (n) => `
      <div class="notif-item ${n.is_read ? "read" : ""}">
        <div class="notif-dot"></div>
        <div class="notif-body">
          <div class="notif-title">${escapeHtml(n.title)}</div>
          <div class="notif-msg">${escapeHtml(n.message)}</div>
          <div class="notif-time">${formatDateTime(n.created_at)}</div>
        </div>
        ${n.is_read ? "" : `<button class="notif-mark" data-id="${n.id}">Mark read</button>`}
      </div>`
    )
    .join("");

  dropdown.querySelectorAll(".notif-mark").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const result = await apiPut("/notifications/" + id + "/read", {});
      if (result.ok) {
        loadNotifications();
      } else {
        toastApiError(result);
      }
    });
  });
}

function openComposePage() {
  document.getElementById("notif-dropdown").classList.remove("open");
  document.getElementById("fullpage-compose").classList.add("open");
  if (typeof renderComposeForm === "function") renderComposeForm();
}

function closeComposePage() {
  document.getElementById("fullpage-compose").classList.remove("open");
}

// ---------------------------------------------------------------
// Small shared helpers used across section files
// ---------------------------------------------------------------

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T"));
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatMoney(value) {
  const num = Number(value);
  return "RM " + (isNaN(num) ? value : num.toFixed(2));
}

/**
 * Renders a simple pagination row into the given container element.
 * `pagination` is the {page, per_page, total, total_pages} object
 * the API returns, `onChange` is called with the new page number.
 */
function renderPagination(container, pagination, onChange) {
  if (!pagination || pagination.total_pages <= 1) {
    container.innerHTML = "";
    return;
  }
  const { page, total_pages, total } = pagination;
  container.innerHTML = `
    <div class="pagination-row">
      <span>Page ${page} of ${total_pages} (${total} total)</span>
      <button class="btn secondary small" id="page-prev" ${page <= 1 ? "disabled" : ""}>Prev</button>
      <button class="btn secondary small" id="page-next" ${page >= total_pages ? "disabled" : ""}>Next</button>
    </div>`;
  const prev = container.querySelector("#page-prev");
  const next = container.querySelector("#page-next");
  if (prev) prev.addEventListener("click", () => onChange(page - 1));
  if (next) next.addEventListener("click", () => onChange(page + 1));
}
