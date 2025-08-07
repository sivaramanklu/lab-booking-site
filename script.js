document.getElementById("loginForm").addEventListener("submit", async function (e) {
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
const user = JSON.parse(localStorage.getItem("user"));
const labSelect = document.getElementById("labSelect");
const timetableDiv = document.getElementById("timetable");

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const periods = [
  "09:00-09:50", "10:00-10:50", "11:00-11:50", "12:00-12:50",
  "01:00-01:50", "02:00-02:50", "03:00-03:50", "04:00-04:50"
];

// Load labs
async function loadLabs() {
  const res = await fetch("http://127.0.0.1:5000/api/labs");
  const labs = await res.json();
  labSelect.innerHTML = labs.map(lab => `<option value="${lab.id}">${lab.name}</option>`).join('');
  loadTimetable(labSelect.value);
}

labSelect.addEventListener("change", () => {
  loadTimetable(labSelect.value);
});

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
      if (slot.status === "Booked") {
        cellText = `Booked (${slot.class_info || "N/A"})`;
        color = "#ffc0cb";
      } else if (slot.status === "Regular") {
        color = "#bbb";
      } else {
        color = "#c0f0c0";
      }

      const canClick = (slot.status === "Free") || 
        (slot.status === "Booked" && (slot.faculty_id === user.user_id || user.is_admin));

      html += `<td style="background:${color};cursor:${canClick ? 'pointer' : 'default'}" 
                  onclick="${canClick ? `handleClick(${slot.id}, '${slot.status}')` : ''}">
                  ${cellText}
               </td>`;
    }
    html += `</tr>`;
  });

  html += `</table>`;
  return html;
}

async function handleClick(slotId, status) {
  if (status === "Free") {
    const classInfo = prompt("Enter class info (e.g., 2nd Year A):");
    if (!classInfo) return;
    const res = await fetch("http://127.0.0.1:5000/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, faculty_id: user.user_id, class_info: classInfo })
    });
    const result = await res.json();
    if (result.success) loadTimetable(labSelect.value);
    else alert(result.message);
  } else {
    if (!confirm("Release this booking?")) return;
    const res = await fetch("http://127.0.0.1:5000/api/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, faculty_id: user.user_id, is_admin: user.is_admin })
    });
    const result = await res.json();
    if (result.success) loadTimetable(labSelect.value);
    else alert(result.message);
  }
}

// Start
if (user) {
  loadLabs();
} else {
  window.location.href = "index.html";
}
