<?php $pageKey='notifications'; $pageTitle='Notifications'; $allowedRoles='admin,organiser,customer'; $pageScript='notifications.js'; require __DIR__ . '/../includes/header.php'; ?>
<div class="toolbar"><div><div class="small-note">Your inbox for event, booking and payment updates.</div></div><div class="toolbar-end" id="notification-actions"></div></div>
<div id="notifications-list"><div class="loading-state"><span class="spinner"></span>Loading notifications…</div></div>
<?php require __DIR__ . '/../includes/footer.php'; ?>
