// Frontend logic: routing between tabs, role-based menus, and one view per backend resource.
const $ = (s) => document.querySelector(s);
const U = JSON.parse(localStorage.user || 'null');
if (!localStorage.token || !U) location = 'index.html';
const staff = U.role !== 'customer',
  admin = U.role === 'admin';
const e = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const msg = (t, ok) => {
  const m = $('#msg');
  m.textContent = t;
  m.className = ok ? 'ok' : 'err';
  m.hidden = false;
  setTimeout(() => (m.hidden = true), 4000);
};
const run = async (f) => {
  try {
    await f();
  } catch (x) {
    msg(x.message);
  }
};
const money = (n) => 'RM ' + Number(n || 0).toFixed(2);
const tag = (s) => `<span class="tag ${e(s)}">${e(s)}</span>`;
const empty = (t) => `<div class="empty">${t}</div>`;
let CAT = [],
  tab = 'events',
  ev = { page: 1, search: '', category_id: '', status: '' };
$('#who').textContent = `${U.name || U.email || ''} (${U.role})`;

function form(title, fields, vals, onsubmit) {
  const d = $('#dlg');
  d.innerHTML = `<form><h3>${title}</h3>${fields
    .map(
      ([n, l, t, o]) =>
        `<label>${l}` +
        (t === 'select'
          ? `<select name="${n}">${o.map(([v, x]) => `<option value="${e(v)}"${String(vals[n] ?? '') === String(v) ? ' selected' : ''}>${e(x)}</option>`).join('')}</select>`
          : t === 'textarea'
            ? `<textarea name="${n}" rows="3">${e(vals[n])}</textarea>`
            : `<input name="${n}" type="${t}" value="${e(vals[n])}">`) +
        `</label>`,
    )
    .join('')}
    <div class="row"><button type="button" class="sec" onclick="dlg.close()">Cancel</button><button>Save</button></div></form>`;
  d.querySelector('form').onsubmit = (x) => {
    x.preventDefault();
    const o = Object.fromEntries(new FormData(x.target));
    run(async () => {
      await onsubmit(o);
      d.close();
    });
  };
  d.showModal();
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''));
const dt = (v) => (v ? String(v).replace(' ', 'T').slice(0, 16) : '');
const sqlDt = (v) => v.replace('T', ' ') + ':00';
const table = (cols, data) =>
  !data.length
    ? empty('Nothing here yet.')
    : `<table><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr>${data.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</table>`;
const go = (t) => {
  tab = t;
  nav();
  run(V[t]);
};
function nav() {
  const t = [
    ['events', 'Events'],
    ['bookings', staff ? 'Bookings' : 'My bookings'],
    ['payments', 'Payments'],
    ['notifications', 'Notifications'],
    ['venues', 'Venues'],
  ];
  if (staff) t.push(['unavailability', 'Venue availability']);
  if (admin) t.push(['users', 'Users']);
  $('#nav').innerHTML = t
    .map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" onclick="go('${k}')">${l}</a>`)
    .join('');
}
const V = {};

// ---------- Events ----------
V.events = async () => {
  if (!CAT.length) CAT = rows(await api('/categories'));
  const p = new URLSearchParams({ page: ev.page, per_page: 6 });
  for (const k of ['search', 'category_id', 'status']) if (ev[k]) p.set(k, ev[k]);
  const j = await api('/events?' + p),
    list = rows(j),
    m = meta(j),
    last = m.total_pages || m.last_page;
  const cn = (id) => (CAT.find((c) => c.id == id) || {}).category_name || '';
  $('#view').innerHTML = `<h2>Events</h2><div class="bar">
    <input id="s" placeholder="Search events" value="${e(ev.search)}">
    <select id="c"><option value="">All categories</option>${CAT.map((c) => `<option value="${c.id}"${ev.category_id == c.id ? ' selected' : ''}>${e(c.category_name)}</option>`).join('')}</select>
    <select id="st"><option value="">Any status</option>${['upcoming', 'ongoing', 'completed', 'cancelled'].map((s) => `<option${ev.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
    <button onclick="ev={page:1,search:s.value,category_id:c.value,status:st.value};run(V.events)">Filter</button>
    ${staff ? '<button onclick="evForm()">+ New event</button>' : ''}</div>
    ${
      list.length
        ? `<div class="grid">${list
            .map(
              (x) => `<div class="card stub"><h3>${e(x.title)}</h3>
      <span class="mut">${e(x.category_name || cn(x.category_id))} - ${e(x.venue_name || 'Venue #' + x.venue_id)}</span>
      <span class="mut">${e(x.start_datetime)} to ${e(x.end_datetime)}</span><p>${e(x.description)}</p>
      <div><span class="price">${money(x.ticket_price)}</span> ${tag(x.status)} <span class="mut">${x.available_tickets}/${x.total_tickets} left</span></div>
      <div class="row">${!staff && x.status === 'upcoming' && x.available_tickets > 0 ? `<button onclick="book(${x.id},'${e(x.title).replace(/'/g, '')}')">Book tickets</button>` : ''}
      ${staff ? `<button class="sec" onclick='evForm(${JSON.stringify(x).replace(/'/g, '&#39;')})'>Edit</button><button class="del" onclick="del('/events/${x.id}',V.events)">Delete</button>` : ''}</div></div>`,
            )
            .join('')}</div>`
        : empty('No events match your filters.')
    }
    <div class="pager"><button class="sec" ${ev.page < 2 ? 'disabled' : ''} onclick="ev.page--;run(V.events)">Previous</button>Page ${ev.page}${last ? ' of ' + last : ''}
    <button class="sec" ${(last ? ev.page >= last : list.length < 6) ? 'disabled' : ''} onclick="ev.page++;run(V.events)">Next</button></div>`;
};
const del = (path, then) =>
  confirm('Delete this record?') &&
  run(async () => {
    await api(path, 'DELETE');
    msg('Deleted', 1);
    then();
  });
function book(id, title) {
  form(
    'Book: ' + title,
    [
      ['quantity', 'Number of tickets', 'number'],
      [
        'payment_method',
        'Payment method',
        'select',
        [
          ['e_wallet', 'E-wallet'],
          ['credit_card', 'Credit card'],
          ['debit_card', 'Debit card'],
          ['online_banking', 'Online banking'],
        ],
      ],
    ],
    { quantity: 1 },
    async (o) => {
      const b = await api('/bookings', 'POST', { event_id: id, quantity: +o.quantity }),
        d = b.data || b;
      const bid = d.id || d.booking_id || (d.booking && d.booking.id);
      await api('/payments', 'POST', { booking_id: bid, payment_method: o.payment_method });
      msg('Booking confirmed and paid', 1);
      go('bookings');
    },
  );
}
async function evForm(x = {}) {
  const ven = rows(await api('/venues'));
  form(
    x.id ? 'Edit event' : 'New event',
    [
      ['title', 'Title', 'text'],
      ['description', 'Description', 'textarea'],
      ['category_id', 'Category', 'select', CAT.map((c) => [c.id, c.category_name])],
      ['venue_id', 'Venue', 'select', ven.map((v) => [v.id, v.name])],
      ['start_datetime', 'Starts', 'datetime-local'],
      ['end_datetime', 'Ends', 'datetime-local'],
      ['ticket_price', 'Ticket price (RM)', 'number'],
      ['total_tickets', 'Total tickets', 'number'],
      [
        'status',
        'Status',
        'select',
        ['upcoming', 'ongoing', 'completed', 'cancelled'].map((s) => [s, s]),
      ],
    ],
    { ...x, start_datetime: dt(x.start_datetime), end_datetime: dt(x.end_datetime) },
    async (o) => {
      const b = {
        ...o,
        start_datetime: sqlDt(o.start_datetime),
        end_datetime: sqlDt(o.end_datetime),
        category_id: +o.category_id,
        venue_id: +o.venue_id,
        ticket_price: +o.ticket_price,
        total_tickets: +o.total_tickets,
      };
      await api(x.id ? '/events/' + x.id : '/events', x.id ? 'PUT' : 'POST', b);
      msg('Event saved', 1);
      V.events();
    },
  );
}

// ---------- Bookings ----------
V.bookings = async () => {
  const list = rows(await api('/bookings'));
  $('#view').innerHTML =
    `<h2>${staff ? 'Bookings' : 'My bookings'}</h2>` +
    table(
      [
        ['Code', (b) => e(b.booking_code)],
        ['Event', (b) => e(b.event_title || b.title || '#' + b.event_id)],
        ...(staff ? [['Customer', (b) => e(b.customer_name || '#' + b.customer_id)]] : []),
        ['Qty', (b) => b.quantity],
        ['Total', (b) => money(b.total_amount)],
        ['Status', (b) => tag(b.status)],
        [
          '',
          (b) =>
            `<div class="row">${b.status === 'confirmed' ? `<button class="sec" onclick="qr(${b.id})">QR ticket</button>` : ''}${b.status !== 'cancelled' ? `<button class="del" onclick="cancelB(${b.id})">Cancel</button>` : ''}</div>`,
        ],
      ],
      list,
    );
};
const cancelB = (id) =>
  confirm('Cancel this booking?') &&
  run(async () => {
    await api('/bookings/' + id, 'DELETE');
    msg('Booking cancelled', 1);
    V.bookings();
  });
const qr = (id) =>
  run(async () => {
    const j = await api(`/bookings/${id}/qr`),
      m = JSON.stringify(j)
        .replace(/\\\//g, '/')
        .replace(/\\u0026/g, '&')
        .match(/https?:\/\/[^"]*qrserver[^"]*|data:image[^"]*/);
    $('#dlg').innerHTML =
      `<h3>Your ticket</h3>${m ? `<img src="${e(m[0])}" alt="QR code">` : `<pre>${e(JSON.stringify(j, null, 1))}</pre>`}<div class="row"><button class="sec" onclick="dlg.close()">Close</button></div>`;
    $('#dlg').showModal();
  });

// ---------- Payments ----------
V.payments = async () => {
  const list = rows(await api('/payments'));
  $('#view').innerHTML =
    '<h2>Payments and refunds</h2>' +
    table(
      [
        ['Reference', (p) => e(p.payment_reference)],
        ['Booking', (p) => '#' + p.booking_id],
        ['Amount', (p) => money(p.amount)],
        ['Method', (p) => e(p.payment_method)],
        ['Status', (p) => tag(p.payment_status)],
        ['Refunded', (p) => (p.refunded_at ? e(p.refunded_at) : '-')],
        [
          '',
          (p) =>
            staff && p.payment_status === 'refund_pending'
              ? `<button onclick="refund(${p.id})">Process refund</button>`
              : '',
        ],
      ],
      list,
    );
};
const refund = (id) =>
  run(async () => {
    await api(`/payments/${id}/refund`, 'POST');
    msg('Refund processed', 1);
    V.payments();
  });

// ---------- Notifications ----------
V.notifications = async () => {
  const list = rows(await api('/notifications'));
  $('#view').innerHTML =
    `<h2>Notifications</h2>${staff ? '<div class="bar"><button onclick="notifForm()">+ Send notification</button></div>' : ''}` +
    (list.length
      ? list
          .map(
            (
              n,
            ) => `<div class="card ${+n.is_read ? '' : 'unread'}" style="margin-bottom:10px"><b>${e(n.title)}</b><span>${e(n.message)}</span>
      <span class="mut">${e(n.notification_type)} - ${e(n.created_at)}</span><div class="row">
      ${+n.is_read ? '' : `<button class="sec" onclick="markRead(${n.id})">Mark as read</button>`}<button class="del" onclick="del('/notifications/${n.id}',V.notifications)">Delete</button></div></div>`,
          )
          .join('')
      : empty('No notifications.'));
};
const markRead = (id) =>
  run(async () => {
    await api(`/notifications/${id}/read`, 'PUT');
    V.notifications();
  });
const notifForm = () =>
  form(
    'Send notification',
    [
      ['title', 'Title', 'text'],
      ['message', 'Message', 'textarea'],
      [
        'notification_type',
        'Type',
        'select',
        ['general', 'event_updated', 'event_cancelled', 'event_reminder'].map((s) => [s, s]),
      ],
      [
        'broadcast',
        'Send to',
        'select',
        [
          ['yes', 'All customers'],
          ['no', 'One user (enter ID below)'],
        ],
      ],
      ['recipient_id', 'Recipient user ID', 'number'],
      ['event_id', 'Event ID (optional)', 'number'],
    ],
    {},
    async (o) => {
      const b = clean(o);
      b.broadcast = o.broadcast === 'yes';
      await api('/notifications', 'POST', b);
      msg('Notification sent', 1);
      V.notifications();
    },
  );

// ---------- Venues ----------
V.venues = async () => {
  const list = rows(await api('/venues'));
  $('#view').innerHTML =
    `<h2>Venues</h2>${staff ? '<div class="bar"><button onclick="venForm()">+ New venue</button></div>' : ''}` +
    table(
      [
        ['Name', (v) => e(v.name)],
        ['Address', (v) => e(v.address)],
        ['Capacity', (v) => v.capacity],
        [
          '',
          (v) =>
            staff
              ? `<div class="row"><button class="sec" onclick='venForm(${JSON.stringify(v).replace(/'/g, '&#39;')})'>Edit</button>${admin ? `<button class="del" onclick="del('/venues/${v.id}',V.venues)">Delete</button>` : ''}</div>`
              : '',
        ],
      ],
      list,
    );
};
const venForm = (v = {}) =>
  form(
    v.id ? 'Edit venue' : 'New venue',
    [
      ['name', 'Name', 'text'],
      ['address', 'Address', 'text'],
      ['capacity', 'Capacity', 'number'],
      ['description', 'Description', 'textarea'],
    ],
    v,
    async (o) => {
      o.capacity = +o.capacity;
      await api(v.id ? '/venues/' + v.id : '/venues', v.id ? 'PUT' : 'POST', o);
      msg('Venue saved', 1);
      V.venues();
    },
  );

// ---------- Venue unavailability (admin blocks, organiser reservations) ----------
V.unavailability = async () => {
  const [list, ven] = [rows(await api('/unavailability')), rows(await api('/venues'))];
  window._ven = ven;
  const vn = (id) => (ven.find((v) => v.id == id) || {}).name || '#' + id;
  const typeLabel = (t) => (t === 'organiser_booking' ? 'Organiser reservation' : 'Admin block');
  $('#view').innerHTML =
    '<h2>Venue availability</h2><p class="mut">Times when a venue cannot be used for events.</p>' +
    '<div class="bar"><button onclick="avForm()">+ New slot</button></div>' +
    table(
      [
        ['Venue', (a) => e(a.venue_name || vn(a.venue_id))],
        ['Date', (a) => e(a.unavailability_date)],
        ['From', (a) => e(String(a.start_time).slice(0, 5))],
        ['To', (a) => e(String(a.end_time).slice(0, 5))],
        ['Type', (a) => e(typeLabel(a.record_type))],
        ['Reason', (a) => e(a.reason)],
        [
          '',
          (a) =>
            `<div class="row"><button class="sec" onclick='avForm(${JSON.stringify(a).replace(/'/g, '&#39;')})'>Edit</button><button class="del" onclick="del('/unavailability/${a.id}',V.unavailability)">Delete</button></div>`,
        ],
      ],
      list,
    );
};
const avForm = async (a = {}) => {
  const ven = window._ven || rows(await api('/venues'));
  form(
    a.id ? 'Edit slot' : 'New slot',
    [
      ['venue_id', 'Venue', 'select', ven.map((v) => [v.id, v.name])],
      ['unavailability_date', 'Date', 'date'],
      ['start_time', 'Start time', 'time'],
      ['end_time', 'End time', 'time'],
      ['reason', 'Reason (optional)', 'text'],
    ],
    {
      ...a,
      start_time: String(a.start_time || '').slice(0, 5),
      end_time: String(a.end_time || '').slice(0, 5),
    },
    async (o) => {
      const b = clean({
        ...o,
        venue_id: +o.venue_id,
        start_time: o.start_time + ':00',
        end_time: o.end_time + ':00',
      });
      await api(a.id ? '/unavailability/' + a.id : '/unavailability', a.id ? 'PUT' : 'POST', b);
      msg('Slot saved', 1);
      V.unavailability();
    },
  );
};

// ---------- Users (admin) ----------
V.users = async () => {
  const list = rows(await api('/users'));
  $('#view').innerHTML =
    '<h2>Users</h2><div class="bar"><button onclick="userForm()">+ New user</button></div>' +
    table(
      [
        ['Name', (u) => e(u.name)],
        ['Email', (u) => e(u.email)],
        ['Role', (u) => tag(u.role)],
        [
          '',
          (u) =>
            `<div class="row"><button class="sec" onclick='userForm(${JSON.stringify(u).replace(/'/g, '&#39;')})'>Edit</button><button class="del" onclick="del('/users/${u.id}',V.users)">Delete</button></div>`,
        ],
      ],
      list,
    );
};
const userForm = (u = {}) =>
  form(
    u.id ? 'Edit user' : 'New user',
    [
      ['name', 'Name', 'text'],
      ['email', 'Email', 'email'],
      ['password', u.id ? 'New password (leave blank to keep)' : 'Password', 'password'],
      ['role', 'Role', 'select', ['customer', 'organiser', 'admin'].map((r) => [r, r])],
    ],
    { ...u, password: '' },
    async (o) => {
      await api(u.id ? '/users/' + u.id : '/users', u.id ? 'PUT' : 'POST', clean(o));
      msg('User saved', 1);
      V.users();
    },
  );

nav();
run(V.events);
