<?php $pageKey='venues'; $pageTitle='Venues'; $allowedRoles='admin,organiser'; $pageScript='venues.js'; require __DIR__ . '/../includes/header.php'; ?>
<div class="toolbar"><div><div class="small-note">Browse venue details. Admins manage venues; Organisers can reserve a hall.</div></div><div class="toolbar-end"><input class="toolbar-input" type="search" id="venue-search" placeholder="Search venues…"><button class="btn btn-primary" type="button" id="add-venue-button" data-roles="admin">＋ Add venue</button></div></div>
<section class="panel"><div class="table-wrap" id="venues-table"><div class="loading-state"><span class="spinner"></span>Loading venues…</div></div></section>
<?php require __DIR__ . '/../includes/footer.php'; ?>
