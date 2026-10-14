// ============================================================
// auth.js
// Everything about logging in/out and remembering who is
// currently logged in. Session is stored in localStorage so it
// survives a page refresh (JWTs expire in 1 hour on the backend
// by default, so the user will need to log in again after that).
// ============================================================

const AUTH_TOKEN_KEY = "etb_token";
const AUTH_USER_KEY = "etb_user";

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getCurrentUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function isLoggedIn() {
  return !!getToken() && !!getCurrentUser();
}

function saveSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

/**
 * Calls POST /auth/login and, on success, stores the token + user.
 * Returns the same {ok, data, message, errors} shape as apiFetch.
 */
async function login(email, password) {
  const result = await apiPost("/auth/login", { email, password }, { auth: false });
  if (result.ok) {
    saveSession(result.data.token, result.data.user);
  }
  return result;
}

function logout() {
  clearSession();
  window.location.href = "index.html";
}

/**
 * Called at the top of dashboard.html. If there is no session,
 * bounce back to the login page.
 */
function requireLogin() {
  if (!isLoggedIn()) {
    window.location.href = "index.html";
  }
}

/**
 * Called at the top of index.html. If already logged in, skip
 * straight to the dashboard instead of showing the login form again.
 */
function redirectIfLoggedIn() {
  if (isLoggedIn()) {
    window.location.href = "dashboard.html";
  }
}
