// ============================================================
// users.js
// Admin-only CRUD over user accounts. The "Users" nav tab is
// already hidden for non-admins (see NAV_ITEMS in app.js), but
// the backend also rejects non-admin calls, so this is just UI.
// ============================================================

let usersPage = 1;
let usersSearch = "";
let usersRoleFilter = "";

async function renderUsers() {
  document.getElementById("user-add-btn").onclick = () => openUserModal(null);

  const toolbar = document.getElementById("users-toolbar");
  toolbar.innerHTML = `
    <input type="text" id="user-search" placeholder="Search name/email..." value="${escapeHtml(usersSearch)}" />
    <select id="user-role-filter">
      <option value="">All roles</option>
      <option value="admin">Admin</option>
      <option value="organiser">Organiser</option>
      <option value="customer">Customer</option>
    </select>
  `;
  document.getElementById("user-role-filter").value = usersRoleFilter;

  document.getElementById("user-search").addEventListener("input", (e) => {
    usersSearch = e.target.value;
    usersPage = 1;
    loadUsersList();
  });
  document.getElementById("user-role-filter").addEventListener("change", (e) => {
    usersRoleFilter = e.target.value;
    usersPage = 1;
    loadUsersList();
  });

  loadUsersList();
}

async function loadUsersList() {
  const me = getCurrentUser();
  const container = document.getElementById("users-list");
  container.innerHTML = '<div class="loading-text">Loading users...</div>';

  const result = await apiGet(
    "/users" + buildQuery({ search: usersSearch, role: usersRoleFilter, page: usersPage, per_page: 10 })
  );

  if (!result.ok) {
    container.innerHTML = '<div class="empty-state">Could not load users.</div>';
    toastApiError(result);
    return;
  }

  const users = result.data.items || [];
  if (users.length === 0) {
    container.innerHTML = '<div class="empty-state">No users found.</div>';
  } else {
    container.innerHTML = users.map((u) => userRowHtml(u, me)).join("");
    users.forEach((u) => {
      const editBtn = container.querySelector(`[data-edit="${u.id}"]`);
      const delBtn = container.querySelector(`[data-delete="${u.id}"]`);
      if (editBtn) editBtn.addEventListener("click", () => openUserModal(u));
      if (delBtn) delBtn.addEventListener("click", () => deleteUser(u.id));
    });
  }

  renderPagination(document.getElementById("users-pagination"), result.data.pagination, (page) => {
    usersPage = page;
    loadUsersList();
  });
}

function userRowHtml(u, me) {
  const initials = (u.name || "?").slice(0, 2).toUpperCase();
  const isSelf = u.id === me.id;
  return `
    <div class="record-row">
      <div class="record-avatar">${initials}</div>
      <div class="record-body">
        <div class="record-title">${escapeHtml(u.name)} ${isSelf ? "(you)" : ""}</div>
        <div class="record-sub">${escapeHtml(u.email)} &middot; <span class="role-badge">${u.role}</span></div>
      </div>
      <div class="record-actions">
        <button class="icon-btn" data-edit="${u.id}" title="Edit">&#9998;</button>
        ${isSelf ? "" : `<button class="icon-btn" data-delete="${u.id}" title="Delete">&#128465;</button>`}
      </div>
    </div>`;
}

function openUserModal(user) {
  const isEdit = !!user;
  openModal(`
    <h3>${isEdit ? "Edit user" : "Add user"}</h3>
    <form id="user-form">
      <label for="user_name">Name</label>
      <input type="text" id="user_name" value="${isEdit ? escapeHtml(user.name) : ""}" required />

      <label for="user_email">Email</label>
      <input type="email" id="user_email" value="${isEdit ? escapeHtml(user.email) : ""}" required />

      <label for="user_password">${isEdit ? "New password (leave blank to keep current)" : "Password"}</label>
      <input type="password" id="user_password" ${isEdit ? "" : "required"} minlength="8" />

      <label for="user_role">Role</label>
      <select id="user_role" required>
        <option value="admin" ${isEdit && user.role === "admin" ? "selected" : ""}>Admin</option>
        <option value="organiser" ${isEdit && user.role === "organiser" ? "selected" : ""}>Organiser</option>
        <option value="customer" ${isEdit && user.role === "customer" ? "selected" : ""}>Customer</option>
      </select>

      <div class="form-actions">
        <button type="button" class="btn secondary" id="user-cancel-btn">Cancel</button>
        <button type="submit" class="btn">${isEdit ? "Save changes" : "Create user"}</button>
      </div>
    </form>
  `);

  document.getElementById("user-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("user-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = document.getElementById("user_password").value;
    const body = {
      name: document.getElementById("user_name").value.trim(),
      email: document.getElementById("user_email").value.trim(),
      role: document.getElementById("user_role").value,
    };
    if (password) body.password = password;

    const result = isEdit
      ? await apiPut("/users/" + user.id, body)
      : await apiPost("/users", body);

    if (result.ok) {
      toast(isEdit ? "User updated." : "User created.");
      closeModal();
      loadUsersList();
    } else {
      toastApiError(result);
    }
  });
}

async function deleteUser(id) {
  if (!confirm("Delete this user? This only works if they have no related records.")) return;
  const result = await apiDelete("/users/" + id);
  if (result.ok) {
    toast("User deleted.");
    loadUsersList();
  } else {
    toastApiError(result);
  }
}
