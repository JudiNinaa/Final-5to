// Formulario de alta (crear.html) y edición pre-rellenada (editar.html) de usuarios.
import { api, sesion } from './api.js';
const S = sesion();
if (!S || !['creador', 'directivo'].includes(S.user.rol)) location.href = 'index.html';
document.documentElement.dataset.bsTheme = localStorage.getItem('tema') || 'light';
const id = new URLSearchParams(location.search).get('id');
const f = document.getElementById('f'), msg = document.getElementById('msg');
const alerta = (t, c = 'danger') => msg.innerHTML = `<div class="alert alert-${c}">${t}</div>`;

const [divs, u] = await Promise.all([api('/divisiones'), id ? api('/usuarios/' + id) : Promise.resolve({ cursos: [] })]);
const ro = f.rol, dv = f.division_id;
dv.innerHTML = '<option value="">—</option>' + divs.map(d => `<option value="${d.id}">${d.anio}.${d.nombre}</option>`).join('');
document.getElementById('cursos').innerHTML = divs.map(d => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="cursos" value="${d.id}" id="c${d.id}" ${u.cursos.includes(d.id) ? 'checked' : ''}><label class="form-check-label" for="c${d.id}">${d.anio}.${d.nombre}</label></div>`).join('');
if (id) for (const k of ['nombre', 'usuario', 'telefono', 'rol', 'division_id']) f[k].value = u[k] ?? '';
const mostrar = () => {
  document.getElementById('bloque-alumno').hidden = ro.value !== 'alumno';
  document.getElementById('bloque-cursos').hidden = !['preceptor', 'profesor'].includes(ro.value);
  document.getElementById('bloque-extra').hidden = ro.value !== 'profesor';
};
ro.onchange = mostrar; mostrar();

f.onsubmit = async ev => {
  ev.preventDefault();
  const b = Object.fromEntries(new FormData(f)); b.cursos = [...f.querySelectorAll('[name=cursos]:checked')].map(c => +c.value);
  try {
    await api(id ? '/usuarios/' + id : '/usuarios', { method: id ? 'PUT' : 'POST', body: b });
    location.href = 'index.html#/admin';
  } catch (x) { alerta(x.message); }
};
