import { API_BASE, safeFetch } from './api.js';

// Login form handler
export function setupLoginForm() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const facultyId = document.getElementById("facultyId").value;
    const password = document.getElementById("password").value;
    const msgEl = document.getElementById("loginMsg");
    
    const res = await safeFetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faculty_id: facultyId, password })
    });

    if (res.networkError) {
      msgEl.textContent = `Network error — cannot reach backend at ${API_BASE}.`;
      return;
    }

    if (res.status === 405) {
      msgEl.textContent = `Login failed (405): POST not allowed at ${API_BASE}. ` + 
                          `If your frontend is hosted separately (GitHub Pages), ` +
                          `set window.__API_BASE__ to your backend before loading script.js.`;
      return;
    }

    const data = res.data || {};
    if (res.ok && data.success) {
      localStorage.setItem("user", JSON.stringify(data));
      window.location.href = "dashboard.html";
    } else {
      msgEl.textContent = data?.message || `Login failed (status ${res.status})`;
    }
  });
}

// Logout functionality
export function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = "index.html";
  });
}
