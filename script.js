// ===== Full script.js (updated) =====

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

// ===== safeFetch helper =====
async function safeFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
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

// ========== LOGIN PAGE ==========
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  // show notification area if exists
  (async function showLoginNotification() {
    // If server returned a notification in localStorage user obj (when logged in) that's not helpful here.
    // Instead call /api/notifications to fetch latest active.
    const r = await safeFetch(`${API_BASE}/api/notifications`);
    if (r.ok && Array.isArray(r.data) && r.data.length > 0) {
      // Find first active
      const active = r.data.find(n => n.active) || r.data[0];
      if (active) {
        const banner = document.createElement('div');
        banner.id = 'siteNotificationBanner';
        banner.style.background = '#fffbdd';
        banner.style.border = '1px solid #f0e6a8';
        banner.style.padding = '10px';
        banner.style.marginBottom = '12px';
        banner.innerHTML = `<strong>${active.title || 'Notice'}</strong><div>${active.message || ''}</div>`;
        const container = document.querySelector('.container') || document.body;
        container.insertBefore(banner, container.firstChild);
      }
    }
  })();

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
    if (res.status === 405) {
      document.getElementById("loginMsg").textContent = `Login failed (405): POST not allowed at ${API_BASE}.`;
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

// ========== DASHBOARD ==========
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

  // Add Change Password button
  (function ensureChangePassword() {
    if (!document.getElementById('changePassBtn')) {
      const btn = document.createElement('button');
      btn.id = 'changePassBtn';
      btn.textContent = 'Change Password';
      btn.style.margin = '6px';
      const container = document.querySelector('.container');
      if (container) container.insertBefore(btn, container.firstChild);
      btn.addEventListener('click', openChangePasswordDialog);
    }
  })();

  // modern logout button
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
    if (lb) lb.addEventListener('click', () => { localStorage.clear(); window.location.href = "index.html"; });
  })();

  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const periods = ["09:00-09:50","10:00-10:50","11:00-11:50","12:00-12:50","01:00-01:50","02:00-02:50","03:00-03:50","04:00-04:50"];

  labSelect.addEventListener('change', () => { if (labSelect.value) loadTimetable(labSelect.value); });

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
        if (!slot) { html += `<td></td>`; continue; }

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
      method: "POST", headers: { "Content-Type": "application/json" },
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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: currentUser.user_id, is_admin: currentUser.is_admin })
    });
    if (r.networkError) { alert(`Network error — cannot reach backend at ${API_BASE}.`); return; }
    if (r.ok && r.data && r.data.success) {
      await reloadLabSelectIfPresent();
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
    await reloadLabSelectIfPresent();
  } else {
    alert((r.data && r.data.message) ? r.data.message : `Failed to update slot (status ${r.status})`);
  }
}
window.handleClick = handleClick;
window.handleRightClick = handleRightClick;

// ================ Admin page additions (notifications & cleanup) ================
if (window.location.pathname.endsWith('admin.html') || window.location.pathname.endsWith('/admin.html')) {
  // protect page
  const userObj = JSON.parse(localStorage.getItem("user") || "null");
  if (!userObj || !userObj.is_admin) { alert("Access denied. Admins only."); window.location.href = "index.html"; }

  // Add notification UI to admin page: (assumes existing admin HTML has a <div id="adminExtras"></div>)
  const adminExtras = document.getElementById('adminExtras');
  if (adminExtras) {
    adminExtras.innerHTML = `
      <h3>Site Notification</h3>
      <input id="notifTitle" placeholder="Title" style="width:100%;padding:6px;margin-bottom:6px" />
      <textarea id="notifMessage" placeholder="Message" style="width:100%;height:90px;"></textarea>
      <label><input id="notifActive" type="checkbox" checked /> Active (show on login)</label>
      <div style="margin-top:8px;">
        <button id="postNotifBtn">Post Notification</button>
        <button id="clearNotifBtn" style="margin-left:8px;">Clear Active</button>
        <button id="cleanupBtn" style="margin-left:20px;background:#f44336;color:white;">Run Cleanup (delete past bookings)</button>
      </div>
      <div id="adminNotifMsg" style="margin-top:8px;color:#006400;"></div>
      <hr/>
      <div id="notifListWrap"></div>
    `;
    document.getElementById('postNotifBtn').addEventListener('click', async () => {
      const title = document.getElementById('notifTitle').value.trim();
      const message = document.getElementById('notifMessage').value.trim();
      const active = document.getElementById('notifActive').checked;
      const r = await safeFetch(`${API_BASE}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: userObj.faculty_id, title, message, active })
      });
      if (r.networkError) { document.getElementById('adminNotifMsg').textContent = `Network error`; return; }
      if (r.ok && r.data && r.data.success) {
        document.getElementById('adminNotifMsg').textContent = 'Posted.';
        loadNotifList();
      } else {
        document.getElementById('adminNotifMsg').textContent = (r.data && r.data.message) ? r.data.message : 'Failed';
      }
    });
    document.getElementById('clearNotifBtn').addEventListener('click', async () => {
      // Clear active by posting an inactive empty notification; or delete all active notifications
      const r = await safeFetch(`${API_BASE}/api/notifications`, {});
      if (r.ok) {
        // deactivate by creating an inactive empty notification (keeps history)
        const r2 = await safeFetch(`${API_BASE}/api/notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requester_faculty_id: userObj.faculty_id, title: '', message: '', active: false })
        });
        if (r2.ok && r2.data && r2.data.success) { document.getElementById('adminNotifMsg').textContent = 'Cleared active notification.'; loadNotifList(); }
      } else document.getElementById('adminNotifMsg').textContent = 'Failed to clear';
    });

    document.getElementById('cleanupBtn').addEventListener('click', async () => {
      if (!confirm('Delete all bookings older than today?')) return;
      const r = await safeFetch(`${API_BASE}/api/cleanup_bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: userObj.faculty_id })
      });
      if (r.networkError) alert('Network error during cleanup');
      else if (r.ok && r.data && r.data.success) alert(`Deleted ${r.data.deleted} old bookings`);
      else alert('Cleanup failed: ' + (r.data && r.data.message));
    });

    async function loadNotifList() {
      const wrap = document.getElementById('notifListWrap');
      const r = await safeFetch(`${API_BASE}/api/notifications`);
      if (!r.ok || r.networkError) { wrap.innerHTML = 'Failed to load'; return; }
      const list = r.data || [];
      let html = '<h4>Recent Notifications</h4><ul>';
      for (const n of list) {
        html += `<li><strong>${n.title || '(no title)'}</strong> - ${n.created_at ? new Date(n.created_at).toLocaleString() : ''} ${n.active ? '<em>(active)</em>' : ''} 
          <button onclick="deleteNotif(${n.id})" style="margin-left:8px">Delete</button></li>`;
      }
      html += '</ul>';
      wrap.innerHTML = html;
    }
    window.deleteNotif = async function(id) {
      if (!confirm('Delete notification?')) return;
      const r = await safeFetch(`${API_BASE}/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester_faculty_id: userObj.faculty_id })
      });
      if (r.ok && r.data && r.data.success) loadNotifList();
      else alert('Failed to delete');
    };
    loadNotifList();
  }
}

// ================ Change Password (dashboard) ================
function openChangePasswordDialog() {
  const dlgHtml = `
    <div id="changePassModal" style="position:fixed;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);">
      <div style="background:white;padding:20px;border-radius:8px;max-width:420px;width:92%;">
        <h3>Change Password</h3>
        <input id="cp_old" type="password" placeholder="Old password" style="width:100%;padding:8px;margin:8px 0;" />
        <input id="cp_new" type="password" placeholder="New password" style="width:100%;padding:8px;margin:8px 0;" />
        <input id="cp_new2" type="password" placeholder="Confirm new password" style="width:100%;padding:8px;margin:8px 0;" />
        <div style="text-align:right;">
          <button id="cp_cancel">Cancel</button>
          <button id="cp_save" style="margin-left:8px;">Save</button>
        </div>
        <div id="cp_msg" style="margin-top:8px;color:#b91c1c;"></div>
      </div>
    </div>
  `;
  const tmp = document.createElement('div');
  tmp.innerHTML = dlgHtml;
  document.body.appendChild(tmp.firstChild);
  document.getElementById('cp_cancel').addEventListener('click', () => document.getElementById('changePassModal').remove());
  document.getElementById('cp_save').addEventListener('click', async () => {
    const oldp = document.getElementById('cp_old').value;
    const newp = document.getElementById('cp_new').value;
    const newp2 = document.getElementById('cp_new2').value;
    if (!oldp || !newp) { document.getElementById('cp_msg').textContent = 'Fill both fields'; return; }
    if (newp !== newp2) { document.getElementById('cp_msg').textContent = 'New passwords do not match'; return; }
    const curUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (!curUser) { document.getElementById('cp_msg').textContent = 'Not logged in'; return; }
    const r = await safeFetch(`${API_BASE}/api/change_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faculty_id: curUser.faculty_id, old_password: oldp, new_password: newp })
    });
    if (r.networkError) { document.getElementById('cp_msg').textContent = 'Network error'; return; }
    if (r.ok && r.data && r.data.success) {
      alert('Password changed. Please login again.');
      localStorage.clear();
      window.location.href = 'index.html';
    } else {
      document.getElementById('cp_msg').textContent = (r.data && r.data.message) ? r.data.message : 'Failed';
    }
  });
}

// ================ Helpers used in multiple places ================
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
  } catch (e) { console.error(e); }
}

// global logout wiring
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtns = document.querySelectorAll("#logoutBtn");
  logoutBtns.forEach(btn => btn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  }));
});
