// ===== EDIT THESE TWO LINES =====
const CONFIG = {
  API: 'http://localhost/Web-API-Project/event-ticketing-backend/api', // your backend URL
  KEY: 'DSvpeKbVqg789PCAQ6EWONRnsMJUwF2d', // "api_key" from the backend's config/config.php
};
async function api(path, method = 'GET', body) {
  const h = { 'Content-Type': 'application/json', 'X-API-Key': CONFIG.KEY };
  if (localStorage.token) h.Authorization = 'Bearer ' + localStorage.token;
  let r;
  try {
    r = await fetch(CONFIG.API + path, {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (x) {
    throw new Error(
      'Cannot reach the backend. Check that XAMPP is running and CONFIG.API is correct.',
    );
  }
  let j = {};
  try {
    j = await r.json();
  } catch (x) {}
  if (r.status === 401 && path !== '/auth/login') {
    localStorage.clear();
    location = 'index.html';
  }
  if (!r.ok) {
    const er = j.errors ? Object.values(j.errors).flat().join(', ') : '';
    throw new Error((j.message || 'Request failed (' + r.status + ')') + (er ? ': ' + er : ''));
  }
  return j;
}
// Tolerant readers: work whether the backend wraps data as {data:[...]} or {data:{events:[...]}}
const rows = (j) => {
  const d = j.data !== undefined ? j.data : j;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  return [];
};
const meta = (j) => j.pagination || j.meta || (j.data && (j.data.pagination || j.data.meta)) || {};
