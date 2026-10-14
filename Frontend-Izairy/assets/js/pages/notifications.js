(() => {
  'use strict';
  const A = window.Ticket4uAPI;
  const $ = (selector) => document.querySelector(selector);
  let notifications = [];
  let submitting = false;

  const nid = (notification) => A.itemId(notification, ['id', 'notification_id']);

  async function refresh() {
    const list = $('#notifications-list');
    if (!list) return;
    list.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading notifications…</div>';
    try {
      notifications = A.listOf(await A.request('/notifications?page=1&per_page=100'));
      render();
    } catch (error) {
      A.showLoadError('#notifications-list', error.message);
      A.setNotice('Your notifications could not be loaded.', 'error');
    }
  }

  function render() {
    const list = $('#notifications-list');
    if (!list) return;
    const unread = notifications.filter((item) => !(Number(item.is_read) === 1 || item.is_read === true)).length;

    if (A.isStaff()) {
      $('#notification-actions').innerHTML =
        '<button class="btn btn-muted" id="broadcast-notification-button" type="button">Send announcement</button>' +
        '<button class="btn btn-primary" id="send-notification-button" type="button">＋ Send notification</button>';
    } else {
      $('#notification-actions').innerHTML = '';
    }

    list.innerHTML = notifications.length
      ? `<section class="panel"><div class="panel-header"><div><h2>Your inbox</h2><p>${unread} unread notification${unread === 1 ? '' : 's'}.</p></div><span class="badge purple">${notifications.length} total</span></div><div class="notifications-list">${notifications.map((item) => {
          const read = Number(item.is_read) === 1 || item.is_read === true;
          return `<article class="notification-item ${read ? '' : 'unread'}"><div class="notification-icon">${read ? '✓' : '♧'}</div><div class="notification-main"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b>${A.escapeHtml(item.title || 'Notification')}</b>${A.badge(read ? 'read' : 'unread')}</div><p>${A.escapeHtml(item.message || '')}</p><small>${A.escapeHtml(String(item.notification_type || 'general').replaceAll('_', ' '))} · ${A.escapeHtml(A.fmtDate(item.created_at || item.sent_at, true))}</small></div>${read ? '' : `<button class="btn btn-muted btn-small" data-mark-read="${A.escapeHtml(nid(item))}">Mark read</button>`}</article>`;
        }).join('')}</div></section>`
      : '<section class="panel"><div class="empty-state"><div class="empty-icon">♧</div><strong>You\'re all caught up</strong><p>New booking, payment and event updates will appear here.</p></div></section>';
  }

  async function loadEventOptions() {
    try {
      return A.listOf(await A.request('/events?page=1&per_page=100'));
    } catch (_) {
      return [];
    }
  }

  async function sendForm(broadcast = false) {
    const events = await loadEventOptions();
    const fields = broadcast
      ? `${A.textField('Announcement title', 'title', '', 'text', 'maxlength="160" required')}<div class="span-2">${A.areaField('Message', 'message', '', 'required maxlength="1000"')}</div>${A.selectField('Notification type', 'notification_type', [{value:'general',label:'General announcement'},{value:'event_reminder',label:'Event reminder'},{value:'booking_update',label:'Booking update'}], 'general', 'required')}`
      : `${A.textField('Recipient user ID', 'recipient_id', '', 'number', 'min="1" step="1" required')} ${A.selectField('Related event (optional)', 'event_id', [{value:'',label:'No event linked'}, ...events.map((event) => ({value:A.itemId(event, ['id', 'event_id']),label:A.eventTitle(event)}))], '')} ${A.textField('Notification title', 'title', '', 'text', 'maxlength="160" required')}<div class="span-2">${A.areaField('Message', 'message', '', 'required maxlength="1000"')}</div>${A.selectField('Notification type', 'notification_type', [{value:'general',label:'General'},{value:'event_reminder',label:'Event reminder'},{value:'booking_update',label:'Booking update'},{value:'payment_update',label:'Payment update'}], 'general', 'required')}`;

    const formHtml = `<form id="notification-form" data-broadcast="${broadcast ? '1' : '0'}"><div class="form-grid">${fields}</div>${broadcast ? '<p class="small-note" style="margin-top:10px">This announcement will be sent to all eligible customer accounts.</p>' : ''}<div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Cancel</button><button class="btn btn-primary" id="notification-submit" type="submit">${broadcast ? 'Send announcement' : 'Send notification'}</button></div></form>`;
    A.showDialog(broadcast ? 'Broadcast announcement' : 'Send notification', formHtml);
  }

  document.addEventListener('click', async (event) => {
    if (event.target.closest('#send-notification-button')) {
      event.preventDefault();
      if (!submitting) await sendForm(false);
      return;
    }
    if (event.target.closest('#broadcast-notification-button')) {
      event.preventDefault();
      if (!submitting) await sendForm(true);
      return;
    }

    const readButton = event.target.closest('[data-mark-read]');
    if (readButton) {
      try {
        await A.request(`/notifications/${encodeURIComponent(readButton.dataset.markRead)}/read`, {method:'PUT', body:{}});
        A.notify('Notification marked as read.');
        await refresh();
      } catch (error) {
        A.notify(error.message, 'error');
      }
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!form || form.id !== 'notification-form') return;
    event.preventDefault();
    if (submitting) return;

    submitting = true;
    const submitButton = form.querySelector('#notification-submit');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending…';
    }

    const broadcast = form.dataset.broadcast === '1';
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());

    if (broadcast) {
      // The existing backend router sends notification POSTs to NotificationController::store.
      // The controller's validation explicitly requires broadcast=true when there is no recipient_id.
      body.broadcast = true;
      delete body.recipient_id;
      delete body.event_id;
    } else {
      body.recipient_id = Number(body.recipient_id);
      if (body.event_id) body.event_id = Number(body.event_id);
      else delete body.event_id;
      delete body.broadcast;
    }

    try {
      // Route through the existing POST /notifications endpoint. The JSON flag identifies broadcast mode.
      await A.request('/notifications', {method:'POST', body});
      A.closeDialog();
      A.notify(broadcast ? 'Announcement sent to customers.' : 'Notification sent.');
      await refresh();
    } catch (error) {
      A.notify(error.message, 'error');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = broadcast ? 'Send announcement' : 'Send notification';
      }
    } finally {
      submitting = false;
    }
  });

  refresh();
})();
