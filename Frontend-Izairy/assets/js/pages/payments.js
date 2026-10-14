(() => {
  'use strict';
  const A=window.Ticket4uAPI,$=s=>document.querySelector(s);
  let payments=[],bookings=[];
  const pid=p=>A.itemId(p,['id','payment_id']);
  const bid=b=>A.itemId(b,['id','booking_id']);
  const cleanStatus=s=>String(s||'').toLowerCase().replaceAll('_',' ').trim();
  async function refresh(){
    $('#payments-table').innerHTML='<div class="loading-state"><span class="spinner"></span>Loading payment records…</div>';
    try{
      const results=await Promise.allSettled([A.request('/payments?page=1&per_page=100'),A.request('/bookings?page=1&per_page=100')]);
      if(results[0].status==='rejected'){
        throw new Error('The API payment list could not be loaded. It must support GET /payments?page=1&per_page=100. Details: '+results[0].reason.message);
      }
      payments=A.listOf(results[0].value);
      bookings=results[1].status==='fulfilled'?A.listOf(results[1].value):[];
      render();
    }catch(e){A.showLoadError('#payments-table',e.message);A.setNotice('Payment IDs and actions require the payments-list endpoint. See BACKEND-CHANGES-REQUIRED.md included in the package.','error');}
  }
  function relatedBooking(payment){
    return bookings.find(b=>String(bid(b))===String(payment.booking_id ?? (payment.booking&&payment.booking.id) ?? ''))||{};
  }
  function render(){
    $('#payments-table').innerHTML=payments.length?`<table><thead><tr><th>Payment ID</th><th>Booking / customer</th><th>Event</th><th>Amount</th><th>Method</th><th>Payment status</th><th>Actions</th></tr></thead><tbody>${payments.map(p=>{
      const id=pid(p),b=relatedBooking(p),status=cleanStatus(p.status||p.payment_status),roleCanRefund=A.isAdmin()||A.isOrganiser();
      const canRefund=roleCanRefund && id && ['refund pending','refund requested','pending refund'].includes(status);
      const bookingCode=p.booking_code||b.booking_code||b.code||`Booking #${p.booking_id||bid(b)||'—'}`;
      const event=p.event_title||p.title||A.bookingEventTitle(b);
      const amount=p.amount??p.total_amount??b.total_amount??b.total_price??0;
      const action=`${id?`<button class="btn btn-muted btn-small" data-view-payment="${A.escapeHtml(id)}">Details</button>`:''}${canRefund?`<button class="btn btn-danger btn-small" data-refund-payment="${A.escapeHtml(id)}">Process refund</button>`:''}`;
      return `<tr><td><span class="table-primary">#${A.escapeHtml(id||'—')}</span><span class="table-sub">${A.escapeHtml(p.transaction_reference||p.transaction_id||'Transaction details')}</span></td><td><span class="table-primary">${A.escapeHtml(bookingCode)}</span><span class="table-sub">Booking ID: ${A.escapeHtml(p.booking_id||bid(b)||'—')}</span></td><td>${A.escapeHtml(event)}</td><td>${A.fmtMoney(amount)}</td><td>${A.escapeHtml(String(p.payment_method||'—').replaceAll('_',' '))}</td><td>${A.badge(status||'unknown')}</td><td><div class="table-actions">${action}</div></td></tr>`;
    }).join('')}</tbody></table>`:`<div class="empty-state"><div class="empty-icon">↗</div><strong>No payment records found</strong><p>Payment IDs and transaction actions will appear here after customers pay for bookings.</p></div>`;
  }
  function renderDetails(item){
    const d=A.dataOf(item)||{};const p=d.payment||d;
    const fields=[['Payment ID',p.id||p.payment_id||'—'],['Booking ID',p.booking_id||'—'],['Amount',A.fmtMoney(p.amount||p.total_amount)],['Payment method',String(p.payment_method||'—').replaceAll('_',' ')],['Status',p.status||p.payment_status||'—'],['Transaction reference',p.transaction_reference||p.transaction_id||'—'],['Created',A.fmtDate(p.created_at,true)]];
    return `<section class="panel"><div class="panel-header"><div><h2>Payment details</h2><p>Transaction information returned by the API.</p></div><button class="btn btn-muted btn-small" type="button" data-close-payment-details>Close</button></div><div class="details-grid">${fields.map(([k,v])=>`<div class="detail-item"><small>${A.escapeHtml(k)}</small><strong>${A.escapeHtml(v)}</strong></div>`).join('')}</div></section>`;
  }
  async function lookup(id){
    if(!id||Number(id)<1)return A.notify('Payment ID is not valid.','error');
    $('#payment-lookup-result').innerHTML='<div class="loading-state"><span class="spinner"></span>Looking up payment…</div>';
    try{const p=await A.request(`/payments/${encodeURIComponent(id)}`);$('#payment-lookup-result').innerHTML=renderDetails(p);}
    catch(e){$('#payment-lookup-result').innerHTML=`<div class="notice error">${A.escapeHtml(e.message)}</div>`;}
  }
  $('#payment-lookup-form').addEventListener('submit',e=>{e.preventDefault();lookup($('#payment-id-input').value);});
  document.addEventListener('click',async e=>{
    const view=e.target.closest('[data-view-payment]');if(view){$('#payment-id-input').value=view.dataset.viewPayment;lookup(view.dataset.viewPayment);window.scrollTo({top:0,behavior:'smooth'});}
    if(e.target.closest('[data-close-payment-details]'))$('#payment-lookup-result').innerHTML='';
    const refund=e.target.closest('[data-refund-payment]');if(refund&&window.confirm('Process the refund for this cancelled booking?')){
      try{await A.request(`/payments/${encodeURIComponent(refund.dataset.refundPayment)}/refund`,{method:'POST',body:{}});A.notify('Refund processed successfully.');await refresh();}
      catch(err){A.notify(err.message,'error');}
    }
  });
  refresh();
})();
