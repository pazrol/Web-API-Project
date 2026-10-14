(() => {
  'use strict';
  const API = window.Ticket4uAPI;
  const $ = (selector) => document.querySelector(selector);
  const alertBox = $('#auth-alert');
  function showMessage(message, success = false) {
    if (!alertBox) return;
    alertBox.hidden = false;
    alertBox.classList.toggle('success', success);
    alertBox.textContent = message;
  }
  function responseUser(payload) {
    const data = API.dataOf(payload) || {};
    return data.user || data.account || null;
  }
  function responseToken(payload) {
    const data = API.dataOf(payload) || {};
    return data.token || data.access_token || '';
  }
  async function login(email, password) {
    const payload = await API.request('/auth/login', {method:'POST',auth:false,body:{email,password}});
    const jwt = responseToken(payload);
    const user = responseUser(payload);
    if (!jwt) throw new Error('Login succeeded without a token in the response. Check the backend login response.');
    API.storeSession(jwt, user || {});
    return user;
  }
  if (window.location.pathname.toLowerCase().endsWith('/login.php') && API.token()) {
    window.location.replace('dashboard.php');
    return;
  }
  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = loginForm.querySelector('button[type="submit"]');
      const fd = new FormData(loginForm);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      button.disabled = true;
      button.textContent = 'Signing in…';
      if (alertBox) alertBox.hidden = true;
      try {
        await login(email, password);
        window.location.href = 'dashboard.php';
      } catch (error) {
        showMessage(error.message || 'Could not sign in. Check your details and try again.');
        button.disabled = false;
        button.innerHTML = 'Sign in <span>→</span>';
      }
    });
  }
  const registerForm = $('#register-form');
  const roleSelect = $('#role');
  const referenceField = $('#reference-field');
  const referenceInput = $('#reference-key');
  function syncReferenceField() {
    const needsKey = roleSelect && roleSelect.value === 'admin';
    if (referenceField) referenceField.hidden = !needsKey;
    if (referenceInput) referenceInput.required = Boolean(needsKey);
  }
  if (roleSelect) { roleSelect.addEventListener('change', syncReferenceField); syncReferenceField(); }
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(registerForm);
      const name = String(fd.get('name') || '').trim();
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      const confirmPassword = String(fd.get('confirm_password') || '');
      const role = String(fd.get('role') || 'customer');
      const referenceKey = String(fd.get('reference_key') || '');
      if (password.length < 8) return showMessage('Use a password with at least 8 characters.');
      if (password !== confirmPassword) return showMessage('The two passwords do not match.');
      if (role === 'admin' && !referenceKey.trim()) return showMessage('Enter the Admin reference key.');
      const button = registerForm.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Creating account…';
      if (alertBox) alertBox.hidden = true;
      try {
        await API.request('/auth/register', {method:'POST',auth:false,body:{name,email,password,role,reference_key:referenceKey}});
        // Registration response does not have to return a token. Sign in with the new account.
        await login(email, password);
        showMessage('Your account is ready. Opening your workspace…', true);
        window.location.href = 'dashboard.php';
      } catch (error) {
        showMessage(error.message || 'Registration failed. Check the backend route and try again.');
        button.disabled = false;
        button.innerHTML = 'Create account <span>→</span>';
      }
    });
  }
})();
