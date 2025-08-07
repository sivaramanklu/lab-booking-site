// ===== Shared =====
const user = JSON.parse(localStorage.getItem("user"));

// ===== Login Page Logic =====
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

// ===== Dashboard Page Logic =====
const labSelect = document.getElementById("labSelect");
const timetableDiv = document.getElementById("timetable");

if (labSelect && timetableDiv && user) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const periods = [
    "09:00-09:50", "10:00-10:50", "11:00-11:50", "12:00-12:50",
    "01:00-01:50", "02:00-02:50", "03:00-03:50", "04:00-04:50"
  ];

  labSelect.addEventListener("change", () => {
    loadTimetable(labSelect.value);
  });

  loadLabs();

  async function loadLabs() {
    const res = await fetch("http://127.0.0.1:5000/api/labs");
    const labs = await res.json();
    labSelect.innerHTML = labs.map(lab => `<option value="${lab.id}">${lab.name}</option>`).join('');
    loadTimetable(labs[0].id);
  }

  async function loadTimetable(labId) {
    const res = await fetch(`http://127.0.0.1:5000/api/timetable/${labId}`);
    const slots = await res.json();
    timetableDiv.innerHTML = generateTable(slots);
  }

  function generateTable(slots) {
    let html = `<table border="1"><tr><th>Day</th>`;
    periods.forEach(p => html += `<th>${p}</th>`);
    html += `</tr>`;

    days.forEach(day => {
      html += `<tr><td>${day}</td>`;
      for (let period = 1; period <= 8; period++) {
        const slot = slots.find(s => s.day === day && s.period === period);
        if (!slot) {
          html += `<td></td>`;
          continue;
        }

        let cellText = slot.status;
        let color = "#eee";

        if (slot.status === "Regular") {
          cellText = `Regular<br>${slot.class_info || ""}`;
          color = "#dddddd";
        } else if (slot.status === "Booked") {
          const isAdminBooking = slot.faculty_name?.toLowerCase() === "admin";
          cellText = isAdminBooking
            ? "Booked"
            : `Booked by ${slot.faculty_name}<br>(${slot.class_info || "N/A"})`;
          color = "#ffdddd";
        } else {
          cellText = "Free";
          color = "#d4f8d4";
        }

        const canClick = (slot.status === "Free") ||
          (slot.status === "Booked" && (slot.faculty_id === user.user_id || user.is_admin));

        const canRightClick = user.is_admin && slot.status !== "Booked";

        html += `<td 
          style="background:${color};cursor:${canClick ? 'pointer' : 'default'}"
          onclick="${canClick ? `handleClick(${slot.id}, '${slot.status}')` : ''}"
          oncontextmenu="${canRightClick ? `handleRightClick(event, ${slot.id}, '${slot.status}')` : ''}">
          ${cellText}
        </td>`;
      }
      html += `</tr>`;
    });

    html += `</table>`;
    return html;
  }
}

// ===== Booking & Release Handler =====
async function handleClick(slotId, status) {
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) return;

  if (status === "Free") {
    const classInfo = prompt("Enter class info (e.g., 2nd Year A):");
    if (!classInfo) return;
    const res = await fetch("http://127.0.0.1:5000/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: slotId,
        faculty_id: user.user_id,
        class_info: classInfo
      })
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById("labSelect") && loadTimetable(document.getElementById("labSelect").value);
    } else {
      alert(result.message);
    }
  } else {
    if (!confirm("Release this booking?")) return;
    const res = await fetch("http://127.0.0.1:5000/api/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: slotId,
        faculty_id: user.user_id,
        is_admin: user.is_admin
      })
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById("labSelect") && loadTimetable(document.getElementById("labSelect").value);
    } else {
      alert(result.message);
    }
  }
}

// Admin Right-Click: Toggle Free ↔ Regular and enter description
async function handleRightClick(e, slotId, currentStatus) {
  e.preventDefault(); // prevent browser context menu

  const targetStatus = currentStatus === "Regular" ? "Free" : "Regular";
  let classInfo = null;

  if (targetStatus === "Regular") {
    classInfo = prompt("Enter reason/class info for regular slot (e.g., II-Sec-E):");
    if (!classInfo) return; // cancel if empty
  }

  const res = await fetch("http://127.0.0.1:5000/api/block", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slot_id: slotId,
      status: targetStatus,
      class_info: classInfo
    })
  });

  const result = await res.json();
  if (result.success) {
    document.getElementById("labSelect") && loadTimetable(document.getElementById("labSelect").value);
  } else {
    alert(result.message || "Failed to update slot.");
  }
}

// ===== Logout Button =====
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.clear();
      window.location.href = "index.html";
    });
  }
});
