import { setupLoginForm } from './auth.js';
import { initDashboard } from './dashboard.js';
import { initAdmin, deleteLab } from './admin.js';

// Initialize based on current page
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('loginForm')) {
    setupLoginForm();
  }
  
  if (document.getElementById('labSelect')) {
    initDashboard();
  }
  
  if (document.getElementById('adminTimetable')) {
    initAdmin();
  }
});

// Expose handlers to global scope
window.handleSlotClick = handleSlotClick;
window.handleSlotRightClick = handleSlotRightClick;
window.deleteLab = deleteLab;