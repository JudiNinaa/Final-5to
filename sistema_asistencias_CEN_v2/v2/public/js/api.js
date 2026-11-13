// Cliente Fetch hacia el backend Express (/api). Guarda la sesión (JWT) en localStorage.
const K = 'cen_sesion';
export const sesion = () => { try { return JSON.parse(localStorage.getItem(K)); } catch { return null; } };
export const entrar = d => localStorage.setItem(K, JSON.stringify(d));
export const salir = () => { localStorage.removeItem(K); location.hash = ''; location.reload(); };

export async function api(ruta, { method = 'GET', body } = {}) {
  const s = sesion();
  const r = await fetch('/api' + ruta, {
    method,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && s && ruta !== '/login') return salir();
  if (!r.ok) throw new Error(d.error || 'Error de servidor');
  return d;
}
