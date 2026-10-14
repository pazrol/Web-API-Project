<?php require_once __DIR__ . '/../includes/config.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#b6a4d9">
  <title>Sign in · Ticket4u - Event Ticketing System</title>
  <link rel="stylesheet" href="../assets/css/styles.css?v=20261013-ticket-print-fix2">
</head>
<body class="auth-body">
<script>window.APP_CONFIG = { apiBaseUrl: <?= json_encode($apiBaseUrl, JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT) ?> };</script>
<main class="auth-layout">
  <section class="auth-main">
    <div class="auth-card">
      <a class="auth-brand" href="login.php"><span class="brand-symbol">T4</span><span><b>Ticket4u</b><small>Event Ticketing System</small></span></a>
      <div class="auth-heading"><h1>Welcome back</h1><p class="muted">Sign in to manage your events and bookings.</p></div>
      <div class="auth-alert" id="auth-alert" role="alert" hidden></div>
      <form id="login-form" class="form-stack">
        <div class="field"><label for="email">Email address</label><input type="email" name="email" id="email" placeholder="name@example.com" autocomplete="email" required></div>
        <div class="field"><label for="password">Password</label><input type="password" name="password" id="password" placeholder="Enter your password" autocomplete="current-password" required></div>
        <button class="btn btn-primary btn-full" type="submit">Sign in</button>
      </form>
      <p class="auth-switch">Don't have an account? <a href="register.php">Register</a></p>
    </div>
  </section>
</main>
<div class="toast-region" id="toast-region" aria-live="polite"></div>
<script src="../assets/js/api.js?v=20261013-ticket-print-fix2"></script><script src="../assets/js/auth.js?v=20261013-ticket-print-fix2"></script>
</body>
</html>
