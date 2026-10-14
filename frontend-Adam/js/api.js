// ============================================================
// api.js
// One place that knows how to talk to the PHP backend.
// Every other JS file calls apiFetch() instead of using fetch()
// directly, so auth headers and error handling stay consistent.
// ============================================================

// ---- EDIT THESE TWO LINES FOR YOUR OWN XAMPP SETUP ----------
// Point this at wherever the backend folder lives on your machine.
// This must match the folder path under htdocs exactly, including
// any parent folder (e.g. if the backend lives at
// htdocs/Web-API-Project/event-ticketing-backend, then the URL is
// http://localhost/Web-API-Project/event-ticketing-backend/api).
const API_BASE = "http://localhost/Web-API-Project/event-ticketing-backend/api";

// This must match config/config.php -> app.api_key on the backend
// you are pointing at. The value below is the default that ships
// in the backend's config file. If a teammate changed it on their
// XAMPP install, they need to change it here too.
const API_KEY = "DSvpeKbVqg789PCAQ6EWONRnsMJUwF2d";
// ---------------------------------------------------------------

/**
 * Low level fetch wrapper.
 *
 * @param {string} path   e.g. "/events" or "/bookings/5"
 * @param {object} opts
 *   method: "GET" | "POST" | "PUT" | "DELETE" (default GET)
 *   body:   plain JS object, will be JSON.stringify'd
 *   auth:   true (default) sends the Authorization: Bearer header
 *   extraHeaders: object of extra headers (used for the QR endpoint's X-API-Key)
 *
 * @returns {Promise<{ok: boolean, status: number, data: any, message: string, errors: any}>}
 *   "data" is the value of the response's "data" field (or null).
 *   On failure, "message"/"errors" come straight from the API's
 *   error JSON so the caller can show them to the user.
 */
async function apiFetch(path, opts = {}) {
  const method = opts.method || "GET";
  const auth = opts.auth !== false; // default true

  const headers = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
  }

  if (opts.extraHeaders) {
    Object.assign(headers, opts.extraHeaders);
  }

  const fetchOpts = {
    method,
    headers,
  };

  if (opts.body !== undefined) {
    fetchOpts.body = JSON.stringify(opts.body);
  }

  let response;
  try {
    response = await fetch(API_BASE + path, fetchOpts);
  } catch (err) {
    // Network error - backend not reachable, wrong URL, CORS, etc.
    return {
      ok: false,
      status: 0,
      data: null,
      message: "Could not reach the backend. Check that XAMPP is running and API_BASE in js/api.js is correct.",
      errors: null,
    };
  }

  let json = null;
  try {
    json = await response.json();
  } catch (err) {
    // Empty or non-JSON response body.
    json = null;
  }

  if (!response.ok || !json || json.success === false) {
    return {
      ok: false,
      status: response.status,
      data: null,
      message: (json && json.message) || ("Request failed with status " + response.status),
      errors: json ? json.errors : null,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: json.data !== undefined ? json.data : null,
    message: json.message || null,
    errors: null,
  };
}

// Shortcut helpers so call sites read nicely, e.g. apiGet("/events")
function apiGet(path, opts = {}) {
  return apiFetch(path, { ...opts, method: "GET" });
}
function apiPost(path, body, opts = {}) {
  return apiFetch(path, { ...opts, method: "POST", body });
}
function apiPut(path, body, opts = {}) {
  return apiFetch(path, { ...opts, method: "PUT", body });
}
function apiDelete(path, opts = {}) {
  return apiFetch(path, { ...opts, method: "DELETE" });
}

/**
 * Turns an object of query params into a "?a=1&b=2" string,
 * skipping empty/undefined/null values. Used for list filters.
 */
function buildQuery(params) {
  const parts = [];
  for (const key in params) {
    const value = params[key];
    if (value === undefined || value === null || value === "") continue;
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
  }
  return parts.length ? "?" + parts.join("&") : "";
}
