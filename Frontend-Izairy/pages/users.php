<?php $pageKey='users'; $pageTitle='User management'; $allowedRoles='admin'; $pageScript='users.js'; require __DIR__ . '/../includes/header.php'; ?>
<div class="toolbar"><div><div class="small-note">Review registered accounts and manage their role assignments.</div></div><div class="toolbar-end"><input class="toolbar-input" id="user-search" type="search" placeholder="Search users…"><button class="btn btn-primary" id="add-user-button" type="button">＋ Add user</button></div></div>
<section class="panel"><div class="table-wrap" id="users-table"><div class="loading-state"><span class="spinner"></span>Loading users…</div></div></section>
<?php require __DIR__ . '/../includes/footer.php'; ?>
