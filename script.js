// ===== Shared =====
const user = JSON.parse(localStorage.getItem("user"));

// format date helper
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

// ===== Login Logic =====
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const facultyId = document.getElementById("facultyId").value;
    const password = document.getElementById("password").value;
    const res = await fetch("http://127.0.0.1:5000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

// ===== Dashboard Logic =====
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
  const periods = [
    "09:00-09:50","10:00-10:50","11:00-11:50","12:00-12:50",
    "01:00-01:50","02:00-02:50","03:00-03:50","04:00-04:50"
  ];

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

    let html = `<table border="1"><tr><th>Day<br/>Date</th>`;
    periods.forEach(p => html += `<th>${p}</th>`);
    html += `</tr>`;

    days.forEach(day => {
      const dayDateIso = dateByDay[day] || '';
      html += `<tr><td><strong>${day}</strong><br/><small>${formatDate(dayDateIso)}</small></td>`;
      for (let period = 1; period <= 8; period++) {
        const slot = slots.find(s => s.day === day && s.period === period);
        if (!slot) { html += `<td></td>`; continue; }

        let cellText = slot.status;
        let color = "#eee";

        if (slot.status === "Regular") {
          cellText = `${slot.class_info || ""}`;
          color = "#dddddd";
        } else if (slot.status === "Booked") {
          if (slot.faculty_name) {
            cellText = `Booked by ${slot.faculty_name}<br/>(${slot.class_info || "N/A"})`;
          } else {
            cellText = `Booked${slot.class_info ? `<br/>(${slot.class_info})` : ''}`;
          }
          color = "#ffdddd";
        } else {
          cellText = "Free";
          color = "#d4f8d4";
        }

        const canClick = (slot.status === "Free") ||
          (slot.status === "Booked" && (String(slot.faculty_id) === String(user.user_id) || user.is_admin));
        const canRightClick = user.is_admin && slot.status !== "Booked";
        const dateParam = slot.date ? slot.date : '';
        const safeStatus = (slot.status || '').replace(/'/g, "\\'");
        html += `<td style="background:${color};cursor:${canClick ? 'pointer' : 'default'}"
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: slotId, date: dateIso, faculty_id: user.user_id, class_info: classInfo
      })
    });
    const result = await res.json();
    if (result.success) {
      await reloadLabSelectIfPresent();
    } else { alert(result.message || "Booking failed"); }
  } else if (status === "Booked") {
    if (!confirm("Release this booking?")) return;
    const res = await fetch("http://127.0.0.1:5000/api/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, date: dateIso, faculty_id: user.user_id, is_admin: user.is_admin })
    });
    const result = await res.json();
    if (result.success) {
      await reloadLabSelectIfPresent();
    } else { alert(result.message || "Release failed"); }
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot_id: slotId, status: targetStatus, class_info: classInfo })
  });
  const result = await res.json();
  if (result.success) await reloadLabSelectIfPresent();
  else alert(result.message || "Failed to update slot.");
}

// ===== Admin page logic (users + labs + weekend config) =====
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
    if (data.success) {
      document.getElementById("new_name").value=''; document.getElementById("new_faculty_id").value=''; document.getElementById("new_password").value=''; document.getElementById("new_is_admin").checked=false;
      loadUsers();
    } else msgEl.textContent = data.message || "Failed to create user";
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

  // LABS: create + display
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
    if (data.success) {
      document.getElementById("new_lab_name").value = '';
      loadLabsAdmin();
      await reloadLabSelectIfPresent();
    } else msgEl.textContent = data.message || "Failed to create lab";
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
        <button onclick="configureWeekend(${l.id})">Weekend</button>
      </td></tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
  }

  // expose editLab/deleteLab globally
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

  // expose user edit/delete
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

  // ------------ Weekend configuration UI ------------
  // Opens prompt-driven configuration for a lab's weekend behaviors
  window.configureWeekend = async function(labId) {
    // fetch current config
    const res = await fetch(`http://127.0.0.1:5000/api/weekend/${labId}`);
    if (!res.ok) { alert("Failed to fetch weekend config"); return; }
    const cfg = await res.json();
    // Saturday configuration
    const satDefault = cfg.saturday.default_text || '';
    const satOverride = cfg.saturday.override && cfg.saturday.override.exists ? cfg.saturday.override.source_day : null;
    const satChoice = prompt(
      `Lab ${labId} - Saturday config:\nCurrent default text: "${satDefault}"\nCurrent override (this upcoming Saturday): ${satOverride || 'none'}\n\nEnter command:\n1) To change default blocked text for Saturday, type: default:YOUR TEXT\n2) To set override to follow a weekday, type: override:Wednesday (Mon..Fri)\n3) To clear override, type: override:clear\n(Leave blank to skip)`,
      ''
    );
    if (satChoice && satChoice.trim()) {
      if (satChoice.startsWith('default:')) {
        const text = satChoice.substring('default:'.length).trim();
        await setWeekendDefault(labId, 'Saturday', text);
      } else if (satChoice.startsWith('override:')) {
        const arg = satChoice.substring('override:'.length).trim();
        if (arg.toLowerCase() === 'clear') await setWeekendOverride(labId, 'Saturday', null);
        else await setWeekendOverride(labId, 'Saturday', arg);
      } else {
        alert("Unrecognized command for Saturday. Use default: or override:");
      }
    }

    // Sunday configuration
    const sunDefault = cfg.sunday.default_text || '';
    const sunOverride = cfg.sunday.override && cfg.sunday.override.exists ? cfg.sunday.override.source_day : null;
    const sunChoice = prompt(
      `Lab ${labId} - Sunday config:\nCurrent default text: "${sunDefault}"\nCurrent override (this upcoming Sunday): ${sunOverride || 'none'}\n\nEnter command:\n1) default:YOUR TEXT\n2) override:Friday (Mon..Fri)  OR override:clear\n(Leave blank to skip)`,
      ''
    );
    if (sunChoice && sunChoice.trim()) {
      if (sunChoice.startsWith('default:')) {
        const text = sunChoice.substring('default:'.length).trim();
        await setWeekendDefault(labId, 'Sunday', text);
      } else if (sunChoice.startsWith('override:')) {
        const arg = sunChoice.substring('override:'.length).trim();
        if (arg.toLowerCase() === 'clear') await setWeekendOverride(labId, 'Sunday', null);
        else await setWeekendOverride(labId, 'Sunday', arg);
      } else {
        alert("Unrecognized command for Sunday. Use default: or override:");
      }
    }

    // reload admin lists and dashboard lab select
    loadLabsAdmin();
    await reloadLabSelectIfPresent();
  };

  async function setWeekendDefault(labId, day, customText) {
    const res = await fetch("http://127.0.0.1:5000/api/weekend/default", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id: labId, day, custom_text: customText })
    });
    const data = await res.json();
    if (!data.success) alert(data.message || "Failed to set default");
  }

  async function setWeekendOverride(labId, day, sourceDay) {
    const res = await fetch("http://127.0.0.1:5000/api/weekend/override", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_faculty_id: user.faculty_id, lab_id: labId, day, source_day: sourceDay })
    });
    const data = await res.json();
    if (!data.success) alert(data.message || "Failed to set override");
  }

  // initial loads
  loadUsers();
  loadLabsAdmin();
}

// ===== Logout (global) =====
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtns = document.querySelectorAll("#logoutBtn");
  logoutBtns.forEach(btn => btn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  }));
});
