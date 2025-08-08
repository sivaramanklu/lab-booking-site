// ===== Shared =====
const user = JSON.parse(localStorage.getItem("user"));

// format helper
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
    const res = await fetch("http://127.0.0.1:5000/api/labs");
    const labs = await res.json();
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
  } catch (e) { /* ignore */ }
}

// ===== Login =====
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const facultyId = document.getElementById("facultyId").value;
    const password = document.getElementById("password").value;
    const res = await fetch("http://127.0.0.1:5000/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faculty_id: facultyId, password }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem("user", JSON.stringify(data));
      window.location.href = "dashboard.html";
    } else {
      document.getElementById("loginMsg").textContent = data.message;
    }
  });
}

// ===== Dashboard =====
const labSelect = document.getElementById("labSelect");
const timetableDiv = document.getElementById("timetable");

if (labSelect && timetableDiv && user) {
  if (user.is_admin) {
    const anc = document.createElement('a');
    anc.href = "admin.html";
    anc.textContent = "Admin: Manage Faculties & Labs";
    anc.style.display = "inline-block";
    anc.style.margin = "8px";
    const container = document.querySelector('.container');
    if (container) container.insertBefore(anc, container.firstChild.nextSibling);
  }

  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const periods = ["09:00-09:50","10:00-10:50","11:00-11:50","12:00-12:50","01:00-01:50","02:00-02:50","03:00-03:50","04:00-04:50"];

  labSelect.addEventListener("change", () => loadTimetable(labSelect.value));

  (async function initDashboard() {
    await reloadLabSelectIfPresent();
    if (labSelect.options.length) loadTimetable(labSelect.value);
  })();

  async function loadTimetable(labId) {
    const res = await fetch(`http://127.0.0.1:5000/api/timetable/${labId}`);
    const slots = await res.json();
    timetableDiv.innerHTML = generateTable(slots);
  }

  function generateTable(slots) {
    const dateByDay = {};
    for (const s of slots) if (!dateByDay[s.day]) dateByDay[s.day] = s.date;

    let html = `<table><tr><th>Day<br/>Date</th>`;
    periods.forEach(p => html += `<th>${p}</th>`);
    html += `</tr>`;

    days.forEach(day => {
      const dayDateIso = dateByDay[day] || '';
      html += `<tr><td><strong>${day}</strong><br/><small>${formatDate(dayDateIso)}</small></td>`;
      for (let period = 1; period <= 8; period++) {
        const slot = slots.find(s => s.day === day && s.period === period);
        if (!slot) { html += `<td></td>`; continue; }

        let cellText = slot.status;
        let colorClass = '';
        if (slot.status === "Regular") {
          cellText = `${slot.class_info || ""}`;
          colorClass = 'regular';
        } else if (slot.status === "Booked") {
          if (slot.faculty_name) {
            cellText = `Booked by ${slot.faculty_name}<br/>(${slot.class_info || "N/A"})`;
          } else {
            cellText = `Booked${slot.class_info ? `<br/>(${slot.class_info})` : ''}`;
          }
          colorClass = 'booked';
        } else {
          cellText = "Free";
          colorClass = 'free';
        }

        const canClick = (slot.status === "Free") || (slot.status === "Booked" && (String(slot.faculty_id) === String(user.user_id) || user.is_admin));
        const canRightClick = user.is_admin && slot.status !== "Booked";
        const dateParam = slot.date ? slot.date : '';
        const safeStatus = (slot.status || '').replace(/'/g, "\\'");
        html += `<td class="${colorClass}" style="cursor:${canClick ? 'pointer' : 'default'}"
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
    const res = await fetch("http://127.0.0.1:5000/api/book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: user.user_id, class_info: classInfo })
    });
    const result = await res.json();
    if (result.success) await reloadLabSelectIfPresent();
    else alert(result.message || "Booking failed");
  } else if (status === "Booked") {
    if (!confirm("Release this booking?")) return;
    const res = await fetch("http://127.0.0.1:5000/api/release", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: user.user_id, is_admin: user.is_admin })
    });
    const result = await res.json();
    if (result.success) await reloadLabSelectIfPresent();
    else alert(result.message || "Release failed");
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
  const res = await fetch("http://127.0.0.1:5000/api/block", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot_id: slotId, status: targetStatus, class_info: classInfo })
  });
  const result = await res.json();
  if (result.success) await reloadLabSelectIfPresent();
  else alert(result.message || "Failed to update slot.");
}

// ===== Admin page (users, labs, weekend modal) =====
if (window.location.pathname.endsWith('admin.html') || window.location.pathname.endsWith('/admin.html')) {
  if (!user || !user.is_admin) { alert("Access denied. Admins only."); window.location.href = "index.html"; }

  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.addEventListener("click", () => window.location.href = "dashboard.html");
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => { localStorage.clear(); window.location.href = "index.html"; });

  // Create user
  const createBtn = document.getElementById("createUserBtn");
  if (createBtn) createBtn.addEventListener("click", async () => {
    const name = document.getElementById("new_name").value.trim();
    const faculty_id = document.getElementById("new_faculty_id").value.trim();
    const password = document.getElementById("new_password").value;
    const is_admin = document.getElementById("new_is_admin").checked;
    const msgEl = document.getElementById("createMsg");
    msgEl.textContent = '';
    if (!name || !faculty_id || !password) { msgEl.textContent = "Name, Faculty ID and Password are required."; return; }
    const res = await fetch("http://127.0.0.1:5000/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, name, faculty_id, password, is_admin })
    });
    const data = await res.json();
    if (data.success) { document.getElementById("new_name").value=''; document.getElementById("new_faculty_id").value=''; document.getElementById("new_password").value=''; document.getElementById("new_is_admin").checked=false; loadUsers(); }
    else msgEl.textContent = data.message || "Failed to create user";
  });

  async function loadUsers() {
    const wrap = document.getElementById("usersTableWrap"); if (!wrap) return;
    wrap.innerHTML = "Loading...";
    const res = await fetch(`http://127.0.0.1:5000/api/users?requester=${user.faculty_id}`);
    if (!res.ok) { wrap.innerHTML = "Failed to fetch users."; return; }
    const users = await res.json();
    let html = `<table style="width:100%;border-collapse:collapse"><tr style="background:#eee"><th>Name</th><th>Faculty ID</th><th>Is Admin</th><th>Actions</th></tr>`;
    users.forEach(u => {
      html += `<tr><td>${u.name}</td><td>${u.faculty_id}</td><td>${u.is_admin ? 'Yes' : 'No'}</td><td>
        <button onclick="editUser(${u.id}, '${escape(u.name)}', '${u.faculty_id}', ${u.is_admin})">Edit</button>
        <button onclick="deleteUser(${u.id}, '${u.faculty_id}')">Delete</button>
      </td></tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
  }

  // LABS management
  const createLabBtn = document.getElementById("createLabBtn");
  if (createLabBtn) createLabBtn.addEventListener("click", async () => {
    const name = document.getElementById("new_lab_name").value.trim();
    const msgEl = document.getElementById("createLabMsg"); msgEl.textContent = '';
    if (!name) { msgEl.textContent = "Lab name required"; return; }
    const res = await fetch("http://127.0.0.1:5000/api/labs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, name })
    });
    const data = await res.json();
    if (data.success) { document.getElementById("new_lab_name").value=''; loadLabsAdmin(); await reloadLabSelectIfPresent(); }
    else msgEl.textContent = data.message || "Failed to create lab";
  });

  async function loadLabsAdmin() {
    const wrap = document.getElementById("labsTableWrap"); if (!wrap) return;
    wrap.innerHTML = "Loading...";
    const res = await fetch(`http://127.0.0.1:5000/api/labs`);
    if (!res.ok) { wrap.innerHTML = "Failed to fetch labs."; return; }
    const labs = await res.json();
    let html = `<table style="width:100%;border-collapse:collapse"><tr style="background:#eee"><th>Lab Name</th><th>Actions</th></tr>`;
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
    const res = await fetch(`http://127.0.0.1:5000/api/labs/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, name: newName })
    });
    const data = await res.json();
    if (data.success) { loadLabsAdmin(); await reloadLabSelectIfPresent(); }
    else alert(data.message || "Failed to update lab");
  };

  window.deleteLab = async function(id) {
    if (!confirm("Delete this lab? This will remove its timetable and future bookings.")) return;
    const res = await fetch(`http://127.0.0.1:5000/api/labs/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id })
    });
    const data = await res.json();
    if (data.success) { loadLabsAdmin(); await reloadLabSelectIfPresent(); }
    else alert(data.message || "Failed to delete lab");
  };

  window.editUser = async function (id, nameEscaped, facultyId, isAdminFlag) {
    const name = unescape(nameEscaped);
    const newName = prompt("New name:", name) || name;
    const newPassword = prompt("New password (leave empty to keep unchanged):", "");
    const newIsAdmin = confirm("Make this user an admin? OK = Yes, Cancel = No");
    const res = await fetch(`http://127.0.0.1:5000/api/users/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, name: newName, password: newPassword, is_admin: newIsAdmin })
    });
    const data = await res.json();
    if (data.success) loadUsers(); else alert(data.message || "Update failed");
  };

  window.deleteUser = async function (id, facultyId) {
    if (!confirm(`Delete faculty ${facultyId}?`)) return;
    const res = await fetch(`http://127.0.0.1:5000/api/users/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id })
    });
    const data = await res.json();
    if (data.success) loadUsers(); else alert(data.message || "Delete failed");
  };

  // initial loads
  loadUsers();
  loadLabsAdmin();

  // ---- Weekend modal logic ----
  const modal = document.getElementById('weekendModal');
  const modalTarget = document.getElementById('modalTarget');
  const satDefault = document.getElementById('satDefault');
  const sunDefault = document.getElementById('sunDefault');
  const satOverride = document.getElementById('satOverride');
  const sunOverride = document.getElementById('sunOverride');
  const modalSave = document.getElementById('modalSave');
  const modalCancel = document.getElementById('modalCancel');

  window.openWeekendModal = async function(labId, labNameEscaped) {
    // populate target dropdown with Global + labs
    modalTarget.innerHTML = `<option value="global">Global Defaults</option>`;
    const resLabs = await fetch("http://127.0.0.1:5000/api/labs");
    const labs = await resLabs.json();
    labs.forEach(l => {
      const sel = document.createElement('option');
      sel.value = String(l.id);
      sel.text = l.name;
      modalTarget.appendChild(sel);
    });
    // default select to the lab we clicked
    modalTarget.value = String(labId);

    // load configs for selected lab
    await loadModalValues();

    // show modal
    modal.setAttribute('aria-hidden', 'false');
  }

  async function loadModalValues() {
    const val = modalTarget.value;
    if (val === 'global') {
      // fetch global
      const res = await fetch("http://127.0.0.1:5000/api/weekend/global");
      const cfg = await res.json();
      satDefault.value = cfg.saturday || '';
      sunDefault.value = cfg.sunday || '';
      // overrides not applicable for global; clear selects
      satOverride.value = '';
      sunOverride.value = '';
    } else {
      // lab-specific
      const res = await fetch(`http://127.0.0.1:5000/api/weekend/${val}`);
      const cfg = await res.json();
      satDefault.value = cfg.saturday.default_text || '';
      sunDefault.value = cfg.sunday.default_text || '';
      satOverride.value = cfg.saturday.override && cfg.saturday.override.exists ? (cfg.saturday.override.source_day || '') : '';
      sunOverride.value = cfg.sunday.override && cfg.sunday.override.exists ? (cfg.sunday.override.source_day || '') : '';
    }
  }

  modalTarget.addEventListener('change', loadModalValues);
  modalCancel.addEventListener('click', () => modal.setAttribute('aria-hidden', 'true'));

  modalSave.addEventListener('click', async () => {
    const target = modalTarget.value;
    // Save defaults (global or lab)
    if (target === 'global') {
      // Saturday
      await fetch("http://127.0.0.1:5000/api/weekend/default", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id: 'global', day: 'Saturday', custom_text: satDefault.value })
      });
      // Sunday
      await fetch("http://127.0.0.1:5000/api/weekend/default", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id: 'global', day: 'Sunday', custom_text: sunDefault.value })
      });
    } else {
      // lab-specific defaults
      const lab_id = parseInt(target,10);
      await fetch("http://127.0.0.1:5000/api/weekend/default", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id, day: 'Saturday', custom_text: satDefault.value })
      });
      await fetch("http://127.0.0.1:5000/api/weekend/default", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id, day: 'Sunday', custom_text: sunDefault.value })
      });

      // overrides for upcoming weekend (set/clear)
      const satSrc = satOverride.value || null;
      const sunSrc = sunOverride.value || null;
      await fetch("http://127.0.0.1:5000/api/weekend/override", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id, day: 'Saturday', source_day: satSrc })
      });
      await fetch("http://127.0.0.1:5000/api/weekend/override", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id, day: 'Sunday', source_day: sunSrc })
      });
    }

    // reload admin lists and dashboard dropdown
    loadLabsAdmin();
    await reloadLabSelectIfPresent();

    modal.setAttribute('aria-hidden', 'true');
    alert("Saved.");
  });

} // end admin page block

// ===== Logout (global) =====
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtns = document.querySelectorAll("#logoutBtn");
  logoutBtns.forEach(btn => btn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  }));
});
