(() => {
    'use strict';
    const API = window.EVENTORA_API, role = document.body.dataset.role;
    let auth;
    try {
        auth = JSON.parse(sessionStorage.getItem('eventora_auth') || 'null');
    }
    catch { }
    ;
    if (!auth?.token || auth.user?.role !== role) {
        location.replace('index.html');
        return;
    }
    const nav = document.getElementById('nav'), content = document.getElementById('content'), notice = document.getElementById('notice'), root = document.getElementById('modalRoot');
    document.getElementById('logout').onclick = () => { sessionStorage.removeItem('eventora_auth'); location.replace('index.html'); };
    const configs = { users: { label: 'Users', columns: ['id', 'name', 'email', 'role'], fields: ['name', 'email', 'password', 'role'], editable: ['name', 'email', 'role'], roles: ['admin'] }, venues: { label: 'Venues', columns: ['id', 'name', 'address', 'capacity', 'description'], fields: ['name', 'address', 'capacity', 'description'], roles: ['admin', 'organiser'] }, unavailability: { label: 'Venue Availability', columns: ['id', 'venue_name', 'unavailability_date', 'start_time', 'end_time', 'record_type', 'reason'], fields: ['venue_id', 'unavailability_date', 'start_time', 'end_time', 'record_type', 'reason'], roles: ['admin', 'organiser'] }, categories: { label: 'Event Categories', columns: ['id', 'category_name', 'description'], fields: ['category_name', 'description'], roles: ['admin'] }, events: { label: 'Events & Tickets', columns: ['id', 'title', 'venue_name', 'start_datetime', 'ticket_price', 'available_tickets', 'total_tickets', 'status'], fields: ['title', 'description', 'category_id', 'venue_id', 'organiser_id', 'start_datetime', 'end_datetime', 'ticket_price', 'total_tickets'], roles: ['admin', 'organiser'] }, bookings: { label: 'Bookings', columns: ['id', 'booking_code', 'event_title', 'quantity', 'total_amount', 'status'], fields: [], roles: [] }, payments: { label: 'Payments & Refunds', columns: ['id', 'booking_code', 'amount', 'payment_method', 'payment_status', 'refund_amount'], fields: [], roles: [] }, notifications: { label: 'Notifications', columns: ['id', 'title', 'message', 'notification_type', 'is_read'], fields: ['title', 'message', 'recipient_id', 'event_id', 'notification_type'], roles: ['admin', 'organiser'] } };
    const sections = role === 'admin' ? ['overview', 'users', 'venues', 'unavailability', 'categories', 'events', 'bookings', 'payments', 'notifications'] : role === 'organiser' ? ['overview', 'venues', 'unavailability', 'events', 'bookings', 'payments', 'notifications'] : ['overview', 'events', 'categories', 'bookings', 'payments', 'notifications'];
    let section = 'overview', page = 1, search = '', currentRows = [];
    const esc = s => String(s ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function message(t) { notice.textContent = t || ''; }
    function nice(s) { return s.replaceAll('_', ' ').replace(/\b\w/g, x => x.toUpperCase()); }
    async function api(path, method = 'GET', body) { let res; try {
        res = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + auth.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    }
    catch {
        throw Error('Cannot reach API. Start Apache and check config.js.');
    } const txt = await res.text(); let j; try {
        j = JSON.parse(txt);
    }
    catch {
        throw Error('API returned invalid JSON. Verify the backend URL and Apache rewrite configuration.');
    } if (res.status === 401) {
        sessionStorage.removeItem('eventora_auth');
        throw Error('Session expired. Please sign in again.');
    } if (!res.ok || j.success === false)
        throw Error(j.message || 'Request failed'); return j.data; }
    function listUrl(key, p = 1, q = '') { const u = new URLSearchParams({ page: String(p), per_page: '10' }); if (q && ['users', 'venues', 'events', 'bookings', 'notifications'].includes(key))
        u.set('search', q); if (key === 'events' && role === 'organiser')
        u.set('organiser_id', auth.user.id); return '/' + key + '?' + u; }
    function items(data) { return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []; }
    function renderNav() { nav.innerHTML = sections.map(s => `<button class="pill ${s === section ? 'active' : ''}" data-nav="${s}"><span class="nav-icon">${({ overview: '◫', users: '♙', venues: '▣', unavailability: '◷', categories: '▦', events: '▤', bookings: '▧', payments: '◈', notifications: '♧' })[s]}</span><span>${s === 'overview' ? 'Overview' : configs[s].label}</span></button>`).join(''); }
    async function show(s) { section = s; page = 1; search = ''; renderNav(); await load(); }
    async function load() { message(''); if (section === 'overview')
        return overview(); return table(); }
    async function overview() { content.innerHTML = '<div class="section-title"><p class="eyebrow">' + esc(role) + ' workspace</p><h2>System Overview</h2><p>Live counts from the existing API.</p></div><div class="stats" id="stats"></div>'; const keys = sections.filter(x => x !== 'overview'); const stats = document.getElementById('stats'); stats.innerHTML = keys.map(k => `<div class="stat">${esc(configs[k].label)}<strong>…</strong></div>`).join(''); await Promise.all(keys.map(async (k, i) => { try {
        const d = await api(listUrl(k, 1));
        const total = d?.pagination?.total ?? items(d).length;
        stats.children[i].querySelector('strong').textContent = total;
    }
    catch (e) {
        stats.children[i].querySelector('strong').textContent = '—';
        stats.children[i].title = e.message;
    } })); }
    async function table() {
        const key = section, c = configs[key];
        content.innerHTML = `<div class="section-title"><p class="eyebrow">${esc(role)} workspace</p><h2>${esc(c.label)}</h2><p>Records retrieved from the group backend API.</p></div><div class="toolbar" id="toolbar"></div><div class="table-wrap" id="table"><p style="padding:20px">Loading…</p></div><div class="pager" id="pager"></div>`;
        const bar = document.getElementById('toolbar');
        if (['users', 'venues', 'events', 'bookings', 'notifications'].includes(key))
            bar.innerHTML = '<input id="search" placeholder="Search" aria-label="Search"><button class="tiny-button" id="searchBtn">Search</button>';
        bar.insertAdjacentHTML('beforeend', '<button class="tiny-button" id="refresh">Refresh</button>');
        if (c.roles.includes(role) && !(key === 'events' && role === 'admin') && !(role === 'organiser' && ['venues', 'unavailability'].includes(key)))
            bar.insertAdjacentHTML('beforeend', '<button class="primary-button" id="create">+ Create New</button>');
        document.getElementById('refresh').onclick = () => table();
        const create = document.getElementById('create');
        if (create)
            create.onclick = () => editModal(key);
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn)
            searchBtn.onclick = () => { search = document.getElementById('search').value; page = 1; table(); };
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.value = search;
            searchInput.onkeydown = e => { if (e.key === 'Enter') {
                search = searchInput.value;
                page = 1;
                table();
            } };
        }
        try {
            const d = await api(listUrl(key, page, search));
            currentRows = items(d);
            const tableEl = document.getElementById('table');
            if (key === 'events') {
                await renderEventCards(tableEl, currentRows);
            }
            else {
                tableEl.innerHTML = `<table><thead><tr>${c.columns.map(x => `<th>${esc(nice(x))}</th>`).join('')}<th>Actions</th></tr></thead><tbody>${currentRows.map((r, i) => `<tr>${c.columns.map(col => `<td title="${esc(r[col])}">${["status", "payment_status"].includes(col) ? `<span class="status-badge status-${esc(r[col])}">${esc(nice(String(r[col] || "unknown")))}</span>` : esc(r[col])}</td>`).join('')}<td><div class="actions">${actions(key, r, i)}</div></td></tr>`).join('') || `<tr><td colspan="${c.columns.length + 1}">No records found.</td></tr>`}</tbody></table>`;
            }
            const pg = d?.pagination || { page, total_pages: 1 };
            document.getElementById('pager').innerHTML = `<button class="tiny-button" id="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>Page ${page} of ${Math.max(1, pg.total_pages || 1)}<button class="tiny-button" id="next" ${page >= pg.total_pages ? 'disabled' : ''}>Next</button>`;
            document.getElementById('prev').onclick = () => { page--; table(); };
            document.getElementById('next').onclick = () => { page++; table(); };
        }
        catch (e) {
            document.getElementById('table').textContent = e.message;
            message(e.message);
        }
    }
    async function renderEventCards(container, rows) {
        // Resolve display labels from the same backend API, without altering event objects.
        let cats = [], venues = [];
        try {
            const d = await api('/categories?page=1&per_page=100');
            cats = items(d);
        }
        catch (e) {
            console.warn('Category labels unavailable:', e.message);
        }
        try {
            const d = await api('/venues?page=1&per_page=100');
            venues = items(d);
        }
        catch (e) {
            console.warn('Venue labels unavailable:', e.message);
        }
        const catName = r => r.category_name || r.category || cats.find(c => Number(c.id) === Number(r.category_id))?.category_name || 'Event';
        const venueName = r => r.venue_name || venues.find(v => Number(v.id) === Number(r.venue_id))?.name || 'Venue details unavailable';
        const fmtDate = v => { if (!v)
            return 'Date to be announced'; const d = new Date(String(v).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? String(v) : new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(d); };
        const cards = rows.map((r, i) => {
            const cat = esc(catName(r)), venue = esc(venueName(r)), status = String(r.status || '').toLowerCase();
            const price = Number(r.ticket_price || 0), tickets = Number(r.available_tickets || 0);
            const customerCanBook = role === 'customer' && status === 'upcoming' && tickets > 0;
            const canEdit = configs.events.roles.includes(role) && (role === 'admin' || Number(r.organiser_id) === Number(auth.user.id));
            const buttons = `<button data-action="details" data-i="${i}">Details</button>` +
                (customerCanBook ? `<button class="event-book-button" data-action="book" data-i="${i}">Book tickets</button>` : '') +
                (canEdit ? `<button data-action="edit" data-i="${i}">Edit</button><button data-action="delete" data-i="${i}">Delete</button>` : '');
            return `<article class="event-ticket-card">
 <div class="event-ticket-band"><span class="event-ticket-brand">EvenTix<span class="event-ticket-brand-dot">.</span></span><span class="event-ticket-category">${cat}</span></div>
 <div class="event-ticket-content"><div class="event-ticket-title-line"><h3>${esc(r.title)}</h3><span class="status-badge status-${esc(status)}">${esc(nice(status || 'upcoming'))}</span></div>
 <div class="event-ticket-details"><p><span aria-hidden="true">▦</span>${esc(fmtDate(r.start_datetime))}</p><p><span aria-hidden="true">⌖</span>${venue}</p><p><span aria-hidden="true">◷</span>${esc(tickets)} tickets left</p></div>
 <div class="event-ticket-footer"><div class="event-ticket-price">RM ${price.toFixed(2)} <small>/ ticket</small></div><div class="actions event-ticket-actions">${buttons}</div></div></div></article>`;
        }).join('');
        container.classList.add('event-card-container');
        container.innerHTML = `<div class="event-ticket-grid">${cards || '<p class="event-empty">No events found.</p>'}</div>`;
    }
    function actions(key, r, i) { let a = `<button data-action="details" data-i="${i}">Details</button>`; const canEdit = configs[key].roles.includes(role) && (key !== 'events' || role === 'admin' || Number(r.organiser_id) === Number(auth.user.id)); if (canEdit)
        a += `<button data-action="edit" data-i="${i}">Edit</button>`; if (canEdit && ['users', 'venues', 'categories', 'events', 'unavailability'].includes(key))
        a += `<button data-action="delete" data-i="${i}">Delete</button>`; if (key === 'events' && role === 'customer' && r.status === 'upcoming' && Number(r.available_tickets) > 0)
        a += `<button data-action="book" data-i="${i}">Book Tickets</button>`; if (key === 'bookings' && role === 'customer' && r.status === 'confirmed')
        a += `<button class="qr-action" data-action="qr" data-i="${i}">View QR Ticket</button>`; if (key === 'bookings' && role === 'customer' && r.status === 'pending')
        a += `<button data-action="pay" data-i="${i}">Pay</button>`; if (key === 'bookings' && role === 'customer' && r.status !== 'cancelled')
        a += `<button data-action="cancel" data-i="${i}">Cancel</button>`; if (key === 'payments' && ['admin', 'organiser'].includes(role) && r.payment_status === 'paid')
        a += `<button data-action="refund" data-i="${i}">Refund</button>`; if (key === 'notifications' && !Number(r.is_read))
        a += `<button data-action="read" data-i="${i}">Mark Read</button>`; if (key === 'notifications')
        a += `<button data-action="delete" data-i="${i}">Delete</button>`; return a; }
    nav.addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b)
        show(b.dataset.nav); });
    content.addEventListener('click', async (e) => { const b = e.target.closest('[data-action]'); if (!b)
        return; const r = currentRows[Number(b.dataset.i)]; if (!r)
        return; const a = b.dataset.action, k = section; try {
        if (a === 'details') {
            const data = await api('/' + k + '/' + r.id);
            detailModal(configs[k].label + ' Details', data);
        }
        else if (a === 'edit')
            editModal(k, r);
        else if (a === 'book')
            bookModal(r);
        else if (a === 'pay')
            payModal(r);
        else if (a === 'qr')
            await qrModal(r);
        else if (a === 'cancel') {
            if (confirm('Cancel booking ' + r.booking_code + '?')) {
                await api('/bookings/' + r.id, 'DELETE');
                await table();
            }
        }
        else if (a === 'refund') {
            if (confirm('Process refund for payment ' + r.id + '?')) {
                await api('/payments/' + r.id + '/refund', 'POST', {});
                await table();
            }
        }
        else if (a === 'read') {
            await api('/notifications/' + r.id + '/read', 'PUT', {});
            await table();
        }
        else if (a === 'delete') {
            if (confirm('Delete this record?')) {
                await api('/' + k + '/' + r.id, 'DELETE');
                await table();
            }
        }
    }
    catch (err) {
        message(err.message);
    } });
    function modal(title, body, onSubmit) { root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-heading"><h2 id="modalTitle">${esc(title)}</h2></div><form id="modalForm"><div class="modal-scroll-area">${body}</div><div class="modal-footer"><p class="notice" id="modalError" role="status"></p><div class="modal-actions"><button class="tiny-button" type="button" id="closeModal">Close</button>${onSubmit ? '<button class="primary-button" type="submit">Save</button>' : ''}</div></div></form></div></div>`; document.getElementById('closeModal').onclick = () => root.innerHTML = ''; if (onSubmit)
        document.getElementById('modalForm').onsubmit = async (e) => { e.preventDefault(); const err = document.getElementById('modalError'); err.textContent = 'Saving...'; try {
            await onSubmit(Object.fromEntries(new FormData(e.target)));
            root.innerHTML = '';
            await table();
        }
        catch (ex) {
            err.textContent = ex.message;
        } }; }
    function detailModal(title, data) { modal(title, `<div class="detail-grid">${Object.entries(data || {}).map(([k, v]) => `<div><b>${esc(nice(k))}</b>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</div>`).join('')}</div>`); }
    const numeric = new Set(['organiser_id', 'capacity', 'venue_id', 'category_id', 'ticket_price', 'total_tickets', 'recipient_id', 'event_id']);
    const choices = { role: ['admin', 'organiser', 'customer'], record_type: ['admin_block', 'organiser_booking'], notification_type: ['general', 'booking_confirmed', 'booking_cancelled', 'event_updated', 'event_cancelled', 'event_reminder', 'payment', 'refund'] };
    async function editModal(key, row) { if (!row && role === 'organiser' && ['venues', 'unavailability'].includes(key)) {
        message('Only Administrators can create venue and venue availability records.');
        return;
    } if (key === 'events' && role === 'admin' && !row) {
        message('Only Organisers can create events.');
        return;
    } const c = configs[key], fields = row ? (c.editable || c.fields.filter(f => f !== 'password')) : [...c.fields]; if (key === 'events' && role === 'admin' && !fields.includes('organiser_id'))
        fields.splice(4, 0, 'organiser_id'); let lookups = {}; for (const f of fields) {
        const endpoint = f === 'venue_id' ? 'venues' : f === 'category_id' ? 'categories' : null;
        if (endpoint) {
            try {
                const d = await api('/' + endpoint + '?page=1&per_page=50');
                lookups[f] = items(d);
            }
            catch {
                lookups[f] = [];
            }
        }
    } let html = '<div class="form-grid">'; for (const f of fields) {
        let value = row?.[f] ?? '';
        if (f === 'start_datetime' || f === 'end_datetime')
            value = String(value).replace(' ', 'T').slice(0, 16);
        const required = ['name', 'email', 'password', 'role', 'title', 'category_name', 'address', 'capacity', 'category_id', 'venue_id', 'organiser_id', 'start_datetime', 'end_datetime', 'ticket_price', 'total_tickets', 'unavailability_date', 'start_time', 'end_time', 'record_type', 'message'].includes(f) && !(row && f === 'password');
        let control = '';
        if (lookups[f])
            control = `<select name="${f}" ${required ? 'required' : ''}><option value="">Select ${esc(nice(f))}</option>${lookups[f].map(x => `<option value="${x.id}" ${String(x.id) === String(value) ? 'selected' : ''}>${esc(x.name || x.category_name)}</option>`).join('')}</select>`;
        else if (choices[f])
            control = `<select name="${f}" ${required ? 'required' : ''}>${choices[f].map(x => `<option value="${x}" ${x === value ? 'selected' : ''}>${esc(nice(x))}</option>`).join('')}</select>`;
        else if (['description', 'message', 'reason'].includes(f))
            control = `<textarea name="${f}">${esc(value)}</textarea>`;
        else {
            let type = f === 'email' ? 'email' : f === 'password' ? 'password' : f === 'unavailability_date' ? 'date' : ['start_datetime', 'end_datetime'].includes(f) ? 'datetime-local' : ['start_time', 'end_time'].includes(f) ? 'time' : numeric.has(f) ? 'number' : 'text';
            control = `<input name="${f}" type="${type}" value="${esc(value)}" ${numeric.has(f) ? (f === 'organiser_id' ? 'min="1" step="1" placeholder="Enter Organiser ID"' : 'step="any"') : ''} ${required ? 'required' : ''}>`;
        }
        html += `<label class="${['description', 'message'].includes(f) ? 'wide' : ''}">${esc(nice(f))}${control}</label>`;
    } html += '</div>'; modal((row ? 'Edit ' : 'Create ') + c.label, html, async (data) => { for (const f of Object.keys(data)) {
        if (numeric.has(f) && data[f] !== '')
            data[f] = Number(data[f]);
        if (data[f] === '')
            delete data[f];
    } if (key === 'events' && role === 'admin' && !row && !data.organiser_id)
        throw Error('Please enter a valid Organiser ID.'); if (key === 'events' && (!Number.isInteger(data.organiser_id) || data.organiser_id < 1))
        throw Error('Enter a valid Organiser ID (positive whole number).');
        if (key === 'events' && data.start_datetime && data.end_datetime && new Date(data.end_datetime) <= new Date(data.start_datetime))
        throw Error('End Datetime must be later than Start Datetime.');
        if (row && key === 'users' && !data.password)
        delete data.password; await api('/' + key + (row ? '/' + row.id : ''), row ? 'PUT' : 'POST', data); }); }
    function bookModal(row) { modal('Book Tickets — ' + row.title, `<p>${esc(row.title)} · RM ${esc(row.ticket_price)} per ticket · ${esc(row.available_tickets)} available</p><label>Quantity<input type="number" min="1" max="${Number(row.available_tickets)}" name="quantity" value="1" required></label>`, async (d) => { const result = await api('/bookings', 'POST', { event_id: Number(row.id), quantity: Number(d.quantity) }); alert('Booking created. Open Bookings to pay and confirm your ticket.'); }); }
    async function qrModal(row) {
        if (row.status !== 'confirmed')
            throw Error('QR tickets are only available for confirmed bookings.');
        const res = await fetch('ticket-qr.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: Number(row.id), token: auth.token }) });
        const raw = await res.text();
        let json;
        try {
            json = JSON.parse(raw);
        }
        catch {
            throw Error('QR service returned an invalid response. Check ticket-qr.php and your XAMPP PHP configuration.');
        }
        if (!res.ok || json.success === false)
            throw Error(json.message || 'Unable to generate QR ticket.');
        const d = json.data || json;
        if (!d.qr_image_url)
            throw Error('QR image missing from API response.');
        const img = new URL(d.qr_image_url);
        if (img.protocol !== 'https:' || img.hostname !== 'api.qrserver.com')
            throw Error('Unexpected QR image provider.');
        modal('Your Event Ticket', `<div class="qr-ticket"><div class="qr-ticket-head">PAYMENT CONFIRMED · ADMIT ONE BOOKING</div><h3>${esc(row.event_title || 'Event Ticket')}</h3><img src="${esc(img.href)}" alt="QR code for booking ${esc(d.booking_code)}" width="260" height="260"><p class="qr-code-label">${esc(d.booking_code)}</p><p>Present this code at the event entrance.</p><button type="button" class="tiny-button" id="printTicket">Print Ticket</button></div>`);
        document.getElementById('printTicket').onclick = () => window.print();
    }
    function payModal(row) { modal('Pay for Booking — ' + row.booking_code, `<p>Booking amount: RM ${esc(row.total_amount)}</p><label>Payment Method<select name="payment_method" required><option value="e_wallet">E-wallet</option><option value="online_banking">Online banking</option><option value="credit_card">Credit card</option><option value="debit_card">Debit card</option></select></label>`, async (d) => { await api('/payments', 'POST', { booking_id: Number(row.id), payment_method: d.payment_method }); alert('Payment successful! Your booking is confirmed. Click View QR Ticket in Bookings to see your ticket.'); }); }
    show('overview');
})();
