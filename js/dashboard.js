import { API_BASE, safeFetch } from './api.js';
import { formatDate, reloadLabSelect } from './dom.js';
import { setupLogout } from './auth.js';

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PERIODS = [
  "09:00-09:50", "10:00-10:50", "11:00-11:50", "12:00-12:50",
  "01:00-01:50", "02:00-02:50", "03:00-03:50", "04:00-04:50"
];

let currentLabId = null;

// Initialize dashboard
export async function initDashboard() {
  const labSelect = document.getElementById("labSelect");
  const timetableDiv = document.getElementById("timetable");
  if (!labSelect || !timetableDiv) return;

  const user = JSON.parse(localStorage.getItem("user") || "null");
  
  // Add admin panel link for admins
  if (user?.is_admin) {
    const adminLink = document.createElement('a');
    adminLink.href = "admin.html";
    adminLink.textContent = "Admin Panel";
    adminLink.style.margin = "6px";
    document.querySelector('.container')?.prepend(adminLink);
  }

  // Setup logout button
  setupLogout();
  
  // Initialize lab dropdown
  labSelect.addEventListener('change', () => {
    currentLabId = labSelect.value;
    loadTimetable(currentLabId);
  });
  
  // Load labs and timetable
  await reloadLabSelect(API_BASE, false);
  if (labSelect.options.length > 0) {
    currentLabId = labSelect.value;
    loadTimetable(currentLabId);
  }
}

// Load timetable data
async function loadTimetable(labId) {
  const timetableDiv = document.getElementById("timetable");
  if (!timetableDiv) return;
  
  timetableDiv.innerHTML = "Loading...";
  const r = await safeFetch(`${API_BASE}/api/timetable/${labId}`);
  
  if (r.networkError) {
    timetableDiv.innerHTML = `<div class="error">Cannot reach backend at ${API_BASE}.</div>`;
    return;
  }
  
  if (!r.ok) {
    timetableDiv.innerHTML = `<div class="error">Failed to load timetable (status ${r.status}).</div>`;
    return;
  }
  
  timetableDiv.innerHTML = generateTable(r.data || []);
}

// Generate timetable HTML
function generateTable(slots) {
  const dateByDay = {};
  slots.forEach(s => { if (!dateByDay[s.day]) dateByDay[s.day] = s.date; });

  let html = `<table class="timetable-table"><tr><th>Day<br/><small>Date</small></th>`;
  PERIODS.forEach(p => html += `<th>${p}</th>`);
  html += `</tr>`;

  DAYS.forEach(day => {
    const dayDateIso = dateByDay[day] || '';
    html += `<tr><td><strong>${day}</strong><br/><small>${formatDate(dayDateIso)}</small></td>`;
    
    for (let period = 1; period <= 8; period++) {
      const slot = slots.find(s => s.day === day && s.period === period);
      html += generateTableCell(slot);
    }
    
    html += `</tr>`;
  });

  return html + `</table>`;
}

// Generate single table cell
function generateTableCell(slot) {
  if (!slot) return `<td></td>`;
  
  const user = JSON.parse(localStorage.getItem("user") || "null");
  let cellText, cellClass;
  
  switch (slot.status) {
    case "Regular":
      cellText = slot.class_info || "";
      cellClass = 'regular';
      break;
    case "Booked":
      cellText = slot.faculty_name 
        ? `Booked by ${slot.faculty_name}<br/>(${slot.class_info || "N/A"})` 
        : `Booked${slot.class_info ? `<br/>(${slot.class_info})` : ''}`;
      cellClass = 'booked';
      break;
    default:
      cellText = "Free";
      cellClass = 'free';
  }

  const canClick = slot.status === "Free" || 
                  (slot.status === "Booked" && 
                   (String(slot.faculty_id) === String(user?.user_id) || 
                    user?.is_admin));
  
  const canRightClick = user?.is_admin && slot.status !== "Booked";
  const dateParam = slot.date || '';
  
  return `<td class="${cellClass}" 
          ${canClick ? `onclick="handleSlotClick(${slot.id}, '${slot.status}', '${dateParam.replace(/'/g, "\\'")}')"` : ''}
          ${canRightClick ? `oncontextmenu="handleSlotRightClick(event, ${slot.id}, '${slot.status}')"` : ''}
          style="cursor:${canClick ? 'pointer' : 'default'}">
        ${cellText}
      </td>`;
}

// Slot click handler
export async function handleSlotClick(slotId, status, dateIso) {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user) return alert("Not logged in");
  if (!dateIso) return alert("Date not available for this slot.");

  if (status === "Free") {
    const classInfo = prompt("Enter class info (e.g., 2nd Year A):");
    if (!classInfo) return;
    
    const res = await safeFetch(`${API_BASE}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        id: slotId, 
        date: dateIso, 
        faculty_id: user.user_id, 
        class_info: classInfo 
      })
    });
    
    if (res.ok && res.data?.success) {
      // Reload labs while preserving current selection
      await reloadLabSelect(API_BASE, true);
      // Reload timetable for the same lab
      if (currentLabId) loadTimetable(currentLabId);
    } else {
      alert(res.data?.message || `Booking failed (status ${res.status})`);
    }
    
  } else if (status === "Booked") {
    if (!confirm("Release this booking?")) return;
    
    const res = await safeFetch(`${API_BASE}/api/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        id: slotId, 
        date: dateIso, 
        faculty_id: user.user_id, 
        is_admin: user.is_admin 
      })
    });
    
    if (res.ok && res.data?.success) {
      // Reload labs while preserving current selection
      await reloadLabSelect(API_BASE, true);
      // Reload timetable for the same lab
      if (currentLabId) loadTimetable(currentLabId);
    } else {
      alert(res.data?.message || `Release failed (status ${res.status})`);
    }
  }
}

// Slot right-click handler (admin only)
export async function handleSlotRightClick(e, slotId, currentStatus) {
  e.preventDefault();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user?.is_admin) return alert("Admin only");

  const target = (currentStatus === "Regular") ? "Free" : "Regular";
  let class_info = null;

  if (target === "Regular") {
    class_info = prompt("Enter description for this regular block (e.g., II-Sec-E):");
    if (class_info === null) return;
  }

  const res = await safeFetch(`${API_BASE}/api/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      slot_id: slotId, 
      status: target, 
      class_info 
    })
  });

  if (res.ok && res.data?.success) {
    // Reload labs while preserving current selection
    await reloadLabSelect(API_BASE, true);
    // Reload timetable for the same lab
    if (currentLabId) loadTimetable(currentLabId);
  } else {
    alert(res.data?.message || `Failed to update slot (status ${res.status})`);
  }
}