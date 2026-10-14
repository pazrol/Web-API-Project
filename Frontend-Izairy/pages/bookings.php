<?php $pageKey='bookings'; $pageTitle='Bookings'; $allowedRoles='admin,organiser,customer'; $pageScript='bookings.js'; require __DIR__ . '/../includes/header.php'; ?>
<div class="toolbar"><div><div class="small-note" id="bookings-explainer">Bookings visible to your account.</div></div><div class="toolbar-end" id="bookings-actions"></div></div>
<section class="panel"><div class="panel-header"><div><h2 id="bookings-heading">Booking records</h2><p>Booking details and status are returned by the shared API.</p></div><span id="booking-total" class="badge purple">—</span></div><div class="table-wrap" id="bookings-table"><div class="loading-state"><span class="spinner"></span>Loading bookings…</div></div></section>
<?php require __DIR__ . '/../includes/footer.php'; ?>
