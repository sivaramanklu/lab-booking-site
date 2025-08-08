// ===== Shared =====
const user = JSON.parse(localStorage.getItem("user") || "null");

/*
 API base selection priority:
 1) If window.__API_BASE__ is defined (non-empty string) -> use it.
 2) Otherwise default to http://127.0.0.1:5000 (recommended for local dev).
 3) If you really want same-origin automatic behavior, set window.__API_BASE__ = null before this script loads.
*/
const API_BASE = (function(){
  if (typeof window.__API_BASE__ !== 'undefined') {
    // explicit override can be a string or null
    if (window.__API_BASE__ === null) {
      // explicit "use same origin"
      return `${window.location.protocol}//${window.location.host}`;
    }
    if (typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim() !== '') {
      return window.__API_BASE__.trim();
    }
  }
  // default to local backend (this fixes the "405 on GitHub Pages" problem)
  return 'http://127.0.0.1:5000';
})();

console.log("API_BASE =", API_BASE);

// safeFetch utility (network-friendly)
async function safeFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore non-json */ }
    return { ok: res.ok, status: res.status, data, res };
  } catch (err) {
    return { ok: false, networkError: true, error: err };
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// reload lab select helper (if dashboard present)
async function reloadLabSelectIfPresent() {
  try {
    const sel = document.getElementById('labSelect');
    if (!sel) return;
    const r = await safeFetch(`${API_BASE}/api/labs`);
    if (!r.ok) {
      console.error('Failed to load labs', r);
      sel.innerHTML = `<option value="">(Labs loading failed)</option>`;
      return;
    }
    const labs = r.data;
    sel.innerHTML = labs.map(lab => `<option value="${lab.id}">${lab.name}</option>`).join('');
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

// ===== Login =====
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const facultyId = document.getElementById("facultyId").value;
    const password = document.getElementById("password").value;

    const r = await safeFetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faculty_id: facultyId, password })
    });

    if (r.networkError) {
      document.getElementById("loginMsg").textContent = `Network error — cannot reach backend at ${API_BASE}. Make sure your Flask server is running.`;
      return;
    }

    // Helpful message for the 405 case (static host refusing POSTs)
    if (r.status === 405) {
      document.getElementById("loginMsg").textContent =
        `Login failed (405): POST not allowed at ${API_BASE}. This usually means your frontend is served from a static host (e.g. GitHub Pages) and the API_BASE is pointing to that host. ` +
        `Fix: run frontend locally (http://localhost:8000) OR set the backend URL by adding this before script.js in your HTML:\n` +
        `  <script>window.__API_BASE__='http://127.0.0.1:5000'</script>\n` +
        `Then refresh and try again.`;
      return;
    }

    const data = r.data || {};
    if (r.ok && data.success) {
      localStorage.setItem("user", JSON.stringify(data));
      window.location.href = "dashboard.html";
    } else {
      document.getElementById("loginMsg").textContent = (data && data.message) ? data.message : `Login failed (status ${r.status})`;
    }
  });
}

// ===== Dashboard =====
const labSelect = document.getElementById("labSelect");
const timetableDiv = document.getElementById("timetable");

if (labSelect && timetableDiv && user) {
  // Admin link
  if (user.is_admin) {
    const anc = document.createElement('a');
    anc.href = "admin.html";
    anc.textContent = "Admin: Manage Faculties & Labs";
    anc.style.display = "inline-block";
    anc.style.margin = "8px";
    const container = document.querySelector('.container');
    if (container) container.insertBefore(anc, container.firstChild.nextSibling);
  }

  // Add modern Logout button in header if not present
  (function ensureLogoutButton() {
    if (!document.getElementById('logoutBtn')) {
      const header = document.querySelector('.container > div');
      const btn = document.createElement('button');
      btn.id = 'logoutBtn';
      btn.className = 'btn-logout';
      btn.title = 'Logout';
      btn.textContent = 'Logout';
      btn.style.marginLeft = '12px';
      if (header) header.appendChild(btn);
      else document.querySelector('.container').insertBefore(btn, document.querySelector('.container').firstChild);
    }
    const lb = document.getElementById('logoutBtn');
    if (lb) lb.addEventListener('click', () => { localStorage.clear(); window.location.href = "index.html"; });
  })();

  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const periods = ["09:00-09:50","10:00-10:50","11:00-11:50","12:00-12:50","01:00-01:50","02:00-02:50","03:00-03:50","04:00-04:50"];

  labSelect.addEventListener("change", () => loadTimetable(labSelect.value));

  (async function initDashboard() {
    await reloadLabSelectIfPresent();
    if (labSelect.options.length) loadTimetable(labSelect.value);
  })();

  async function loadTimetable(labId) {
    const r = await safeFetch(`${API_BASE}/api/timetable/${labId}`);
    if (r.networkError) {
      timetableDiv.innerHTML = `<div style="color:#b91c1c">Cannot reach backend at ${API_BASE}. Ensure backend is running.</div>`;
      return;
    }
    if (!r.ok) {
      timetableDiv.innerHTML = `<div style="color:#b91c1c">Failed to load timetable (status ${r.status}).</div>`;
      return;
    }
    const slots = r.data;
    timetableDiv.innerHTML = generateTable(slots);
  }

  function generateTable(slots) {
    const dateByDay = {};
    for (const s of slots) if (!dateByDay[s.day]) dateByDay[s.day] = s.date;

    let html = `<table class="timetable-table"><tr><th>Day<br/>Date</th>`;
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
          if (slot.faculty_name) {
            cellText = `Booked by ${slot.faculty_name}<br/>(${slot.class_info || "N/A"})`;
          } else {
            cellText = `Booked${slot.class_info ? `<br/>(${slot.class_info})` : ''}`;
          }
          cellClass = 'booked';
        } else {
          cellText = "Free";
          cellClass = 'free';
        }

        const canClick = (slot.status === "Free") || (slot.status === "Booked" && (String(slot.faculty_id) === String(user.user_id) || user.is_admin));
        const canRightClick = user.is_admin && slot.status !== "Booked";
        const dateParam = slot.date ? slot.date : '';
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

// ===== Booking & Release =====
async function handleClick(slotId, status, dateIso) {
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) return;
  if (!dateIso) { alert("Date not available for this slot."); return; }

  if (status === "Free") {
    const classInfo = prompt("Enter class info (e.g., 2nd Year A):");
    if (!classInfo) return;
    const r = await safeFetch(`${API_BASE}/api/book`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: user.user_id, class_info: classInfo })
    });
    if (r.networkError) {
      alert(`Network error — cannot reach backend at ${API_BASE}.`);
      return;
    }
    if (r.ok && r.data && r.data.success) await reloadLabSelectIfPresent();
    else alert(r.data && r.data.message ? r.data.message : `Booking failed (status ${r.status})`);
  } else if (status === "Booked") {
    if (!confirm("Release this booking?")) return;
    const r = await safeFetch(`${API_BASE}/api/release`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: user.user_id, is_admin: user.is_admin })
    });
    if (r.networkError) {
      alert(`Network error — cannot reach backend at ${API_BASE}.`);
      return;
    }
    if (r.ok && r.data && r.data.success) await reloadLabSelectIfPresent();
    else alert(r.data && r.data.message ? r.data.message : `Release failed (status ${r.status})`);
  }
}

// ===== Admin Right-Click Handler =====
async function handleRightClick(e, slotId, currentStatus) {
  e.preventDefault();
  const targetStatus = currentStatus === "Regular" ? "Free" : "Regular";
  let classInfo = null;
  if (targetStatus === "Regular") {
    classInfo = prompt("Enter description for this regular block (e.g., II-Sec-E):");
    if (!classInfo) return;
  }
  const r = await safeFetch(`${API_BASE}/api/block`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot_id: slotId, status: targetStatus, class_info: classInfo })
  });
  if (r.networkError) {
    alert(`Network error — cannot reach backend at ${API_BASE}.`);
    return;
  }
  if (r.ok && r.data && r.data.success) await reloadLabSelectIfPresent();
  else alert(r.data && r.data.message ? r.data.message : `Failed to update slot (status ${r.status})`);
}

// (the rest of admin modal, users, labs code unchanged — omitted for brevity in this snippet)
// ... keep your existing admin code below (openWeekendModal, loadModalValues, modalSave etc.)

// global logout wiring
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtns = document.querySelectorAll("#logoutBtn");
  logoutBtns.forEach(btn => btn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  }));
});
