<?php
require_once __DIR__ . '/config.php';
$pageKey = $pageKey ?? 'dashboard';
$pageTitle = $pageTitle ?? 'Overview';
$allowedRoles = $allowedRoles ?? 'admin,organiser,customer';
function e($value): string { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
$navItems = [
  ['id'=>'events','label'=>'Events','href'=>'events.php','roles'=>'admin,organiser,customer','icon'=>'◷'],
  ['id'=>'bookings','label'=>'Bookings','href'=>'bookings.php','roles'=>'admin,organiser,customer','icon'=>'▣'],
  ['id'=>'payments','label'=>'Payments','href'=>'payments.php','roles'=>'admin,organiser,customer','icon'=>'↗'],
  ['id'=>'notifications','label'=>'Notifications','href'=>'notifications.php','roles'=>'admin,organiser,customer','icon'=>'♧'],
  ['id'=>'venues','label'=>'Venues','href'=>'venues.php','roles'=>'admin,organiser','icon'=>'⌂'],
  ['id'=>'availability','label'=>'Venue availability','href'=>'availability.php','roles'=>'admin,organiser','icon'=>'▤'],
  ['id'=>'users','label'=>'Users','href'=>'users.php','roles'=>'admin','icon'=>'♙'],
  ['id'=>'dashboard','label'=>'Overview','href'=>'dashboard.php','roles'=>'admin,organiser,customer','icon'=>'▦'],
];
// Put Overview first while keeping menu labels concise.
$navItems = array_merge([$navItems[count($navItems)-1]], array_slice($navItems, 0, count($navItems)-1));
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#b6a4d9">
  <title><?= e($pageTitle) ?> · Ticket4u - Event Ticketing System</title>
  <link rel="stylesheet" href="../assets/css/styles.css?v=20261013-ticket-print-fix2">
</head>
<body class="app-body" data-requires-auth="true" data-page="<?= e($pageKey) ?>" data-allowed-roles="<?= e($allowedRoles) ?>">
<script>window.APP_CONFIG = { apiBaseUrl: <?= json_encode($apiBaseUrl, JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT) ?> };</script>
<div class="app-shell">
  <header class="site-header">
    <div class="site-header-row">
      <a class="brand" href="dashboard.php"><span class="brand-symbol">T4</span><span><b>Ticket4u</b><small>Event Ticketing System</small></span></a>
      <div class="site-account">
        <div class="avatar" data-user-initials>U</div>
        <div class="site-account-text"><b data-user-name>Account</b><small data-user-role></small></div>
        <button class="btn btn-muted btn-small" type="button" data-logout>Log out</button>
      </div>
    </div>
    <nav class="app-nav" aria-label="Main navigation">
      <?php foreach ($navItems as $item): ?>
        <a class="nav-link <?= $pageKey === $item['id'] ? 'active' : '' ?>" href="<?= e($item['href']) ?>" data-roles="<?= e($item['roles']) ?>"><span class="nav-icon"><?= e($item['icon']) ?></span><span><?= e($item['label']) ?></span></a>
      <?php endforeach; ?>
    </nav>
  </header>
  <main class="main-area">
    <div class="page-container">
      <section class="page-heading"><div><div class="eyebrow">EVENT TICKETING &amp; VENUE BOOKING</div><h1><?= e($pageTitle) ?></h1><p class="page-subtitle" id="page-subtitle"></p></div><div class="page-actions" id="page-actions"></div></section>
      <div class="notice-area" id="notice-area" aria-live="polite"></div>
      <div class="page-content" id="page-content">
