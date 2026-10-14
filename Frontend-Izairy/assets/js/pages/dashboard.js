(() => {
  'use strict';
  const A = window.Ticket4uAPI;
  const $ = s => document.querySelector(s);
  async function list(path) { return A.listOf(await A.request(path)); }
  function renderEvent(item) {
    const d = A.fmtDateTile(item.start_datetime);
    return `<div class="recent-item"><div class="date-tile"><b>${A.escapeHtml(d.day)}</b><small>${A.escapeHtml(d.month)}</small></div><div class="recent-main"><b>${A.escapeHtml(A.eventTitle(item))}</b><small>${A.escapeHtml(item.venue_name || 'Venue to be confirmed')} · ${A.escapeHtml(A.fmtDate(item.start_datetime,true))}</small></div><span class="recent-price">${A.fmtMoney(item.ticket_price)}</span></div>`;
  }
  function renderBooking(item) {
    return `<div class="recent-item"><div class="notification-icon">▣</div><div class="recent-main"><b>${A.escapeHtml(A.bookingEventTitle(item))}</b><small>${A.escapeHtml(item.booking_code || `Booking #${A.itemId(item,['id','booking_id'])}`)} · ${A.escapeHtml(A.fmtDate(item.created_at || item.booking_date))}</small></div>${A.badge(A.bookingStatus(item))}</div>`;
  }
  async function init() {
    const results = await Promise.allSettled([
      list('/events?page=1&per_page=100'),
      list('/bookings?page=1&per_page=100'),
      list('/notifications?page=1&per_page=100')
    ]);
    let events = results[0].status === 'fulfilled' ? results[0].value : [];
    if (A.isOrganiser()) {
      const ownId = String(A.currentUserId());
      events = events.filter(e => {
        const ownerId = e.organiser_id ?? e.organizer_id ?? e.organiser_user_id ??
          e.organizer_user_id ?? e.created_by ?? e.created_by_user_id ?? '';
        return ownerId !== '' && String(ownerId) === ownId;
      });
    }
    const bookings = results[1].status === 'fulfilled' ? results[1].value : [];
    const notifications = results[2].status === 'fulfilled' ? results[2].value : [];
    const upcoming = events.slice().sort((a,b)=>new Date(String(a.start_datetime || '').replace(' ','T'))-new Date(String(b.start_datetime || '').replace(' ','T')));
    const unread = notifications.filter(n => !(Number(n.is_read) === 1 || n.is_read === true)).length;
    const ticketCount = events.reduce((sum,e)=>sum+Number(e.available_tickets ?? e.tickets_available ?? e.available_seats ?? 0),0);
    $('#dashboard-stats').innerHTML = `
      <div class="stat-card"><div class="stat-label">Events listed <span class="stat-icon">◷</span></div><div class="stat-value">${events.length}</div><div class="stat-foot">Events in your workspace</div></div>
      <div class="stat-card"><div class="stat-label">Bookings <span class="stat-icon">▣</span></div><div class="stat-value">${bookings.length}</div><div class="stat-foot">Records visible to your role</div></div>
      <div class="stat-card"><div class="stat-label">Unread updates <span class="stat-icon">♧</span></div><div class="stat-value">${unread}</div><div class="stat-foot">Notifications waiting for you</div></div>
      <div class="stat-card"><div class="stat-label">Tickets available <span class="stat-icon">↗</span></div><div class="stat-value">${ticketCount.toLocaleString('en-MY')}</div><div class="stat-foot">Where availability is returned by the API</div></div>`;
    if (results[0].status === 'rejected') A.showLoadError('#dashboard-events', results[0].reason.message);
    else $('#dashboard-events').innerHTML = upcoming.length ? upcoming.slice(0,5).map(renderEvent).join('') : `<div class="empty-state"><div class="empty-icon">◷</div><strong>No events listed yet</strong><p>Events will appear here when they're available in the system.</p></div>`;
    if (results[1].status === 'rejected') A.showLoadError('#dashboard-bookings', results[1].reason.message);
    else $('#dashboard-bookings').innerHTML = bookings.length ? bookings.slice(0,5).map(renderBooking).join('') : `<div class="empty-state"><div class="empty-icon">▣</div><strong>No bookings yet</strong><p>Your booking activity will appear here.</p><a class="btn btn-secondary btn-small" href="events.php">Browse events</a></div>`;
    if (results.some(r=>r.status==='rejected')) A.setNotice('Some dashboard information could not be loaded. Review the message in the affected section and check your API connection.','error');
  }
  init().catch(e=>A.setNotice(e.message,'error'));
})();
