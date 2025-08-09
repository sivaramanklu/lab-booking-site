// Date formatting
export function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// Lab select management
export async function reloadLabSelect(API_BASE, preserveSelection = true) {
  const sel = document.getElementById('labSelect');
  if (!sel) return false;

  try {
    const currentValue = sel.value;
    const r = await safeFetch(`${API_BASE}/api/labs`);
    
    if (r.networkError) {
      sel.innerHTML = `<option value="">(Cannot reach backend)</option>`;
      return false;
    }
    
    if (!r.ok) {
      sel.innerHTML = `<option value="">(Failed to load labs)</option>`;
      return false;
    }
    
    const labs = r.data || [];
    sel.innerHTML = labs.map(l => 
      `<option value="${l.id}">${l.name}</option>`
    ).join('');
    
    if (sel.options.length > 0) {
      if (preserveSelection && currentValue && 
          [...sel.options].some(o => o.value === currentValue)) {
        // Preserve the current selection
        sel.value = currentValue;
      } else {
        // Select the first option by default
        sel.value = sel.options[0].value;
      }
    }
    
    return true;
  } catch (e) {
    console.error("Lab select error:", e);
    sel.innerHTML = `<option value="">(Load error)</option>`;
    return false;
  }
}