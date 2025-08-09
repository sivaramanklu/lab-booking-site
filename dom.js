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
export async function reloadLabSelect(API_BASE) {
  const sel = document.getElementById('labSelect');
  if (!sel) return false;

  try {
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
      const prev = sel.value;
      if (prev && [...sel.options].some(o => o.value === prev)) {
        sel.value = prev;
      } else {
        sel.value = sel.options[0].value;
      }
      sel.dispatchEvent(new Event('change'));
    }
    
    return true;
  } catch (e) {
    console.error("Lab select error:", e);
    sel.innerHTML = `<option value="">(Load error)</option>`;
    return false;
  }
}
