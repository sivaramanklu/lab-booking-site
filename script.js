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
