// ===== Full script.js =====

// ====== Shared state ======
const user = JSON.parse(localStorage.getItem("user") || "null");

/*
 API base selection priority:
 1) If window.__API_BASE__ is defined (non-empty string) -> use it.
 2) If window.__API_BASE__ === null -> use same origin.
 3) Otherwise default to http://127.0.0.1:5000 (local dev safe default).
*/
const API_BASE = (function(){
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

// ===== safeFetch helper - returns object with ok,status,data,networkError =====
async function safeFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-json possible */ }
    return { ok: res.ok, status: res.status, data, res };
  } catch (err) {
    return { ok: false, networkError: true, error: err };
  }
}

// ===== small helpers =====
function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// reload lab dropdown if present
async function reloadLabSelectIfPresent() {
  try {
    const sel = document.getElementById('labSelect');
    if (!sel) return;
    const r = await safeFetch(`${API_BASE}/api/labs`);
    if (r.networkError) {
      sel.innerHTML = `<option value="">(Cannot reach backend)</option>`;
      return;
    }
    if (!r.ok) {
      sel.innerHTML = `<option value="">(Failed to load labs)</option>`;
      return;
    }
    const labs = r.data || [];
    sel.innerHTML = labs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    if (sel.options.length > 0) {
      const prev = sel.value;
      if (prev && [...sel.options].some(o=>o.value === prev)) {
        sel.value = prev;
      } else {
        sel.value = sel.options[0].value;
      }
      sel.dispatchEvent(new Event('change'));
    }
  } catch (e) {
    console.error(e);
  }
}

// ====================== LOGIN ======================
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async function(e){
    e.preventDefault();
    const facultyId = document.getElementById("facultyId").value;
    const password = document.getElementById("password").value;
    const res = await safeFetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faculty_id: facultyId, password })
    });
    if (res.networkError) {
      document.getElementById("loginMsg").textContent = `Network error — cannot reach backend at ${API_BASE}.`;
      return;
    }
    // helpful message for static host 405 case
    if (res.status === 405) {
      document.getElementById("loginMsg").textContent =
        `Login failed (405): POST not allowed at ${API_BASE}. If your frontend is hosted separately (GitHub Pages), set window.__API_BASE__ to your backend before loading script.js.`;
      return;
    }
    const data = res.data || {};
    if (res.ok && data.success) {
      localStorage.setItem("user", JSON.stringify(data));
      window.location.href = "dashboard.html";
    } else {
      document.getElementById("loginMsg").textContent = (data && data.message) ? data.message : `Login failed (status ${res.status})`;
    }
  });
}

// ====================== DASHBOARD ======================
const labSelect = document.getElementById("labSelect");
const timetableDiv = document.getElementById("timetable");

if (labSelect && timetableDiv) {
  // Insert admin link if admin
  if (user && user.is_admin) {
    const anc = document.createElement('a');
    anc.href = "admin.html";
    anc.textContent = "Admin Panel";
    anc.style.margin = "6px";
    const container = document.querySelector('.container');
    if (container) container.insertBefore(anc, container.firstChild.nextSibling);
  }

  // Ensure modern logout button exists
  (function ensureLogout() {
    if (!document.getElementById('logoutBtn')) {
      const btn = document.createElement('button');
      btn.id = 'logoutBtn';
      btn.className = 'btn-logout';
      btn.textContent = 'Logout';
      const container = document.querySelector('.container');
      if (container) container.insertBefore(btn, container.firstChild);
    }
    const lb = document.getElementById('logoutBtn');
    if (lb) lb.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = "index.html";
    });
  })();

  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const periods = ["09:00-09:50","10:00-10:50","11:00-11:50","12:00-12:50","01:00-01:50","02:00-02:50","03:00-03:50","04:00-04:50"];

  labSelect.addEventListener('change', () => {
    if (labSelect.value) loadTimetable(labSelect.value);
  });

  (async function initDash(){
    await reloadLabSelectIfPresent();
    if (labSelect.options.length) loadTimetable(labSelect.value);
  })();

  async function loadTimetable(labId) {
    timetableDiv.innerHTML = "Loading...";
    const r = await safeFetch(`${API_BASE}/api/timetable/${labId}`);
    if (r.networkError) {
      timetableDiv.innerHTML = `<div style="color:#b91c1c">Cannot reach backend at ${API_BASE}.</div>`;
      return;
    }
    if (!r.ok) {
      timetableDiv.innerHTML = `<div style="color:#b91c1c">Failed to load timetable (status ${r.status}).</div>`;
      return;
    }
    const slots = r.data || [];
    timetableDiv.innerHTML = generateTable(slots);
  }

  function generateTable(slots) {
    // map day->date for header
    const dateByDay = {};
    for (const s of slots) if (!dateByDay[s.day]) dateByDay[s.day] = s.date;

    let html = `<table class="timetable-table"><tr><th>Day<br/><small>Date</small></th>`;
    periods.forEach(p => html += `<th>${p}</th>`);
    html += `</tr>`;

    days.forEach(day => {
      const dayDateIso = dateByDay[day] || '';
      html += `<tr><td><strong>${day}</strong><br/><small>${formatDate(dayDateIso)}</small></td>`;
      for (let period = 1; period <= 8; period++) {
        const slot = slots.find(s => s.day === day && s.period === period);
        if (!slot) {
          html += `<td></td>`;
          continue;
        }

        let cellText = slot.status;
        let cellClass = '';

        if (slot.status === "Regular") {
          cellText = `${slot.class_info || ""}`;
          cellClass = 'regular';
        } else if (slot.status === "Booked") {
          cellText = slot.faculty_name ? `Booked by ${slot.faculty_name}<br/>(${slot.class_info || "N/A"})` : `Booked${slot.class_info ? `<br/>(${slot.class_info})` : ''}`;
          cellClass = 'booked';
        } else {
          cellText = "Free";
          cellClass = 'free';
        }

        const canClick = (slot.status === "Free") || (slot.status === "Booked" && (String(slot.faculty_id) === String(user && user.user_id) || (user && user.is_admin)));
        const canRightClick = user && user.is_admin && slot.status !== "Booked";
        const dateParam = slot.date || '';
        const safeStatus = (slot.status || '').replace(/'/g, "\\'");
        html += `<td class="${cellClass}" style="cursor:${canClick ? 'pointer' : 'default'}"
                    ${canClick ? `onclick="handleClick(${slot.id}, '${safeStatus}', '${dateParam.replace(/'/g,"\\'")}')"` : ''}
                    ${canRightClick ? `oncontextmenu="handleRightClick(event, ${slot.id}, '${safeStatus}')"` : ''}>
                  ${cellText}
                 </td>`;
      }
      html += `</tr>`;
    });

    html += `</table>`;
    return html;
  }
}

// ================ Booking & Release ================
async function handleClick(slotId, status, dateIso) {
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  if (!currentUser) { alert("Not logged in"); return; }
  if (!dateIso) { alert("Date not available for this slot."); return; }

  if (status === "Free") {
    const classInfo = prompt("Enter class info (e.g., 2nd Year A):");
    if (!classInfo) return;
    const r = await safeFetch(`${API_BASE}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: currentUser.user_id, class_info: classInfo })
    });
    if (r.networkError) { alert(`Network error — cannot reach backend at ${API_BASE}.`); return; }
    if (r.ok && r.data && r.data.success) {
      await reloadLabSelectIfPresent();
    } else {
      alert((r.data && r.data.message) ? r.data.message : `Booking failed (status ${r.status})`);
    }
  } else if (status === "Booked") {
    if (!confirm("Release this booking?")) return;
    const r = await safeFetch(`${API_BASE}/api/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: currentUser.user_id, is_admin: currentUser.is_admin })
    });
    if (r.networkError) { alert(`Network error — cannot reach backend at ${API_BASE}.`); return; }
    if (r.ok && r.data && r.data.success) {
      const currentLab = document.getElementById('labSelect')?.value;
      await reloadLabSelectIfPresent();
      if (currentLab) {
       document.getElementById('labSelect').value = currentLab;
       document.getElementById('labSelect').dispatchEvent(new Event('change'));
      }

    } else {
      alert((r.data && r.data.message) ? r.data.message : `Release failed (status ${r.status})`);
    }
  }
}

// ================ Admin Right-click (block/unblock Regular) ================
async function handleRightClick(e, slotId, currentStatus) {
  e.preventDefault();
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  if (!currentUser || !currentUser.is_admin) { alert("Admin only"); return; }
  const target = (currentStatus === "Regular") ? "Free" : "Regular";
  let class_info = null;
  if (target === "Regular") {
    class_info = prompt("Enter description for this regular block (e.g., II-Sec-E):");
    if (class_info === null) return; // cancel
  }
  const r = await safeFetch(`${API_BASE}/api/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot_id: slotId, status: target, class_info })
  });
  if (r.networkError) { alert(`Network error — cannot reach backend at ${API_BASE}.`); return; }
  if (r.ok && r.data && r.data.success) {
    const currentLab = document.getElementById('labSelect')?.value;
    await reloadLabSelectIfPresent();
    if (currentLab) {
     document.getElementById('labSelect').value = currentLab;
     document.getElementById('labSelect').dispatchEvent(new Event('change'));
    }
  } else {
    alert((r.data && r.data.message) ? r.data.message : `Failed to update slot (status ${r.status})`);
  }
}

// Expose handleRightClick & handleClick globally for inline onclick usage
window.handleClick = handleClick;
window.handleRightClick = handleRightClick;

// ================= ADMIN PAGE =================
if (window.location.pathname.endsWith('admin.html') || window.location.pathname.endsWith('/admin.html')) {
  // protect page
  if (!user || !user.is_admin) { alert("Access denied. Admins only."); window.location.href = "index.html"; }

  // Back & Logout wiring (if present)
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.addEventListener("click", () => window.location.href = "dashboard.html");
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => { localStorage.clear(); window.location.href = "index.html"; });

  // ----- Users -----
  const createBtn = document.getElementById("createUserBtn");
  if (createBtn) {
    createBtn.addEventListener("click", async () => {
      const name = document.getElementById("new_name").value.trim();
      const faculty_id = document.getElementById("new_faculty_id").value.trim();
      const password = document.getElementById("new_password").value;
      const is_admin = document.getElementById("new_is_admin").checked;
      const msgEl = document.getElementById("createMsg");
      msgEl.textContent = '';
      if (!name || !faculty_id || !password) { msgEl.textContent = "Name, Faculty ID and Password are required."; return; }
      const r = await safeFetch(`${API_BASE}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: user.faculty_id, name, faculty_id, password, is_admin })
      });
      if (r.networkError) { msgEl.textContent = `Network error - can't reach ${API_BASE}`; return; }
      if (r.ok && r.data && r.data.success) {
        document.getElementById("new_name").value = '';
        document.getElementById("new_faculty_id").value = '';
        document.getElementById("new_password").value = '';
        document.getElementById("new_is_admin").checked = false;
        loadUsers();
      } else {
        msgEl.textContent = (r.data && r.data.message) ? r.data.message : `Failed to create user (status ${r.status})`;
      }
    });
  }

  async function loadUsers() {
    const wrap = document.getElementById("usersTableWrap");
    if (!wrap) return;
    wrap.innerHTML = "Loading...";
    const r = await safeFetch(`${API_BASE}/api/users?requester=${user.faculty_id}`);
    if (r.networkError) { wrap.innerHTML = `Cannot reach backend at ${API_BASE}`; return; }
    if (!r.ok) { wrap.innerHTML = `Failed to fetch users (status ${r.status})`; return; }
    const users = r.data || [];
    let html = `<table style="width:100%;border-collapse:collapse"><tr style="background:#f1f5f9"><th>Name</th><th>Faculty ID</th><th>Is Admin</th><th>Actions</th></tr>`;
    users.forEach(u => {
      html += `<tr><td>${u.name}</td><td>${u.faculty_id}</td><td>${u.is_admin ? 'Yes' : 'No'}</td><td>
        <button onclick="editUser(${u.id}, '${escape(u.name)}', '${u.faculty_id}', ${u.is_admin})">Edit</button>
        <button onclick="deleteUser(${u.id}, '${u.faculty_id}')">Delete</button>
      </td></tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
  }

  window.editUser = async function(id, nameEscaped, facultyId, isAdminFlag) {
    const name = unescape(nameEscaped);
    const newName = prompt("New name:", name) || name;
    const newPassword = prompt("New password (leave empty to keep unchanged):", "");
    const newIsAdmin = confirm("Make this user an admin? OK = Yes, Cancel = No");
    const r = await safeFetch(`${API_BASE}/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, name: newName, password: newPassword, is_admin: newIsAdmin })
    });
    if (r.networkError) { alert(`Network error — cannot reach backend at ${API_BASE}`); return; }
    if (r.ok && r.data && r.data.success) loadUsers();
    else alert((r.data && r.data.message) ? r.data.message : `Update failed (status ${r.status})`);
  };

  window.deleteUser = async function(id, facultyId) {
    if (!confirm(`Delete faculty ${facultyId}?`)) return;
    const r = await safeFetch(`${API_BASE}/api/users/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id })
    });
    if (r.networkError) { alert(`Network error — cannot reach backend at ${API_BASE}`); return; }
    if (r.ok && r.data && r.data.success) loadUsers();
    else alert((r.data && r.data.message) ? r.data.message : `Delete failed (status ${r.status})`);
  };

  // ----- Labs management -----
  const createLabBtn = document.getElementById("createLabBtn");
  if (createLabBtn) createLabBtn.addEventListener("click", async () => {
    const name = document.getElementById("new_lab_name").value.trim();
    const msgEl = document.getElementById("createLabMsg");
    msgEl.textContent = '';
    if (!name) { msgEl.textContent = "Lab name required"; return; }
    const r = await safeFetch(`${API_BASE}/api/labs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, name })
    });
    if (r.networkError) { msgEl.textContent = `Network error - can't reach ${API_BASE}`; return; }
    if (r.ok && r.data && r.data.success) { document.getElementById("new_lab_name").value=''; loadLabsAdmin(); await reloadLabSelectIfPresent(); }
    else msgEl.textContent = (r.data && r.data.message) ? r.data.message : `Failed to create lab (status ${r.status})`;
  });

  async function loadLabsAdmin() {
    const wrap = document.getElementById("labsTableWrap");
    if (!wrap) return;
    wrap.innerHTML = "Loading...";
    const r = await safeFetch(`${API_BASE}/api/labs`);
    if (r.networkError) { wrap.innerHTML = `Cannot reach backend at ${API_BASE}`; return; }
    if (!r.ok) { wrap.innerHTML = `Failed to fetch labs (status ${r.status})`; return; }
    const labs = r.data || [];
    let html = `<table style="width:100%;border-collapse:collapse"><tr style="background:#f1f5f9"><th>Lab Name</th><th>Actions</th></tr>`;
    labs.forEach(l => {
      html += `<tr><td>${l.name}</td><td>
        <button onclick="editLab(${l.id}, '${escape(l.name)}')">Edit</button>
        <button onclick="deleteLab(${l.id})">Delete</button>
        <button onclick="openWeekendModal(${l.id}, '${escape(l.name)}')">Weekend</button>
      </td></tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
  }

  window.editLab = async function(id, nameEscaped) {
    const current = unescape(nameEscaped);
    const newName = prompt("New lab name:", current);
    if (!newName) return;
    const r = await safeFetch(`${API_BASE}/api/labs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, name: newName })
    });
    if (r.networkError) { alert(`Network error — cannot reach backend at ${API_BASE}`); return; }
    if (r.ok && r.data && r.data.success) { loadLabsAdmin(); await reloadLabSelectIfPresent(); }
    else alert((r.data && r.data.message) ? r.data.message : `Failed to update lab (status ${r.status})`);
  };

  window.deleteLab = async function(id) {
    if (!confirm("Delete this lab? This will remove its timetable and future bookings.")) return;
    const r = await safeFetch(`${API_BASE}/api/labs/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id })
    });
    if (r.networkError) { alert(`Network error — cannot reach backend at ${API_BASE}`); return; }
    if (r.ok && r.data && r.data.success) { loadLabsAdmin(); await reloadLabSelectIfPresent(); }
    else alert((r.data && r.data.message) ? r.data.message : `Failed to delete lab (status ${r.status})`);
  };

  // initial loads
  loadUsers();
  loadLabsAdmin();

  // -------- Weekend modal logic (global defaults + per-lab) --------
  const modal = document.getElementById('weekendModal');
  const modalTarget = document.getElementById('modalTarget');
  const satDefault = document.getElementById('satDefault');
  const sunDefault = document.getElementById('sunDefault');
  const satOverride = document.getElementById('satOverride');
  const sunOverride = document.getElementById('sunOverride');
  const modalSave = document.getElementById('modalSave');
  const modalCancel = document.getElementById('modalCancel');

  // expose so inline onclick works
  window.openWeekendModal = async function(labId, labNameEscaped) {
    // populate target dropdown: Global + labs
    modalTarget.innerHTML = `<option value="global">Global Defaults</option>`;
    const rLabs = await safeFetch(`${API_BASE}/api/labs`);
    if (!rLabs.ok) { alert(`Cannot load labs from backend at ${API_BASE}`); return; }
    const labs = rLabs.data || [];
    labs.forEach(l => {
      const opt = document.createElement('option');
      opt.value = String(l.id);
      opt.text = l.name;
      modalTarget.appendChild(opt);
    });
    modalTarget.value = String(labId);
    await loadModalValues();
    modal.setAttribute('aria-hidden', 'false');
  };

  async function loadModalValues() {
    const val = modalTarget.value;
    if (val === 'global') {
      const r = await safeFetch(`${API_BASE}/api/weekend/global`);
      if (r.networkError) { alert(`Cannot reach backend at ${API_BASE}`); return; }
      if (!r.ok) { alert(`Failed to fetch global weekend settings (status ${r.status})`); return; }
      const cfg = r.data || {};
      satDefault.value = cfg.saturday || '';
      sunDefault.value = cfg.sunday || '';
      satOverride.value = '';
      sunOverride.value = '';
    } else {
      const r = await safeFetch(`${API_BASE}/api/weekend/${val}`);
      if (r.networkError) { alert(`Cannot reach backend at ${API_BASE}`); return; }
      if (!r.ok) { alert(`Failed to fetch lab weekend settings (status ${r.status})`); return; }
      const cfg = r.data || {};
      satDefault.value = (cfg.saturday && cfg.saturday.default_text) ? cfg.saturday.default_text : '';
      sunDefault.value = (cfg.sunday && cfg.sunday.default_text) ? cfg.sunday.default_text : '';
      satOverride.value = (cfg.saturday && cfg.saturday.override && cfg.saturday.override.exists) ? (cfg.saturday.override.source_day || '') : '';
      sunOverride.value = (cfg.sunday && cfg.sunday.override && cfg.sunday.override.exists) ? (cfg.sunday.override.source_day || '') : '';
    }
  }

  modalTarget.addEventListener('change', loadModalValues);
  if (modalCancel) modalCancel.addEventListener('click', () => modal.setAttribute('aria-hidden', 'true'));

  if (modalSave) modalSave.addEventListener('click', async () => {
    modalSave.disabled = true;
    modalSave.textContent = 'Saving...';
    try {
      const target = modalTarget.value;
      // handle global via /api/weekend/default with lab_id:'global'
      if (target === 'global') {
        // Saturday
        const r1 = await safeFetch(`${API_BASE}/api/weekend/default`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id: 'global', day: 'Saturday', custom_text: satDefault.value })
        });
        if (r1.networkError) throw new Error(`Network error — cannot reach ${API_BASE}`);
        if (!r1.ok || !r1.data || !r1.data.success) throw new Error(r1.data && r1.data.message ? r1.data.message : `Failed to save Saturday (status ${r1.status})`);
        // Sunday
        const r2 = await safeFetch(`${API_BASE}/api/weekend/default`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id: 'global', day: 'Sunday', custom_text: sunDefault.value })
        });
        if (r2.networkError) throw new Error(`Network error — cannot reach ${API_BASE}`);
        if (!r2.ok || !r2.data || !r2.data.success) throw new Error(r2.data && r2.data.message ? r2.data.message : `Failed to save Sunday (status ${r2.status})`);
      } else {
        const lab_id = parseInt(target, 10);
        // save lab defaults
        const rSat = await safeFetch(`${API_BASE}/api/weekend/default`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id, day: 'Saturday', custom_text: satDefault.value })
        });
        if (rSat.networkError) throw new Error(`Network error — cannot reach ${API_BASE}`);
        if (!rSat.ok || !rSat.data || !rSat.data.success) throw new Error(rSat.data && rSat.data.message ? rSat.data.message : `Failed to save Saturday default (status ${rSat.status})`);
        const rSun = await safeFetch(`${API_BASE}/api/weekend/default`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id, day: 'Sunday', custom_text: sunDefault.value })
        });
        if (rSun.networkError) throw new Error(`Network error — cannot reach ${API_BASE}`);
        if (!rSun.ok || !rSun.data || !rSun.data.success) throw new Error(rSun.data && rSun.data.message ? rSun.data.message : `Failed to save Sunday default (status ${rSun.status})`);

        // overrides
        const satSrc = satOverride.value || null;
        const rO1 = await safeFetch(`${API_BASE}/api/weekend/override`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id, day: 'Saturday', source_day: satSrc })
        });
        if (rO1.networkError) throw new Error(`Network error — cannot reach ${API_BASE}`);
        if (!rO1.ok || !rO1.data || !rO1.data.success) throw new Error(rO1.data && rO1.data.message ? rO1.data.message : `Failed to save Saturday override (status ${rO1.status})`);

        const sunSrc = sunOverride.value || null;
        const rO2 = await safeFetch(`${API_BASE}/api/weekend/override`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id, day: 'Sunday', source_day: sunSrc })
        });
        if (rO2.networkError) throw new Error(`Network error — cannot reach ${API_BASE}`);
        if (!rO2.ok || !rO2.data || !rO2.data.success) throw new Error(rO2.data && rO2.data.message ? rO2.data.message : `Failed to save Sunday override (status ${rO2.status})`);
      }

      // refresh UI
      loadLabsAdmin();
      await reloadLabSelectIfPresent();
      modal.setAttribute('aria-hidden', 'true');
      alert("Saved successfully.");
    } catch (err) {
      console.error(err);
      alert(`Save failed: ${err.message || err}`);
    } finally {
      modalSave.disabled = false;
      modalSave.textContent = 'Save';
    }
  });

} // end admin page block

// global logout wiring (for any pages)
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtns = document.querySelectorAll("#logoutBtn");
  logoutBtns.forEach(btn => btn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  }));
});
