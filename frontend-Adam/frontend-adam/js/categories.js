// ============================================================
// categories.js
// Event categories. Read access is for everyone logged in,
// but only admins can create/edit/delete (per PERMISSION-MATRIX).
// ============================================================

/**
 * Fetches every category (the API doesn't paginate this list).
 * Used both by the Categories admin page and by the dropdown in
 * the event create/edit form.
 */
async function fetchAllCategories() {
  const result = await apiGet("/categories");
  if (!result.ok) {
    toastApiError(result);
    return [];
  }
  return result.data || [];
}

async function renderCategories() {
  const user = getCurrentUser();
  const container = document.getElementById("categories-list");
  const addBtn = document.getElementById("category-add-btn");

  addBtn.style.display = user.role === "admin" ? "inline-block" : "none";
  addBtn.onclick = () => openCategoryModal(null);

  container.innerHTML = '<div class="loading-text">Loading categories...</div>';

  const categories = await fetchAllCategories();

  if (categories.length === 0) {
    container.innerHTML = '<div class="empty-state">No categories yet.</div>';
    return;
  }

  container.innerHTML = categories.map((cat) => categoryRowHtml(cat, user)).join("");

  categories.forEach((cat) => {
    const editBtn = container.querySelector(`[data-edit="${cat.id}"]`);
    const delBtn = container.querySelector(`[data-delete="${cat.id}"]`);
    if (editBtn) editBtn.addEventListener("click", () => openCategoryModal(cat));
    if (delBtn) delBtn.addEventListener("click", () => deleteCategory(cat.id));
  });
}

function categoryRowHtml(cat, user) {
  const initials = (cat.category_name || "?").slice(0, 2).toUpperCase();
  const actions =
    user.role === "admin"
      ? `<div class="record-actions">
           <button class="icon-btn" data-edit="${cat.id}" title="Edit">&#9998;</button>
           <button class="icon-btn" data-delete="${cat.id}" title="Delete">&#128465;</button>
         </div>`
      : "";

  return `
    <div class="record-row">
      <div class="record-avatar">${initials}</div>
      <div class="record-body">
        <div class="record-title">${escapeHtml(cat.category_name)}</div>
        <div class="record-sub">${escapeHtml(cat.description || "No description")}</div>
      </div>
      ${actions}
    </div>`;
}

function openCategoryModal(cat) {
  const isEdit = !!cat;
  openModal(`
    <h3>${isEdit ? "Edit category" : "Add category"}</h3>
    <form id="category-form">
      <label for="category_name">Category name</label>
      <input type="text" id="category_name" value="${isEdit ? escapeHtml(cat.category_name) : ""}" required />

      <label for="category_description">Description</label>
      <textarea id="category_description" rows="3">${isEdit ? escapeHtml(cat.description || "") : ""}</textarea>

      <div class="form-actions">
        <button type="button" class="btn secondary" id="category-cancel-btn">Cancel</button>
        <button type="submit" class="btn">${isEdit ? "Save changes" : "Create category"}</button>
      </div>
    </form>
  `);

  document.getElementById("category-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("category-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      category_name: document.getElementById("category_name").value.trim(),
      description: document.getElementById("category_description").value.trim(),
    };

    const result = isEdit
      ? await apiPut("/categories/" + cat.id, body)
      : await apiPost("/categories", body);

    if (result.ok) {
      toast(isEdit ? "Category updated." : "Category created.");
      closeModal();
      renderCategories();
    } else {
      toastApiError(result);
    }
  });
}

async function deleteCategory(id) {
  if (!confirm("Delete this category? This only works if no events use it.")) return;
  const result = await apiDelete("/categories/" + id);
  if (result.ok) {
    toast("Category deleted.");
    renderCategories();
  } else {
    toastApiError(result);
  }
}
