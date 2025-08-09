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
  if (user && user.is_admin) {
    const anc = document.createElement('a');
    anc.href = "admin.html";
    anc.textContent = "Admin Panel";
    anc.style.margin = "6px";
    const container = document.querySelector('.container');
    if (container) container.insertBefore(anc, container.firstChild.nextSibling);
  }

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

  window.loadTimetable = loadTimetable; // expose for handleClick/rightClick
}

// ================ Booking & Release ================
async function handleClick(slotId, status, dateIso) {
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  if (!currentUser) { alert("Not logged in"); return; }
  if (!dateIso) { alert("Date not available for this slot."); return; }

  const labSelectEl = document.getElementById('labSelect');
  const currentLab = labSelectEl?.value;

  if (status === "Free") {
    const classInfo = prompt("Enter class info (e.g., 2nd Year A):");
    if (!classInfo) return;
    const r = await safeFetch(`${API_BASE}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: currentUser.user_id, class_info: classInfo })
    });
    if (r.ok && r.data && r.data.success) {
      await reloadLabSelectIfPresent();
      if (currentLab) { labSelectEl.value = currentLab; await loadTimetable(currentLab); }
    } else alert((r.data && r.data.message) ? r.data.message : `Booking failed (status ${r.status})`);

  } else if (status === "Booked") {
    if (!confirm("Release this booking?")) return;
    const r = await safeFetch(`${API_BASE}/api/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: currentUser.user_id, is_admin: currentUser.is_admin })
    });
    if (r.ok && r.data && r.data.success) {
      await reloadLabSelectIfPresent();
      if (currentLab) { labSelectEl.value = currentLab; await loadTimetable(currentLab); }
    } else alert((r.data && r.data.message) ? r.data.message : `Release failed (status ${r.status})`);
  }
}

// ================ Admin Right-click (block/unblock Regular) ================
async function handleRightClick(e, slotId, currentStatus) {
  e.preventDefault();
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  if (!currentUser || !currentUser.is_admin) { alert("Admin only"); return; }

  const labSelectEl = document.getElementById('labSelect');
  const currentLab = labSelectEl?.value;

  const target = (currentStatus === "Regular") ? "Free" : "Regular";
  let class_info = null;
  if (target === "Regular") {
    class_info = prompt("Enter description for this regular block (e.g., II-Sec-E):");
    if (class_info === null) return;
  }
  const r = await safeFetch(`${API_BASE}/api/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot_id: slotId, status: target, class_info })
  });
  if (r.ok && r.data && r.data.success) {
    await reloadLabSelectIfPresent();
    if (currentLab) { labSelectEl.value = currentLab; await loadTimetable(currentLab); }
  } else alert((r.data && r.data.message) ? r.data.message : `Failed to update slot (status ${r.status})`);
}

window.handleClick = handleClick;
window.handleRightClick = handleRightClick;

// ================= ADMIN PAGE =================
// (rest of your admin.js logic remains unchanged)
