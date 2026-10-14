(() => {
  'use strict';
  const A = window.Ticket4uAPI, $ = s => document.querySelector(s);
  let venues = [], filtered = [];
  const idOf = item => A.itemId(item, ['id', 'venue_id']);

  async function refresh() {
    const table = $('#venues-table');
    table.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading venues…</div>';
    const addButton = $('#add-venue-button');
    if (addButton) addButton.hidden = !A.isAdmin();
    try {
      venues = A.listOf(await A.request('/venues?page=1&per_page=100'));
      render();
    } catch (e) {
      A.showLoadError('#venues-table', e.message);
      A.setNotice('The venue list could not be loaded.', 'error');
    }
  }

  function render() {
    const q = ($('#venue-search').value || '').trim().toLowerCase();
    filtered = venues.filter(v => !q || [v.name, v.venue_name, v.address, v.location, v.description]
      .some(x => String(x || '').toLowerCase().includes(q)));
    const rows = filtered.map(v => {
      const id = idOf(v);
      let actions = '';
      if (A.isAdmin()) {
        actions = `<button class="btn btn-muted btn-small" data-edit-venue="${A.escapeHtml(id)}">Edit</button><button class="btn btn-danger btn-small" data-delete-venue="${A.escapeHtml(id)}">Delete</button>`;
      } else if (A.isOrganiser()) {
        actions = `<a class="btn btn-primary btn-small" href="availability.php?venue_id=${encodeURIComponent(id)}&action=book">Book hall</a>`;
      }
      return `<tr><td><span class="table-primary">${A.escapeHtml(A.venueName(v))}</span><span class="table-sub">Venue ID: ${A.escapeHtml(id)}</span></td><td>${A.escapeHtml(v.address || v.location || '—')}</td><td>${A.escapeHtml(v.capacity ?? v.max_capacity ?? '—')}</td><td>${A.escapeHtml(v.description || '—')}</td><td><div class="table-actions">${actions || '<span class="small-note">View only</span>'}</div></td></tr>`;
    }).join('');
    const emptyAction = A.isAdmin()
      ? '<button class="btn btn-primary btn-small" data-new-venue>Add venue</button>'
      : A.isOrganiser()
        ? '<a class="btn btn-primary btn-small" href="availability.php">View venue availability</a>'
        : '';
    $('#venues-table').innerHTML = rows
      ? `<table><thead><tr><th>Venue</th><th>Location</th><th>Capacity</th><th>Description</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty-state"><div class="empty-icon">⌂</div><strong>No venues found</strong><p>${A.isAdmin() ? 'Add a venue to the system.' : 'Try a different search or check back later.'}</p>${emptyAction}</div>`;
  }

  function openForm(id = '') {
    if (!A.isAdmin()) {
      A.notify('Only Admin can add or edit venues. Organisers can view venues and book halls.', 'error');
      return;
    }
    const v = id ? venues.find(x => String(idOf(x)) === String(id)) || {} : {};
    const body = `<form id="venue-form" data-id="${A.escapeHtml(id)}"><div class="form-grid"><div class="span-2">${A.textField('Venue name', 'name', v.name || v.venue_name || '', 'text', 'required maxlength="150"')}</div><div class="span-2">${A.textField('Address or location', 'address', v.address || v.location || '', 'text', 'maxlength="255"')}</div>${A.textField('Capacity', 'capacity', v.capacity ?? v.max_capacity ?? '', 'number', 'min="1" step="1" required')}<div class="span-2">${A.areaField('Description', 'description', v.description || '', 'maxlength="1000"')}</div></div><div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Cancel</button><button class="btn btn-primary" type="submit">${id ? 'Save changes' : 'Add venue'}</button></div></form>`;
    A.showDialog(id ? 'Edit venue' : 'Add venue', body);
  }

  document.addEventListener('click', async e => {
    if (e.target.closest('#add-venue-button, [data-new-venue]')) {
      if (A.isAdmin()) openForm();
      else A.notify('Only Admin can add venues.', 'error');
    }
    const edit = e.target.closest('[data-edit-venue]');
    if (edit) {
      if (A.isAdmin()) openForm(edit.dataset.editVenue);
      else A.notify('Only Admin can edit venues.', 'error');
    }
    const del = e.target.closest('[data-delete-venue]');
    if (del) {
      if (!A.isAdmin()) {
        A.notify('Only Admin can delete venues.', 'error');
        return;
      }
      if (window.confirm('Delete this venue? The API may reject deletion if events still use it.')) {
        try {
          await A.request(`/venues/${encodeURIComponent(del.dataset.deleteVenue)}`, { method: 'DELETE' });
          A.notify('Venue deleted.');
          await refresh();
        } catch (error) { A.notify(error.message, 'error'); }
      }
    }
  });

  document.addEventListener('submit', async e => {
    const form = e.target;
    if (form.id !== 'venue-form') return;
    e.preventDefault();
    if (!A.isAdmin()) {
      A.closeDialog();
      A.notify('Only Admin can add or edit venues.', 'error');
      return;
    }
    const id = form.dataset.id, body = Object.fromEntries(new FormData(form).entries());
    body.capacity = Number(body.capacity);
    try {
      await A.request(id ? `/venues/${encodeURIComponent(id)}` : '/venues', { method: id ? 'PUT' : 'POST', body });
      A.closeDialog();
      A.notify(id ? 'Venue updated.' : 'Venue added.');
      await refresh();
    } catch (error) { A.notify(error.message, 'error'); }
  });

  $('#venue-search').addEventListener('input', render);
  refresh();
})();
