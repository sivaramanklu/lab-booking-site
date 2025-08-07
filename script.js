document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const facultyId = document.getElementById("facultyId").value;
  const password = document.getElementById("password").value;

  // In next steps, we'll fetch this from backend
  if (facultyId === "admin" && password === "admin") {
    window.location.href = "dashboard.html";
  } else {
    document.getElementById("loginMsg").textContent = "Invalid credentials.";
  }
});
