<?php require_once __DIR__ . '/../includes/config.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#b6a4d9">
  <title>Create account · Ticket4u - Event Ticketing System</title>
  <link rel="stylesheet" href="../assets/css/styles.css?v=20261013-ticket-print-fix2">
</head>
<body class="auth-body">
<script>window.APP_CONFIG = { apiBaseUrl: <?= json_encode($apiBaseUrl, JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT) ?> };</script>
<main class="auth-layout auth-register-layout">
  <section class="auth-main">
    <div class="auth-card register-card">
      <a class="auth-brand" href="login.php"><span class="brand-symbol">T4</span><span><b>Ticket4u</b><small>Event Ticketing System</small></span></a>
      <div class="auth-heading"><h1>Create your account</h1><p class="muted">Enter your details to get started.</p></div>
      <div class="auth-alert" id="auth-alert" role="alert" hidden></div>
      <form id="register-form" class="form-stack">
        <div class="field"><label for="name">Full name</label><input type="text" name="name" id="name" placeholder="Your full name" autocomplete="name" maxlength="120" required></div>
        <div class="field"><label for="email">Email address</label><input type="email" name="email" id="email" placeholder="name@example.com" autocomplete="email" required></div>
        <div class="form-grid form-grid-auth"><div class="field"><label for="password">Password</label><input type="password" name="password" id="password" placeholder="At least 8 characters" minlength="8" autocomplete="new-password" required></div>
        <div class="field"><label for="confirm-password">Confirm password</label><input type="password" name="confirm_password" id="confirm-password" placeholder="Repeat password" minlength="8" autocomplete="new-password" required></div></div>
        <div class="field"><label for="role">Account role</label><select name="role" id="role" required><option value="customer" selected>Customer</option><option value="organiser">Organiser</option><option value="admin">Admin</option></select><small class="field-help">Admin registration requires an authorised reference key.</small></div>
        <div class="field" id="reference-field" hidden><label for="reference-key">Admin reference key</label><input type="password" name="reference_key" id="reference-key" autocomplete="off" placeholder="Enter your authorised key"><small class="field-help">Required when the Admin role is selected. The backend checks this key.</small></div>
        <button class="btn btn-primary btn-full" type="submit">Create account</button>
      </form>
      <p class="auth-switch">Already registered? <a href="login.php">Sign in</a></p>
    </div>
  </section>
</main>
<div class="toast-region" id="toast-region" aria-live="polite"></div>
<script src="../assets/js/api.js?v=20261013-ticket-print-fix2"></script><script src="../assets/js/auth.js?v=20261013-ticket-print-fix2"></script>
</body>
</html>
