<?php $pageKey='availability'; $pageTitle='Venue availability'; $allowedRoles='admin,organiser'; $pageScript='availability.js'; require __DIR__ . '/../includes/header.php'; ?>
<div class="toolbar"><div class="toolbar-start"><div class="form-field" style="min-width:230px"><label for="availability-venue-filter">Selected venue</label><select id="availability-venue-filter" class="toolbar-input"><option value="">Loading venues…</option></select></div></div><div class="toolbar-end"><button class="btn btn-primary" type="button" id="add-availability-button">＋ Block a date</button></div></div>
<section class="panel calendar-panel">
  <div class="panel-header calendar-header">
    <div><h2>Venue calendar</h2><p>Green means no unavailability record exists. Red means a blocked period, hall reservation, or event may occupy part of the date.</p></div>
    <div class="calendar-controls"><button class="btn btn-muted btn-small" id="calendar-prev" type="button" aria-label="Previous month">‹</button><strong id="calendar-month-label">Month Year</strong><button class="btn btn-muted btn-small" id="calendar-next" type="button" aria-label="Next month">›</button></div>
  </div>
  <div class="calendar-legend"><span><i class="calendar-dot green"></i> Available (no record)</span><span><i class="calendar-dot red"></i> In use (record exists)</span></div>
  <div id="venue-calendar" class="venue-calendar" aria-live="polite"></div>
</section>
<section class="panel"><div class="panel-header"><div><h2>Venue unavailability records</h2><p>Admin blocks and organiser hall reservations for the selected venue.</p></div></div><div class="table-wrap" id="availability-table"><div class="loading-state"><span class="spinner"></span>Loading venue records…</div></div></section>
<?php require __DIR__ . '/../includes/footer.php'; ?>
