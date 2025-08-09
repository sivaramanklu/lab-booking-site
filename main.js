import { setupLoginForm } from './auth.js';
import { initDashboard } from './dashboard.js';

// Initialize based on current page
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('loginForm')) {
    setupLoginForm();
  }
  
  if (document.getElementById('labSelect')) {
    initDashboard();
  }
  
  // Add admin.js initialization here when needed
});

// Expose handlers to global scope
window.handleSlotClick = handleSlotClick;
window.handleSlotRightClick = handleSlotRightClick;
