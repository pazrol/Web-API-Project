// ============================================================
// payments.js
// Payments list (role-scoped by the API) + the "pay now" modal
// used from bookings.js, + refund action for admin/organiser.
// ============================================================

let paymentsPage = 1;
let paymentsStatusFilter = "";

async function renderPayments() {
  const toolbar = document.getElementById("payments-toolbar");
  toolbar.innerHTML = `
    <select id="payment-status-filter">
      <option value="">All statuses</option>
      <option value="pending">Pending</option>
      <option value="paid">Paid</option>
      <option value="failed">Failed</option>
      <option value="refund_pending">Refund pending</option>
      <option value="refunded">Refunded</option>
    </select>
  `;
  document.getElementById("payment-status-filter").value = paymentsStatusFilter;
  document.getElementById("payment-status-filter").addEventListener("change", (e) => {
    paymentsStatusFilter = e.target.value;
    paymentsPage = 1;
    loadPaymentsList();
  });

  loadPaymentsList();
}

async function loadPaymentsList() {
  const user = getCurrentUser();
  const container = document.getElementById("payments-list");
  container.innerHTML = '<div class="loading-text">Loading payments...</div>';

  const result = await apiGet(
    "/payments" + buildQuery({ status: paymentsStatusFilter, page: paymentsPage, per_page: 10 })
  );

  if (!result.ok) {
    container.innerHTML = '<div class="empty-state">Could not load payments.</div>';
    toastApiError(result);
    return;
  }

  const payments = result.data.items || [];
  if (payments.length === 0) {
    container.innerHTML = '<div class="empty-state">No payments found.</div>';
  } else {
    container.innerHTML = payments.map((p) => paymentRowHtml(p, user)).join("");
    payments.forEach((p) => {
      const refundBtn = container.querySelector(`[data-refund="${p.id}"]`);
      if (refundBtn) refundBtn.addEventListener("click", () => refundPayment(p.id));
    });
  }

  renderPagination(document.getElementById("payments-pagination"), result.data.pagination, (page) => {
    paymentsPage = page;
    loadPaymentsList();
  });
}

function paymentRowHtml(p, user) {
  const canRefund =
    (user.role === "admin" || user.role === "organiser") &&
    ["paid", "refund_pending"].includes(p.payment_status);

  return `
    <div class="agenda-row">
      <div class="agenda-time">${p.payment_reference}</div>
      <div class="agenda-body">
        <div class="tag-row">
          <span class="status-pill status-${p.payment_status}">${p.payment_status === "refunded" ? "Refunded" : escapeHtml((p.payment_status || "unknown").replaceAll("_", " "))}</span>
        </div>
        <div class="agenda-title">${escapeHtml(p.event_title)} (${p.booking_code})</div>
        <div class="agenda-meta">
          <span class="price">${formatMoney(p.amount)}</span> &middot;
          ${escapeHtml((p.payment_method || "").replace("_", " "))} &middot;
          ${p.payment_status === "refunded"
            ? "refunded" + (p.refunded_at ? " " + formatDateTime(p.refunded_at) : "")
            : p.paid_at
              ? "paid " + formatDateTime(p.paid_at)
              : "not paid yet"}
        </div>
      </div>
      <div class="row-actions">
        ${canRefund ? `<button class="btn small secondary" data-refund="${p.id}">Refund</button>` : ""}
      </div>
    </div>`;
}

async function refundPayment(id) {
  if (!confirm("Refund this payment? The related booking must already be cancelled.")) return;
  const result = await apiPost("/payments/" + id + "/refund", {});
  if (result.ok) {
    toast("Payment refunded.");
    loadPaymentsList();
  } else {
    toastApiError(result);
  }
}

// ---------------------------------------------------------------
// "Pay now" modal, opened from bookings.js
// ---------------------------------------------------------------

function openPaymentModal(booking) {
  openModal(`
    <h3>Pay for ${escapeHtml(booking.booking_code)}</h3>
    <p class="field-hint">${escapeHtml(booking.event_title)} &middot; <span class="price">${formatMoney(booking.total_amount)}</span></p>
    <form id="payment-form">
      <label for="pay_method">Payment method</label>
      <select id="pay_method" required>
        <option value="credit_card">Credit card</option>
        <option value="debit_card">Debit card</option>
        <option value="online_banking">Online banking</option>
        <option value="e_wallet">E-wallet</option>
      </select>
      <div class="field-hint">This is a simulated payment - no real card details are needed.</div>

      <div class="form-actions">
        <button type="button" class="btn secondary" id="payment-cancel-btn">Cancel</button>
        <button type="submit" class="btn">Pay now</button>
      </div>
    </form>
  `);

  document.getElementById("payment-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("payment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payment_method = document.getElementById("pay_method").value;

    const result = await apiPost("/payments", { booking_id: booking.id, payment_method });
    if (result.ok) {
      toast("Payment successful. Booking confirmed.");
      closeModal();
      if (currentSection === "bookings") loadBookingsList();
    } else {
      toastApiError(result);
    }
  });
}
