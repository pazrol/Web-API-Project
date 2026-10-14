(() => {
  'use strict';
  const A = window.Ticket4uAPI;
  const $ = s => document.querySelector(s);
  let events = [], venues = [], categories = [], users = [], filtered = [], currentPage = 1;
  const perPage = 9;
  const canManage = A.isStaff();
  const pickId = (obj, type) => A.itemId(obj, type === 'venue' ? ['id','venue_id'] : type === 'category' ? ['id','category_id'] : type === 'user' ? ['id','user_id'] : ['id','event_id']);
  async function loadAux() {
    const tasks = [A.request('/venues?page=1&per_page=100'), A.request('/categories?page=1&per_page=100')];
    if (A.isAdmin()) tasks.push(A.request('/users?page=1&per_page=100'));
    const [v,c,u] = await Promise.allSettled(tasks);
    venues = v.status==='fulfilled' ? A.listOf(v.value) : [];
    categories = c.status==='fulfilled' ? A.listOf(c.value) : [];
    users = u && u.status==='fulfilled' ? A.listOf(u.value) : [];
  }
  async function refresh() {
    $('#events-list').innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading events…</div>';
    try {
      const [eventResult] = await Promise.all([A.request('/events?page=1&per_page=100'), loadAux()]);
      events = A.listOf(eventResult);
      // Organisers only see events assigned to their account. Events without an
      // explicit matching owner are not shown to a newly registered organiser.
      if (A.isOrganiser()) {
        const ownId = String(A.currentUserId());
        events = events.filter(e => {
          const ownerId = e.organiser_id ?? e.organizer_id ?? e.organiser_user_id ??
            e.organizer_user_id ?? e.created_by ?? e.created_by_user_id ?? '';
          return ownerId !== '' && String(ownerId) === ownId;
        });
      }
      filterAndRender();
    } catch (error) {
      A.showLoadError('#events-list', error.message);
      A.setNotice('The event list could not be loaded. See the message in the Events section.','error');
    }
  }
  function filterAndRender() {
    const query = ($('#event-search').value || '').trim().toLowerCase();
    filtered = events.filter(e => !query || [A.eventTitle(e),e.description,e.category_name,e.venue_name].some(v=>String(v||'').toLowerCase().includes(query)));
    const totalPages = Math.max(1,Math.ceil(filtered.length/perPage));
    currentPage = Math.min(currentPage,totalPages);
    const pageEvents = filtered.slice((currentPage-1)*perPage,currentPage*perPage);
    $('#events-count').textContent = filtered.length ? `${filtered.length} event${filtered.length===1?'':'s'} · page ${currentPage} of ${totalPages}` : 'No events found';
    $('#events-prev').disabled = currentPage <= 1;
    $('#events-next').disabled = currentPage >= totalPages;
    $('#events-toolbar-actions').innerHTML = canManage ? '<button class="btn btn-primary" type="button" id="create-event-button">＋ Create event</button>' : '';
    $('#events-list').innerHTML = pageEvents.length ? `<div class="events-grid">${pageEvents.map(renderCard).join('')}</div>` : `<section class="panel">${emptyState('◷',query?'No matching events':'No events yet',query?'Try a different search term.':'Events will show here when they have been added to the system.',canManage?'<button class="btn btn-primary btn-small" data-new-event>Create event</button>':'')}</section>`;
  }
  function emptyState(icon,title,description,action='') { return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${A.escapeHtml(title)}</strong><p>${A.escapeHtml(description)}</p>${action?`<div style="margin-top:14px">${action}</div>`:''}</div>`; }
  function renderCard(e) {
    const id = pickId(e,'event');
    const category = e.category_name || A.categoryName(categories.find(c=>String(pickId(c,'category'))===String(e.category_id)));
    const venue = e.venue_name || A.venueName(venues.find(v=>String(pickId(v,'venue'))===String(e.venue_id)));
    const start = A.fmtDateTile(e.start_datetime);
    const available = e.available_tickets ?? e.tickets_available ?? e.available_seats ?? null;
    const remaining = available === null ? '' : `<small>${A.escapeHtml(available)} tickets left</small>`;
    const managerActions = canManage ? `<div class="event-actions"><button class="btn btn-muted btn-small" data-edit-event="${A.escapeHtml(id)}">Edit</button><button class="btn btn-danger btn-small" data-delete-event="${A.escapeHtml(id)}">Delete</button></div>` : '';
    const bookAction = A.isCustomer() ? `<button class="btn btn-primary btn-small" data-book-event="${A.escapeHtml(id)}">Book tickets</button>` : '';
    return `<article class="event-card"><div class="event-art"><span class="art-word">Ticket4u</span><span class="category-chip">${A.escapeHtml(category)}</span></div><div class="event-card-body"><h3>${A.escapeHtml(A.eventTitle(e))}</h3><div class="event-meta"><span>▦</span><span>${A.escapeHtml(A.fmtDate(e.start_datetime,true))}</span></div><div class="event-meta"><span>⌂</span><span>${A.escapeHtml(venue)}</span></div><div class="event-meta"><span>◷</span><span>${remaining || `${Number(e.total_tickets || 0).toLocaleString('en-MY')} total tickets`}</span></div><div class="event-card-footer"><div><div class="event-price">${A.fmtMoney(e.ticket_price)} <small>/ ticket</small></div></div>${bookAction}</div>${managerActions}</div></article>`;
  }
  function openEventForm(id='') {
    const current = id ? events.find(e=>String(pickId(e,'event'))===String(id)) || {} : {};
    const categoryOptions = [{value:'',label:'Choose category'},...categories.map(c=>({value:pickId(c,'category'),label:A.categoryName(c)}))];
    const venueOptions = [{value:'',label:'Choose venue'},...venues.map(v=>({value:pickId(v,'venue'),label:A.venueName(v)}))];
    let organiserField = '';
    if (A.isAdmin()) {
      const organisers = users.filter(u=>A.normaliseRole(u.role)==='organiser');
      organiserField = organisers.length ? A.selectField('Organiser','organiser_id',[{value:'',label:'Choose organiser'},...organisers.map(u=>({value:pickId(u,'user'),label:`${u.name || u.email} (#${pickId(u,'user')})`}))],current.organiser_id || '') : A.textField('Organiser user ID','organiser_id',current.organiser_id || '', 'number','min="1" required');
    }
    const startDate = String(current.start_datetime||'').replace(' ','T').slice(0,16);
    const endDate = String(current.end_datetime||'').replace(' ','T').slice(0,16);
    const body = `<form id="event-form" data-id="${A.escapeHtml(id)}"><div class="form-grid"><div class="span-2">${A.textField('Event title','title',current.title||'','text','maxlength="180" required')}</div><div class="span-2">${A.areaField('Description','description',current.description||'','maxlength="1500"')}</div>${A.selectField('Category','category_id',categoryOptions,current.category_id||'','required')}${A.selectField('Venue','venue_id',venueOptions,current.venue_id||'','required')}${A.textField('Start date and time','start_datetime',startDate,'datetime-local','required')}${A.textField('End date and time','end_datetime',endDate,'datetime-local','required')}${A.textField('Ticket price (RM)','ticket_price',current.ticket_price ?? '0','number','min="0" step="0.01" required')}${A.textField('Total tickets','total_tickets',current.total_tickets ?? '50','number','min="1" step="1" required')}${organiserField}</div><div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Cancel</button><button class="btn btn-primary" type="submit">${id?'Save changes':'Create event'}</button></div></form>`;
    A.showDialog(id?'Edit event':'Create event',body,true);
  }
  function openBookingForm(id) {
    const ev = events.find(e=>String(pickId(e,'event'))===String(id));
    if (!ev) return A.notify('This event is no longer available.','error');
    const body = `<form id="event-booking-form" data-event-id="${A.escapeHtml(id)}"><p class="muted">${A.escapeHtml(A.eventTitle(ev))} · ${A.fmtMoney(ev.ticket_price)} per ticket</p><div class="form-grid">${A.textField('Number of tickets','quantity','1','number','min="1" max="20" step="1" required')}</div><div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Cancel</button><button class="btn btn-primary" type="submit">Create booking</button></div></form>`;
    A.showDialog('Book tickets',body);
  }
  async function deleteEvent(id) {
    if (!window.confirm('Delete this event? Events that have bookings may not be removable.')) return;
    try { await A.request(`/events/${encodeURIComponent(id)}`,{method:'DELETE'}); A.notify('Event deleted.'); await refresh(); }
    catch(e){A.notify(e.message,'error');}
  }
  document.addEventListener('click', async e=>{
    const create = e.target.closest('#create-event-button,[data-new-event]');
    const edit = e.target.closest('[data-edit-event]');
    const del = e.target.closest('[data-delete-event]');
    const book = e.target.closest('[data-book-event]');
    if(create){if(!venues.length || !categories.length){await loadAux();}openEventForm();}
    if(edit) openEventForm(edit.dataset.editEvent);
    if(del) deleteEvent(del.dataset.deleteEvent);
    if(book) openBookingForm(book.dataset.bookEvent);
  });
  document.addEventListener('submit', async e=>{
    const form = e.target;
    if (form.id==='event-form') {
      e.preventDefault(); const fd = new FormData(form); const id = form.dataset.id;
      const body = Object.fromEntries(fd.entries());
      body.category_id = Number(body.category_id); body.venue_id = Number(body.venue_id); body.ticket_price = Number(body.ticket_price); body.total_tickets = Number(body.total_tickets);
      body.start_datetime = body.start_datetime.replace('T',' ')+ (body.start_datetime.length===16?':00':'');
      body.end_datetime = body.end_datetime.replace('T',' ')+ (body.end_datetime.length===16?':00':'');
      if (body.organiser_id) body.organiser_id = Number(body.organiser_id); else delete body.organiser_id;
      if (A.isOrganiser()) body.organiser_id = Number(A.currentUserId());
      try { await A.request(id?`/events/${encodeURIComponent(id)}`:'/events',{method:id?'PUT':'POST',body}); A.closeDialog(); A.notify(id?'Event updated.':'Event created.'); await refresh(); }
      catch(error){A.notify(error.message,'error');}
    }
    if (form.id==='event-booking-form') {
      e.preventDefault(); const quantity = Number(new FormData(form).get('quantity'));
      try { await A.request('/bookings',{method:'POST',body:{event_id:Number(form.dataset.eventId),quantity}}); A.closeDialog(); A.notify('Booking created. You can pay for it from Bookings.'); window.location.href='bookings.php'; }
      catch(error){A.notify(error.message,'error');}
    }
  });
  $('#event-search-button').addEventListener('click',()=>{currentPage=1;filterAndRender();});
  $('#event-clear-button').addEventListener('click',()=>{$('#event-search').value='';currentPage=1;filterAndRender();});
  $('#event-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();currentPage=1;filterAndRender();}});
  $('#events-prev').addEventListener('click',()=>{currentPage=Math.max(1,currentPage-1);filterAndRender();});
  $('#events-next').addEventListener('click',()=>{currentPage++;filterAndRender();});
  refresh();
})();
