import { API_BASE, safeFetch } from './api.js';
import { formatDate } from './dom.js';
import { setupLogout } from './auth.js';

// Initialize admin page
export async function initAdmin() {
  // Check admin privileges
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user || !user.is_admin) {
    alert("Admin access required");
    window.location.href = "index.html";
    return;
  }

  // Setup logout button
  setupLogout();

  // Initialize lab management
  await initLabManagement();
  
  // Initialize timetable view
  await initTimetableView();
  
  // Setup date picker for timetable view
  setupDatePicker();
}

// Initialize lab management section
async function initLabManagement() {
  const labList = document.getElementById("labList");
  const addLabForm = document.getElementById("addLabForm");
  const addLabMsg = document.getElementById("addLabMsg");
  
  if (!labList || !addLabForm) return;
  
  // Load existing labs
  await loadLabs();
  
  // Add lab form handler
  addLabForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const labName = document.getElementById("labName").value.trim();
    if (!labName) {
      addLabMsg.textContent = "Lab name is required";
      return;
    }
    
    const res = await safeFetch(`${API_BASE}/api/labs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: labName })
    });
    
    if (res.ok && res.data?.success) {
      addLabMsg.textContent = "Lab added successfully!";
      addLabForm.reset();
      await loadLabs();
    } else {
      addLabMsg.textContent = res.data?.message || `Failed to add lab (status ${res.status})`;
    }
  });
}

// Load and display labs
async function loadLabs() {
  const labList = document.getElementById("labList");
  if (!labList) return;
  
  labList.innerHTML = "Loading labs...";
  const r = await safeFetch(`${API_BASE}/api/labs`);
  
  if (r.networkError) {
    labList.innerHTML = `<div class="error">Cannot reach backend at ${API_BASE}.</div>`;
    return;
  }
  
  if (!r.ok) {
    labList.innerHTML = `<div class="error">Failed to load labs (status ${r.status}).</div>`;
    return;
  }
  
  const labs = r.data || [];
  if (labs.length === 0) {
    labList.innerHTML = "<p>No labs found</p>";
    return;
  }
  
  labList.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${labs.map(lab => `
          <tr>
            <td>${lab.id}</td>
            <td>${lab.name}</td>
            <td>
              <button class="btn-delete" onclick="deleteLab(${lab.id}, '${lab.name.replace(/'/g, "\\'")}')">
                Delete
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Setup date picker for timetable view
function setupDatePicker() {
  const datePicker = document.getElementById("timetableDate");
  if (!datePicker) return;
  
  // Set default to today
  const today = new Date();
  datePicker.value = today.toISOString().split('T')[0];
  
  // Load timetable on date change
  datePicker.addEventListener("change", () => {
    loadAdminTimetable(datePicker.value);
  });
  
  // Initial load
  loadAdminTimetable(datePicker.value);
}

// Initialize timetable view
async function initTimetableView() {
  const timetableDiv = document.getElementById("adminTimetable");
  if (!timetableDiv) return;
  
  // Display loading initially
  timetableDiv.innerHTML = "Select a date to view timetable";
}

// Load admin timetable view
async function loadAdminTimetable(date) {
  const timetableDiv = document.getElementById("adminTimetable");
  if (!timetableDiv) return;
  
  timetableDiv.innerHTML = "Loading...";
  const r = await safeFetch(`${API_BASE}/api/admin/timetable?date=${date}`);
  
  if (r.networkError) {
    timetableDiv.innerHTML = `<div class="error">Cannot reach backend at ${API_BASE}.</div>`;
    return;
  }
  
  if (!r.ok) {
    timetableDiv.innerHTML = `<div class="error">Failed to load timetable (status ${r.status}).</div>`;
    return;
  }
  
  timetableDiv.innerHTML = generateAdminTimetable(r.data || [], date);
}

// Generate admin timetable view
function generateAdminTimetable(slots, date) {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const PERIODS = [
    "09:00-09:50", "10:00-10:50", "11:00-11:50", "12:00-12:50",
    "01:00-01:50", "02:00-02:50", "03:00-03:50", "04:00-04:50"
  ];
  
  const labs = [...new Set(slots.map(s => s.lab_id))].sort((a, b) => a - b);
  
  if (labs.length === 0) {
    return `<p>No timetable data for ${formatDate(date)}</p>`;
  }
  
  let html = `<h3>Weekly Timetable for ${formatDate(date)}</h3>`;
  
  labs.forEach(labId => {
    const labName = slots.find(s => s.lab_id === labId)?.lab_name || `Lab ${labId}`;
    html += `<h4>${labName}</h4>`;
    
    html += `<table class="timetable-table"><tr><th>Day</th>`;
    PERIODS.forEach(p => html += `<th>${p}</th>`);
    html += `</tr>`;
    
    DAYS.forEach(day => {
      html += `<tr><td>${day}</td>`;
      for (let period = 1; period <= 8; period++) {
        const slot = slots.find(s => 
          s.lab_id === labId && 
          s.day === day && 
          s.period === period
        );
        
        let cellClass = '';
        let cellText = '';
        
        if (slot) {
          if (slot.status === "Booked") {
            cellClass = 'booked';
            cellText = `${slot.faculty_name || 'Faculty'} - ${slot.class_info || 'Class'}`;
          } else if (slot.status === "Regular") {
            cellClass = 'regular';
            cellText = slot.class_info || 'Regular';
          } else {
            cellClass = 'free';
            cellText = 'Free';
          }
        }
        
        html += `<td class="${cellClass}">${cellText}</td>`;
      }
      html += `</tr>`;
    });
    
    html += `</table>`;
  });
  
  return html;
}

// Delete lab function (exposed to global scope)
export async function deleteLab(labId, labName) {
  if (!confirm(`Delete lab "${labName}"? This will also delete all associated timetable slots!`)) {
    return;
  }
  
  const res = await safeFetch(`${API_BASE}/api/labs/${labId}`, {
    method: "DELETE"
  });
  
  if (res.ok && res.data?.success) {
    alert(`Lab "${labName}" deleted successfully`);
    await loadLabs();
  } else {
    alert(res.data?.message || `Failed to delete lab (status ${res.status})`);
  }
}