(() => {
  'use strict';
  const A = window.Ticket4uAPI, $ = s => document.querySelector(s);
  let bookings = [], events = [], payments = [], printableTicket = null;
  const bid = b => A.itemId(b, ['id', 'booking_id']);
  const pid = p => A.itemId(p, ['id', 'payment_id']);
  const cleanStatus = s => String(s || '').toLowerCase().replaceAll('_', ' ').trim();
  const paidStatuses = ['paid', 'successful', 'succeeded', 'completed'];
  const refundStatuses = ['refund pending', 'refund requested', 'pending refund'];

  function paymentForBooking(booking) {
    const id = String(bid(booking));
    const direct = booking.payment || null;
    const matches = payments.filter(p => String(p.booking_id ?? (p.booking && p.booking.id) ?? '') === id)
      .sort((a, b) => Number(pid(b) || 0) - Number(pid(a) || 0));
    return matches[0] || direct || null;
  }

  function enhanceBooking(booking) {
    const payment = paymentForBooking(booking);
    const pstatus = payment ? (payment.status || payment.payment_status || '')
      : (booking.payment_status || (booking.payment && (booking.payment.status || booking.payment.payment_status)) || '');
    return Object.assign({}, booking, {
      payment: payment || booking.payment || null,
      payment_id: payment ? pid(payment) : A.paymentId(booking),
      payment_status: pstatus,
      payment_method: payment ? (payment.payment_method || '') : (booking.payment_method || '')
    });
  }

  async function refresh() {
    $('#bookings-table').innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading bookings…</div>';
    try {
      const results = await Promise.allSettled([
        A.request('/bookings?page=1&per_page=100'),
        A.request('/events?page=1&per_page=100'),
        A.request('/payments?page=1&per_page=100')
      ]);
      if (results[0].status === 'rejected') throw results[0].reason;
      bookings = A.listOf(results[0].value);
      events = results[1].status === 'fulfilled' ? A.listOf(results[1].value) : [];
      payments = results[2].status === 'fulfilled' ? A.listOf(results[2].value) : [];
      bookings = bookings.map(enhanceBooking);
      $('#bookings-heading').textContent = A.isCustomer() ? 'My bookings' : 'Booking register';
      $('#bookings-explainer').textContent = A.isCustomer() ? 'Your bookings, payment status and ticket QR codes.' : 'Booking records visible to your role.';
      $('#booking-total').textContent = `${bookings.length} record${bookings.length === 1 ? '' : 's'}`;
      $('#bookings-actions').innerHTML = A.isCustomer() ? '<a class="btn btn-primary" href="events.php">＋ Browse events</a>' : '';
      if (results[2].status === 'rejected') A.setNotice('Payment details could not be retrieved from GET /payments. Ticket QR actions require payment details from this endpoint or the booking response.', 'info');
      render();
    } catch (e) {
      A.showLoadError('#bookings-table', e.message);
      A.setNotice('The booking list could not be loaded.', 'error');
    }
  }

  function render() {
    $('#bookings-table').innerHTML = bookings.length ? `<table><thead><tr><th>Booking</th><th>Event / hall</th><th>Tickets</th><th>Amount</th><th>Booking status</th><th>Payment</th><th>Actions</th></tr></thead><tbody>${bookings.map(raw => {
      const b = enhanceBooking(raw);
      const id = bid(b), status = cleanStatus(A.bookingStatus(b)), pstatus = cleanStatus(A.paymentStatus(b));
      const qty = b.quantity ?? b.ticket_quantity ?? b.tickets ?? '—';
      const cancelled = ['cancelled', 'canceled'].includes(status);
      const paid = paidStatuses.includes(pstatus) && !cancelled;
      const canPay = A.isCustomer() && ['pending', 'pending payment'].includes(status) && !paid && !['refunded', 'refund pending'].includes(pstatus);
      const canCancel = A.isCustomer() && ['pending', 'pending payment', 'confirmed'].includes(status) && !cancelled;
      const qrAction = A.isCustomer() && paid ? `<button class="btn btn-secondary btn-small" data-view-ticket="${A.escapeHtml(id)}">Ticket QR</button>` : '';
      const p = paymentForBooking(b);
      const paymentId = b.payment_id || A.paymentId(p) || '';
      const paymentStatus = cleanStatus((p && (p.status || p.payment_status)) || pstatus);
      const canRefund = A.isStaff() && !!paymentId && refundStatuses.includes(paymentStatus) && cancelled;
      const refundAction = canRefund ? `<button class="btn btn-danger btn-small" data-refund-payment="${A.escapeHtml(paymentId)}">Process refund</button>` : '';
      const actions = `${canPay ? `<button class="btn btn-secondary btn-small" data-pay-booking="${A.escapeHtml(id)}">Pay</button>` : ''}${canCancel ? `<button class="btn btn-danger btn-small" data-cancel-booking="${A.escapeHtml(id)}">Cancel</button>` : ''}${qrAction}${refundAction}${!canPay && !canCancel && !qrAction && !refundAction ? '<span class="small-note">No action</span>' : ''}`;
      return `<tr><td><span class="table-primary">${A.escapeHtml(b.booking_code || b.code || `BK-${id}`)}</span><span class="table-sub">ID: ${A.escapeHtml(id)} · ${A.escapeHtml(A.fmtDate(b.created_at || b.booking_date))}</span></td><td><span class="table-primary">${A.escapeHtml(A.bookingEventTitle(b))}</span><span class="table-sub">${A.escapeHtml(b.venue_name || (b.event && b.event.venue_name) || '')}</span></td><td>${A.escapeHtml(qty)}</td><td>${A.fmtMoney(A.amountOf(b))}</td><td>${A.badge(status)}</td><td>${A.badge(pstatus || 'not paid')}</td><td><div class="table-actions">${actions}</div></td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty-state"><div class="empty-icon">▣</div><strong>No bookings found</strong><p>${A.isCustomer() ? 'When you book an event, your booking and ticket details will appear here.' : 'No booking records were returned for your account.'}</p>${A.isCustomer() ? '<a class="btn btn-primary btn-small" href="events.php">Browse events</a>' : ''}</div>`;
  }

  function openNewBooking() {
    const opts = [{ value: '', label: 'Choose an event' }, ...events.map(ev => ({ value: A.itemId(ev, ['id', 'event_id']), label: `${A.eventTitle(ev)} — ${A.fmtMoney(ev.ticket_price)}` }))];
    const body = `<form id="new-booking-form"><div class="form-grid">${A.selectField('Event', 'event_id', opts, '', 'required')}${A.textField('Ticket quantity', 'quantity', '1', 'number', 'min="1" max="20" step="1" required')}</div><p class="small-note" style="margin-top:12px">After creating the booking, choose Pay. Your ticket QR becomes available after payment succeeds.</p><div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Cancel</button><button class="btn btn-primary" type="submit">Create booking</button></div></form>`;
    A.showDialog('New booking', body);
  }

  function openPayBooking(id) {
    const methods = [{ value: 'e_wallet', label: 'E-wallet' }, { value: 'credit_card', label: 'Credit card' }, { value: 'debit_card', label: 'Debit card' }, { value: 'online_banking', label: 'Online banking' }];
    const body = `<form id="pay-booking-form" data-booking-id="${A.escapeHtml(id)}">${A.selectField('Payment method', 'payment_method', methods, 'e_wallet', 'required')}<div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Cancel</button><button class="btn btn-primary" type="submit">Confirm payment</button></div></form>`;
    A.showDialog('Pay for booking', body);
  }

  function showQr(id, payload) {
    const data = A.dataOf(payload) || {};
    const qrUrl = data.qr_image_url || (data.data && data.data.qr_image_url) || '';
    const booking = bookings.find(b => String(bid(b)) === String(id)) || {};
    const bookingCode = data.booking_code || booking.booking_code || booking.code || `BK-${id}`;
    if (!qrUrl) {
      A.showDialog('Ticket QR unavailable', `<div class="notice error">The API did not return a QR image URL. Confirm that the QR endpoint and API key are configured, then try again.</div><div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Close</button></div>`);
      return;
    }

    const eventId = booking.event_id ?? (booking.event && (booking.event.id || booking.event.event_id));
    const event = events.find(item => String(A.itemId(item, ['id', 'event_id'])) === String(eventId)) || booking.event || booking.event_details || {};
    const eventName = A.bookingEventTitle(booking) || A.eventTitle(event);
    const venueName = booking.venue_name || (booking.venue && booking.venue.name) ||
      (booking.event && (booking.event.venue_name || (booking.event.venue && booking.event.venue.name))) ||
      event.venue_name || (event.venue && event.venue.name) || 'Venue details unavailable';
    const startDate = booking.start_datetime || booking.event_start_datetime ||
      (booking.event && booking.event.start_datetime) || event.start_datetime || '';
    const endDate = booking.end_datetime || booking.event_end_datetime ||
      (booking.event && booking.event.end_datetime) || event.end_datetime || '';
    const quantity = booking.quantity ?? booking.ticket_quantity ?? booking.tickets ?? '—';
    const amount = A.amountOf(booking);
    const payment = paymentForBooking(booking) || booking.payment || {};
    const payStatus = payment.status || payment.payment_status || booking.payment_status || 'paid';
    const payMethod = String(payment.payment_method || booking.payment_method || '—').replaceAll('_', ' ');
    const bookingStatus = A.bookingStatus(booking);
    const customerName = booking.customer_name || (booking.customer && booking.customer.name) || A.currentUserName();
    const ticket = {
      bookingCode, bookingId: id, eventName, venueName, startDate, endDate,
      quantity, amount, paymentStatus: payStatus, paymentMethod: payMethod,
      bookingStatus, customerName, qrUrl,
      qrData: data.qr_data || bookingCode
    };
    printableTicket = ticket;

    const field = (label, value) => `<div class="ticket-detail"><span>${A.escapeHtml(label)}</span><strong>${A.escapeHtml(value === null || value === undefined || value === '' ? 'Not available' : value)}</strong></div>`;
    const body = `<div class="ticket-qr-view">
      <div class="ticket-qr-top"><span class="brand-symbol">T4</span><div><h3>Your ticket is ready</h3><p>${A.escapeHtml(bookingCode)}</p></div></div>
      <div class="ticket-details-grid">
        ${field('Booking code', bookingCode)}
        ${field('Booking ID', id)}
        ${field('Customer', customerName)}
        ${field('Event', eventName)}
        ${field('Venue', venueName)}
        ${field('Event starts', startDate ? A.fmtDate(startDate, true) : 'Not available')}
        ${field('Event ends', endDate ? A.fmtDate(endDate, true) : 'Not available')}
        ${field('Tickets', quantity)}
        ${field('Total amount', A.fmtMoney(amount))}
        ${field('Booking status', bookingStatus)}
        ${field('Payment status', payStatus)}
        ${field('Payment method', payMethod)}
      </div>
      <img class="ticket-qr-image" src="${A.escapeHtml(qrUrl)}" alt="QR ticket for ${A.escapeHtml(bookingCode)}">
      <p class="small-note">Present this QR code at the event for ticket verification. Keep your booking code for reference.</p>
      <div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Close</button><button class="btn btn-primary" type="button" data-print-ticket>Print ticket</button></div>
    </div>`;
    A.showDialog('Your ticket', body, true);
  }

  function printTicket() {
    if (!printableTicket) return A.notify('Ticket information is not ready. Reopen the Ticket QR first.', 'error');
    const t = printableTicket;
    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) {
      A.notify('Your browser blocked the print window. Allow pop-ups for localhost and try again.', 'error');
      return;
    }
    const esc = A.escapeHtml;
    const dateLine = t.startDate ? A.fmtDate(t.startDate, true) : 'Not available';
    const endLine = t.endDate ? A.fmtDate(t.endDate, true) : 'Not available';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ticket4u Ticket - ${esc(t.bookingCode)}</title>
      <style>
        *{box-sizing:border-box}body{margin:0;padding:28px;background:#f5f1fb;color:#30283d;font:14px/1.5 Arial,sans-serif}
        .ticket{max-width:760px;margin:0 auto;background:#fff;border:1px solid #ded3ef;border-radius:18px;overflow:hidden}
        .brand{display:flex;align-items:center;gap:12px;background:#f0e8fb;padding:22px 26px;border-bottom:1px dashed #cdb9e7}
        .mark{display:grid;place-items:center;width:46px;height:46px;border-radius:12px;background:#cbb7e9;color:#44335f;font-weight:800;font-size:18px}
        h1{font-size:23px;margin:0 0 3px}.sub{color:#70667e;margin:0}.content{padding:24px 26px}
        .code{font-size:18px;font-weight:bold;overflow-wrap:anywhere;color:#6c5294;margin:0 0 18px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px;border-top:1px solid #eee8f4}
        .item{padding:11px 0;border-bottom:1px solid #eee8f4;min-width:0}.item span{display:block;color:#81768f;font-size:11px;text-transform:uppercase;letter-spacing:.04em}.item strong{display:block;overflow-wrap:anywhere;margin-top:3px}
        .qr{display:block;width:245px;height:245px;object-fit:contain;margin:24px auto 8px;padding:10px;background:white;border:1px solid #e5deee;border-radius:12px}
        .note{text-align:center;color:#756b80;font-size:12px;margin:4px 0 0}.print-actions{text-align:center;margin:18px auto 0}.print-actions button{padding:10px 18px;background:#bca4e0;border:0;border-radius:7px;font-weight:bold;color:#342648;cursor:pointer}
        @media print{body{padding:0;background:#fff}.ticket{border:1px solid #ddd;border-radius:0;max-width:none}.print-actions{display:none}.content{padding:18px 22px}.brand{padding:16px 22px}}
        @media(max-width:600px){body{padding:10px}.grid{grid-template-columns:1fr}.content{padding:18px}}
      </style></head><body><main class="ticket"><header class="brand"><div class="mark">T4</div><div><h1>Ticket4u</h1><p class="sub">Event Ticket</p></div></header><section class="content">
      <p class="code">${esc(t.bookingCode)}</p><div class="grid">
        <div class="item"><span>Booking ID</span><strong>${esc(t.bookingId)}</strong></div>
        <div class="item"><span>Customer</span><strong>${esc(t.customerName)}</strong></div>
        <div class="item"><span>Event</span><strong>${esc(t.eventName)}</strong></div>
        <div class="item"><span>Venue</span><strong>${esc(t.venueName)}</strong></div>
        <div class="item"><span>Starts</span><strong>${esc(dateLine)}</strong></div>
        <div class="item"><span>Ends</span><strong>${esc(endLine)}</strong></div>
        <div class="item"><span>Tickets</span><strong>${esc(t.quantity)}</strong></div>
        <div class="item"><span>Total amount</span><strong>${esc(A.fmtMoney(t.amount))}</strong></div>
        <div class="item"><span>Booking status</span><strong>${esc(t.bookingStatus)}</strong></div>
        <div class="item"><span>Payment</span><strong>${esc(t.paymentStatus)} — ${esc(t.paymentMethod)}</strong></div>
      </div><img class="qr" id="ticket-qr" src="${esc(t.qrUrl)}" alt="Ticket QR code"><p class="note">Keep this ticket and present the QR code for verification at the event.</p><div class="print-actions"><button type="button" onclick="window.print()">Print ticket</button></div></section></main>
      <script>window.addEventListener('load',function(){var img=document.getElementById('ticket-qr');var printWhenReady=function(){setTimeout(function(){window.focus();window.print();},350);};if(img.complete&&img.naturalWidth>0){printWhenReady();}else{img.addEventListener('load',printWhenReady,{once:true});img.addEventListener('error',function(){document.querySelector('.note').textContent='QR image could not load. Reopen the ticket while connected to the internet.';},{once:true});}});</script>
      </body></html>`;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }
  async function viewTicket(id) {
    A.showDialog('Loading ticket QR', '<div class="loading-state"><span class="spinner"></span>Generating ticket QR…</div>');
    try { showQr(id, await A.getBookingQr(id)); }
    catch (error) {
      A.showDialog('Ticket QR unavailable', `<div class="notice error">${A.escapeHtml(error.message)}</div><div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Close</button><button class="btn btn-primary" type="button" data-retry-qr="${A.escapeHtml(id)}">Try again</button></div>`);
    }
  }

  async function cancelBooking(id) {
    if (!A.isCustomer()) return A.notify('Only customers can cancel their own bookings.', 'error');
    if (!window.confirm('Cancel this booking? If payment was completed, it may require a refund to be processed by Admin or Organiser.')) return;
    try {
      await A.request(`/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
      A.notify('Booking cancelled. Check the payment/refund status.');
      await refresh();
    } catch (e) { A.notify(e.message, 'error'); }
  }

  async function processRefund(paymentId, button) {
    if (!A.isStaff()) return A.notify('Only Admin or Organiser can process refunds.', 'error');
    if (!window.confirm('Process this refund? The API will verify that the payment is eligible.')) return;
    button.disabled = true;
    try {
      await A.request(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: 'POST', body: {} });
      A.notify('Refund processed successfully.');
      await refresh();
    } catch (e) { A.notify(e.message, 'error'); button.disabled = false; }
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#new-booking-button') && A.isCustomer()) openNewBooking();
    const pay = e.target.closest('[data-pay-booking]'); if (pay && A.isCustomer()) openPayBooking(pay.dataset.payBooking);
    const cancel = e.target.closest('[data-cancel-booking]'); if (cancel && A.isCustomer()) cancelBooking(cancel.dataset.cancelBooking);
    const qr = e.target.closest('[data-view-ticket]'); if (qr && A.isCustomer()) viewTicket(qr.dataset.viewTicket);
    const retry = e.target.closest('[data-retry-qr]'); if (retry && A.isCustomer()) viewTicket(retry.dataset.retryQr);
    const print = e.target.closest('[data-print-ticket]'); if (print && A.isCustomer()) printTicket();
    const refund = e.target.closest('[data-refund-payment]'); if (refund && A.isStaff()) processRefund(refund.dataset.refundPayment, refund);
  });

  document.addEventListener('submit', async e => {
    const form = e.target;
    if (form.id === 'new-booking-form') {
      e.preventDefault();
      if (!A.isCustomer()) return A.notify('Only customers can create ticket bookings.', 'error');
      const fd = new FormData(form);
      const body = { event_id: Number(fd.get('event_id')), quantity: Number(fd.get('quantity')) };
      try {
        const result = await A.request('/bookings', { method: 'POST', body });
        const data = A.dataOf(result) || {};
        const id = data.id || data.booking_id || (data.booking && data.booking.id);
        A.closeDialog();
        A.notify('Booking created. Complete payment to receive your ticket QR.');
        await refresh();
        if (id) A.notify(`Booking #${id} created.`);
      } catch (err) { A.notify(err.message, 'error'); }
    }
    if (form.id === 'pay-booking-form') {
      e.preventDefault();
      if (!A.isCustomer()) return A.notify('Only customers can make payment.', 'error');
      const method = new FormData(form).get('payment_method'), id = form.dataset.bookingId;
      try {
        await A.request('/payments', { method: 'POST', body: { booking_id: Number(id), payment_method: method } });
        A.closeDialog();
        A.notify('Payment successful. Preparing your ticket QR…');
        await refresh();
        await viewTicket(id);
      } catch (err) { A.notify(err.message, 'error'); }
    }
  });

  refresh();
})();
