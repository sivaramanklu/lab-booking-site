// API base selection
export const API_BASE = (function() {
  if (typeof window.__API_BASE__ !== 'undefined') {
    if (window.__API_BASE__ === null) {
      return `${window.location.protocol}//${window.location.host}`;
    }
    if (typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim() !== '') {
      return window.__API_BASE__.trim();
    }
  }
  return 'http://127.0.0.1:5000';
})();

console.log("API_BASE =", API_BASE);

// Safe fetch wrapper
export async function safeFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    let data = null;
    try { 
      data = await res.json(); 
    } catch (e) { /* Ignore non-JSON responses */ }
    return { ok: res.ok, status: res.status, data, res };
  } catch (err) {
    return { ok: false, networkError: true, error: err };
  }
}
