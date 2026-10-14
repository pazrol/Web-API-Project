// ============================================================
// venues.js
// Venue list + create/edit/delete, and a small helper used by
// other sections (events.js, availability.js) to fill venue
// dropdowns.
// ============================================================

let venuesPage = 1;
let venuesSearch = "";

/**
 * Fetches a (large) page of venues for use in <select> dropdowns
 * elsewhere in the app. 50 is the API's max per_page.
 */
async function fetchAllVenues() {
  const result = await apiGet("/venues" + buildQuery({ per_page: 50 }));
  if (!result.ok) {
    toastApiError(result);
    return [];
  }
  return result.data.items || [];
}

async function renderVenues() {
  const user = getCurrentUser();
  const canWrite = user.role === "admin";

  const addBtn = document.getElementById("venue-add-btn");
  addBtn.style.display = canWrite ? "inline-block" : "none";
  addBtn.onclick = () => openVenueModal(null);

  const toolbar = document.getElementById("venues-toolbar");
  toolbar.innerHTML = `
    <input type="text" id="venue-search" placeholder="Search venues..." value="${escapeHtml(venuesSearch)}" />
  `;
  document.getElementById("venue-search").addEventListener("input", (e) => {
    venuesSearch = e.target.value;
    venuesPage = 1;
    loadVenuesList();
  });

  loadVenuesList();
}

async function loadVenuesList() {
  const user = getCurrentUser();
  const canWrite = user.role === "admin";
  const canBook = user.role === "organiser";
  // Customers can browse venues, but must not use the venue-list calendar
  // shortcut to enter Venue Availability.
  const canViewAvailability = user.role !== "customer";
  const container = document.getElementById("venues-list");
  container.innerHTML = '<div class="loading-text">Loading venues...</div>';

  const result = await apiGet(
    "/venues" + buildQuery({ search: venuesSearch, page: venuesPage, per_page: 10 })
  );

  if (!result.ok) {
    container.innerHTML = '<div class="empty-state">Could not load venues.</div>';
    toastApiError(result);
    return;
  }

  const venues = result.data.items || [];
  if (venues.length === 0) {
    container.innerHTML = '<div class="empty-state">No venues found.</div>';
  } else {
    container.innerHTML = venues.map((v) => venueRowHtml(v, user, canWrite, canBook, canViewAvailability)).join("");

    venues.forEach((v) => {
      const editBtn = container.querySelector(`[data-edit="${v.id}"]`);
      const delBtn = container.querySelector(`[data-delete="${v.id}"]`);
      const availBtn = container.querySelector(`[data-avail="${v.id}"]`);
      const bookBtn = container.querySelector(`[data-book-venue="${v.id}"]`);
      if (editBtn) editBtn.addEventListener("click", () => openVenueModal(v));
      if (delBtn) delBtn.addEventListener("click", () => deleteVenue(v.id));
      if (availBtn)
        availBtn.addEventListener("click", () => {
          availabilityVenueFilter = v.id;
          showSection("availability");
        });
      if (bookBtn) bookBtn.addEventListener("click", () => {
        availabilityVenueFilter = String(v.id);
        showSection("availability");
        toast("Choose a date and time to check this venue before booking.");
      });
    });
  }

  renderPagination(document.getElementById("venues-pagination"), result.data.pagination, (page) => {
    venuesPage = page;
    loadVenuesList();
  });
}

function venueRowHtml(v, user, canWrite, canBook, canViewAvailability) {
  const initials = (v.name || "?").slice(0, 2).toUpperCase();
  const canDelete = user.role === "admin";

  return `
    <div class="record-row">
      <div class="record-avatar">${initials}</div>
      <div class="record-body">
        <div class="record-title">${escapeHtml(v.name)}</div>
        <div class="record-sub">${escapeHtml(v.address)} &middot; Capacity ${v.capacity}</div>
      </div>
      <div class="record-actions">
        ${canViewAvailability ? `<button class="icon-btn" data-avail="${v.id}" title="View availability">&#128197;</button>` : ""}
        ${canWrite ? `<button class="icon-btn" data-edit="${v.id}" title="Edit">&#9998;</button>` : ""}
        ${canBook ? `<button class="btn small" data-book-venue="${v.id}" title="Book this venue">Book hall</button>` : ""}
        ${canDelete ? `<button class="icon-btn" data-delete="${v.id}" title="Delete">&#128465;</button>` : ""}
      </div>
    </div>`;
}

function openVenueModal(venue) {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    toast("Only admins can add or edit venues.", "error");
    return;
  }
  const isEdit = !!venue;
  openModal(`
    <h3>${isEdit ? "Edit venue" : "Add venue"}</h3>
    <form id="venue-form">
      <label for="venue_name">Name</label>
      <input type="text" id="venue_name" value="${isEdit ? escapeHtml(venue.name) : ""}" required />

      <label for="venue_address">Address</label>
      <input type="text" id="venue_address" value="${isEdit ? escapeHtml(venue.address) : ""}" required />

      <label for="venue_capacity">Capacity</label>
      <input type="number" id="venue_capacity" min="1" value="${isEdit ? venue.capacity : ""}" required />

      <label for="venue_description">Description</label>
      <textarea id="venue_description" rows="3">${isEdit ? escapeHtml(venue.description || "") : ""}</textarea>

      <div class="form-actions">
        <button type="button" class="btn secondary" id="venue-cancel-btn">Cancel</button>
        <button type="submit" class="btn">${isEdit ? "Save changes" : "Create venue"}</button>
      </div>
    </form>
  `);

  document.getElementById("venue-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("venue-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById("venue_name").value.trim(),
      address: document.getElementById("venue_address").value.trim(),
      capacity: Number(document.getElementById("venue_capacity").value),
      description: document.getElementById("venue_description").value.trim(),
    };

    const result = isEdit
      ? await apiPut("/venues/" + venue.id, body)
      : await apiPost("/venues", body);

    if (result.ok) {
      toast(isEdit ? "Venue updated." : "Venue created.");
      closeModal();
      loadVenuesList();
    } else {
      toastApiError(result);
    }
  });
}

async function deleteVenue(id) {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    toast("Only admins can delete venues.", "error");
    return;
  }
  if (!confirm("Delete this venue? This only works if no events use it.")) return;
  const result = await apiDelete("/venues/" + id);
  if (result.ok) {
    toast("Venue deleted.");
    loadVenuesList();
  } else {
    toastApiError(result);
  }
}
