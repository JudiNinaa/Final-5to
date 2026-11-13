// Lógica del DOM e interfaz (SPA con rutas por hash). Todo dato viaja por api.js (Fetch).
import { api, sesion, entrar, salir } from './api.js';

const app = document.getElementById('app'), nav = document.getElementById('nav'), M = new bootstrap.Modal('#modal');
let U = sesion()?.user, Q = new URLSearchParams();
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const staff = () => ['creador', 'directivo'].includes(U.rol);
const noAlumno = () => U.rol !== 'alumno';
const hoy = () => new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
const msg = (t, tipo = 'success') => { document.getElementById('msg').innerHTML = `<div class="alert alert-${tipo} alert-dismissible">${e(t)}<button class="btn-close" data-bs-dismiss="alert"></button></div>`; scrollTo(0, 0); };
const limpiar = () => document.getElementById('msg').innerHTML = '';
const page = (t, h) => app.innerHTML = `<h1 class="titulo">${t}</h1>${h}`;
const volver = h => `<a class="btn btn-outline-secondary mt-3" href="#${h}">Volver</a>`;
const card = (h, t, s) => `<div class="col-sm-6 col-md-4"><a class="card-cen" href="${h}">${t}<small>${s}</small></a></div>`;
const form = (sel, fn) => app.querySelector(sel)?.addEventListener('submit', async ev => { ev.preventDefault(); try { await fn(Object.fromEntries(new FormData(ev.target)), ev.target); } catch (x) { msg(x.message, 'danger'); } });
const sel = (n, ops, v = '') => `<select class="form-select" name="${n}">${ops.map(([k, t]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${e(t)}</option>`).join('')}</select>`;
const accion = (q, fn) => app.querySelectorAll(q).forEach(b => b.onclick = async () => { try { await fn(b); } catch (x) { msg(x.message, 'danger'); } });

// ---- ventanas modales (confirmación y edición) ----
function modal(titulo, cuerpo, ok = 'Aceptar') {
  return new Promise(res => {
    const el = document.getElementById('modal'); let fin = false;
    el.querySelector('.modal-title').textContent = titulo; el.querySelector('.modal-body').innerHTML = cuerpo;
    const fn = v => { if (!fin) { fin = true; res(v); } };
    const b = document.getElementById('mok'); b.textContent = ok;
    b.onclick = () => { fn(el.querySelector('.modal-body')); M.hide(); };
    el.addEventListener('hidden.bs.modal', () => fn(null), { once: true }); M.show();
  });
}
const confirmar = async t => !!(await modal('Confirmar eliminación', `<p>${e(t)}</p>`, 'Sí, eliminar'));
async function dialogo(t, campos, v = {}) {
  const el = await modal(t, campos.map(c => `<label class="form-label mt-2">${c.l}</label>` + (c.o ? sel(c.n, c.o, v[c.n]) : c.a ? `<textarea class="form-control" name="${c.n}" rows="3">${e(v[c.n])}</textarea>` : `<input class="form-control" type="${c.t || 'text'}" name="${c.n}" value="${e(v[c.n])}" ${c.s ? `step="${c.s}"` : ''}>`)).join(''), 'Guardar');
  return el && Object.fromEntries([...el.querySelectorAll('[name]')].map(i => [i.name, i.value]));
}

// ---- barra de navegación ----
async function barra() {
  const n = (await api('/avisos/count')).n, a = (r, t) => `<a class="nav-link" href="#${r}">${t}</a>`;
  nav.innerHTML = `<span class="nav-link disabled text-warning-emphasis">${e(U.nombre)} (${U.rol})</span>${a('/', 'Inicio')}${a('/avisos', 'Avisos' + (n ? ` <span class="badge bg-danger">${n}</span>` : ''))}${noAlumno() ? a('/docentes', 'Docentes') : ''}${['creador', 'directivo', 'preceptor'].includes(U.rol) ? a('/asistprof', 'Asist. docentes') : ''}${staff() ? a('/admin', 'Administrar') : ''}<a class="nav-link" href="#" id="salir">Salir</a>`;
  document.getElementById('salir').onclick = ev => { ev.preventDefault(); salir(); };
}

// ---- vistas ----
function login() {
  nav.innerHTML = '';
  app.innerHTML = `<div class="login mx-auto text-center"><img src="img/logo-login.png" width="190" alt="Asistencias.Pro C.E.N."><h2 class="h4 mt-2">Ingreso al sistema</h2><form id="f"><input class="form-control mb-2" name="usuario" placeholder="Usuario" required autofocus><input class="form-control mb-2" type="password" name="clave" placeholder="Contraseña" required><button class="btn btn-cen w-100">Ingresar</button></form></div>`;
  form('#f', async v => { const d = await api('/login', { method: 'POST', body: v }); entrar(d); U = d.user; limpiar(); location.hash = '#/'; ir(); });
}

async function home() {
  const h = await api('/home');
  const pre = h.preceptoras.map(p => `<p class="mb-2"><b>${e(p.nombre)}</b><br>📞 ${e(p.telefono || 'sin cargar')}<br><small>Cursos: ${e(p.cursos.join(', '))}</small></p>`).join('');
  const pro = h.profesores.map(p => `<p class="mb-2"><b>${e(p.nombre)}</b><br><small>${e(p.materias.map(m => `${m.nombre} (${m.anio}°)`).join(', '))}</small></p>`).join('');
  page('Años', `<div class="row g-4"><div class="col-lg-8"><div class="row g-3">${h.anios.map(a => card('#/anio/' + a, a + '° año', '2 divisiones')).join('')}</div>
    ${U.rol === 'profesor' ? `<form id="hab" class="card p-3 mt-4 flex-row gap-2 flex-wrap align-items-center"><b>Habilitar otros cursos:</b><input class="form-control w-auto" type="password" name="clave" placeholder="Clave de habilitación" required><button class="btn btn-cen">Validar identidad</button></form>` : ''}</div>
    <aside class="col-lg-4"><div class="card p-3"><h3>Preceptoras</h3>${pre || '<p>—</p>'}<h3>Profesores</h3>${pro || '<p>—</p>'}${noAlumno() ? '<a class="btn btn-cen btn-sm" href="#/docentes">Ver / editar</a>' : ''}</div></aside></div>
    ${h.sinLeer ? `<a class="toast-cen" href="#/avisos">🔔 Tenés ${h.sinLeer} aviso${h.sinLeer > 1 ? 's' : ''} nuevo${h.sinLeer > 1 ? 's' : ''}</a>` : ''}`);
  form('#hab', async v => { const d = await api('/habilitar', { method: 'POST', body: v }); entrar(d); U = d.user; msg('Identidad validada: cursos adicionales habilitados.'); home(); });
}

async function anio(a) {
  const ds = (await api('/divisiones')).filter(d => d.anio == a);
  page(a + '° año', `<div class="row g-3">${ds.map(d => card('#/division/' + d.id, a + '.' + d.nombre, 'Ver listado y carpetas')).join('')}${card('#/calendario/' + a, 'Calendario', 'Sin clases y recreación')}</div>${volver('/')}`);
}

async function division(id) {
  const d = await api('/division/' + id), D = d.division;
  page(`Curso ${D.anio}.${D.nombre}`, `<div class="card p-3 mb-3"><b>Horario</b> <small>(tocá la imagen para agrandarla)</small>
    ${D.horario_url ? `<img id="hor" class="horario mt-2" src="${e(D.horario_url)}" alt="Horario del curso">` : '<p class="mb-0">Todavía no se cargó el horario.</p>'}
    ${d.puedeHorario ? `<form id="fh" class="input-group mt-2"><input class="form-control" type="url" name="url" placeholder="Enlace (URL) de la imagen del horario" value="${e(D.horario_url)}"><button class="btn btn-cen">Guardar</button></form>` : ''}</div>
    <div class="row g-3">${card('#/asistencia/' + id, 'Asistencias', 'Diaria y análisis mensual')}${card('#/libro/' + id + '/tema', 'Libro de temas', 'Por materia')}${card('#/libro/' + id + '/examen', 'Libro de exámenes', 'Materia, día y temas')}${card('#/notas/' + id, 'Notas', 'Planilla de calificaciones')}${card('#/calendario/' + D.anio, 'Calendario', 'Sin clases y recreación')}</div>
    <h2 class="h4 mt-4">Alumnos</h2><ul class="list-group">${d.alumnos.map(a => `<li class="list-group-item">${e(a.nombre)}</li>`).join('')}</ul>${volver('/anio/' + D.anio)}`);
  app.querySelector('#hor')?.addEventListener('click', ev => ev.target.classList.toggle('full'));
  form('#fh', async v => { await api(`/division/${id}/horario`, { method: 'PUT', body: v }); msg('Horario guardado.'); division(id); });
}

async function asistencia(id) {
  const f = Q.get('f') || hoy(), m = Q.get('m') || f.slice(0, 7), mat = Q.get('mat') || 0;
  const [D, a, men] = await Promise.all([api('/division/' + id), api(`/asistencia?div=${id}&fecha=${f}&mat=${mat}`), api(`/asistencia/mensual?div=${id}&mes=${m}&mat=${mat}`)]);
  const E = { P: 'Presente', A: 'Ausente', T: 'Tardanza', R: 'Retiro' };
  page(`Asistencias ${D.division.anio}.${D.division.nombre}`, `<form id="fv" class="card p-3 mb-3 flex-row flex-wrap gap-2 align-items-center"><input class="form-control w-auto" type="date" name="f" value="${f}">${sel('mat', [[0, 'General (preceptoría)'], ...D.materias.map(x => [x.id, x.nombre])], mat).replace('class="form-select"', 'class="form-select w-auto"')}<input type="hidden" name="m" value="${m}"><button class="btn btn-cen">Ver</button></form>
    ${!a.habil ? '<div class="alert alert-warning">Se toma asistencia de lunes a viernes. Elegí un día hábil.</div>' : `<form id="fa" class="card p-3 mb-3"><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Alumno</th><th>Estado</th></tr></thead><tbody>${a.alumnos.map(x => `<tr><td>${e(x.nombre)}</td><td>${Object.entries(E).map(([k, l]) => `<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="e_${x.id}" value="${k}" id="r${x.id}${k}" ${x.estado === k ? 'checked' : ''} ${a.editable ? '' : 'disabled'}><label class="form-check-label" for="r${x.id}${k}">${l}</label></div>`).join('')}</td></tr>`).join('')}</tbody></table></div>${a.editable ? '<div><button class="btn btn-cen">Guardar asistencia</button></div>' : '<div class="alert alert-info mb-0">Solo lectura.</div>'}</form>`}
    <h2 class="h4">Análisis de ${m}</h2><div class="card p-3"><div class="table-responsive"><table class="table"><thead><tr><th>Alumno</th><th>Sem 1</th><th>Sem 2</th><th>Sem 3</th><th>Sem 4</th><th>Sem 5</th><th>Inasist.</th><th>Tardanzas</th><th>Retiros</th></tr></thead><tbody>${men.map(r => `<tr><td>${e(r.nombre)}</td>${r.sem.map(s => `<td>${s}</td>`).join('')}<td><b>${r.A}</b></td><td>${r.T}</td><td>${r.R}</td></tr>`).join('')}</tbody></table></div>
    <form id="fm" class="d-flex gap-2"><input class="form-control w-auto" type="month" name="m" value="${m}"><button class="btn btn-cen">Analizar</button></form></div>${volver('/division/' + id)}`);
  form('#fv', v => location.hash = `#/asistencia/${id}?f=${v.f}&mat=${v.mat}&m=${v.f.slice(0, 7)}`);
  form('#fm', v => location.hash = `#/asistencia/${id}?f=${f}&mat=${mat}&m=${v.m}`);
  form('#fa', async v => { const estados = {}; Object.entries(v).forEach(([k, x]) => estados[k.slice(2)] = x); await api('/asistencia', { method: 'POST', body: { div: id, fecha: f, mat, estados } }); msg('Asistencia guardada.'); });
}

async function libro(id, t) {
  const mat = Q.get('mat') || '';
  const [D, L] = await Promise.all([api('/division/' + id), api(`/libro?div=${id}&tipo=${t}&mat=${mat}`)]);
  const mo = D.materias.map(x => [x.id, x.nombre]);
  page((t === 'tema' ? 'Libro de temas ' : 'Libro de exámenes ') + `${D.division.anio}.${D.division.nombre}`, `<div class="mb-3"><a class="btn btn-sm ${mat ? 'btn-outline-secondary' : 'btn-cen'} m-1" href="#/libro/${id}/${t}">Todas</a>${D.materias.map(x => `<a class="btn btn-sm ${mat == x.id ? 'btn-cen' : 'btn-outline-secondary'} m-1" href="#/libro/${id}/${t}?mat=${x.id}">${e(x.nombre)}</a>`).join('')}</div>
    ${noAlumno() ? `<form id="fl" class="card p-3 mb-3"><div class="row g-2"><div class="col-md-6">${sel('materia_id', mo, mat)}</div><div class="col-md-6"><input class="form-control" type="date" name="fecha" value="${hoy()}" required></div><div class="col-12"><textarea class="form-control" name="texto" rows="3" required placeholder="${t === 'tema' ? 'Tema dado en clase / anotación' : 'Temas a evaluar'}"></textarea></div></div><div class="mt-2"><button class="btn btn-cen">Agregar al libro</button></div></form>` : ''}
    <div class="card p-3"><div class="table-responsive"><table class="table"><thead><tr><th>Fecha</th><th>Materia</th><th>${t === 'tema' ? 'Tema' : 'Temas a rendir'}</th><th>Autor</th>${noAlumno() ? '<th></th>' : ''}</tr></thead><tbody>${L.map(r => `<tr><td>${r.fecha}</td><td>${e(r.materia?.nombre)}</td><td>${e(r.texto).replace(/\n/g, '<br>')}</td><td>${e(r.autor?.nombre)}</td>${noAlumno() ? `<td class="text-nowrap">${staff() || r.autor_id === U.id ? `<button class="btn btn-sm btn-outline-primary" data-ed="${r.id}">Editar</button> ` : ''}${staff() ? `<button class="btn btn-sm btn-danger" data-del="${r.id}">Eliminar</button>` : ''}</td>` : ''}</tr>`).join('') || '<tr><td colspan="5">Sin registros.</td></tr>'}</tbody></table></div></div>${volver('/division/' + id)}`);
  form('#fl', async v => { await api('/libro', { method: 'POST', body: { ...v, div: id, tipo: t } }); msg('Agregado al libro.'); libro(id, t); });
  accion('[data-ed]', async b => { const r = L.find(x => x.id == b.dataset.ed), v = await dialogo('Editar registro', [{ n: 'materia_id', l: 'Materia', o: mo }, { n: 'fecha', l: 'Fecha', t: 'date' }, { n: 'texto', l: 'Contenido', a: 1 }], r); if (v) { await api('/libro/' + r.id, { method: 'PUT', body: v }); msg('Registro actualizado.'); libro(id, t); } });
  accion('[data-del]', async b => { if (await confirmar('¿Eliminar este registro del libro?')) { await api('/libro/' + b.dataset.del, { method: 'DELETE' }); msg('Registro eliminado.'); libro(id, t); } });
}

async function notas(id) {
  const [D, N] = await Promise.all([api('/division/' + id), api('/notas?div=' + id)]);
  const mo = D.materias.map(x => [x.id, x.nombre]), puede = ['creador', 'directivo', 'profesor'].includes(U.rol);
  page(`Notas ${D.division.anio}.${D.division.nombre}`, `${puede ? `<form id="fn" class="card p-3 mb-3"><div class="row g-2"><div class="col-md-3">${sel('alumno_id', D.alumnos.map(a => [a.id, a.nombre]))}</div><div class="col-md-3">${sel('materia_id', mo)}</div><div class="col-md-3"><input class="form-control" name="titulo" placeholder="Trabajo / proyecto" required></div><div class="col-md-2"><input class="form-control" type="number" step="0.5" min="1" max="10" name="nota" placeholder="Nota" required></div><div class="col-md-1"><button class="btn btn-cen">+</button></div></div></form>` : ''}
    <div class="card p-3"><div class="table-responsive"><table class="table"><thead><tr><th>Alumno</th><th>Materia</th><th>Trabajo</th><th>Nota</th><th>Fecha</th>${puede ? '<th></th>' : ''}</tr></thead><tbody>${N.map(r => `<tr><td>${e(r.alumno.nombre)}</td><td>${e(r.materia?.nombre)}</td><td>${e(r.titulo)}</td><td>${r.nota}</td><td>${r.fecha}</td>${puede ? `<td class="text-nowrap"><button class="btn btn-sm btn-outline-primary" data-ed="${r.id}">Editar</button> ${staff() ? `<button class="btn btn-sm btn-danger" data-del="${r.id}">Eliminar</button>` : ''}</td>` : ''}</tr>`).join('') || '<tr><td colspan="6">Sin notas.</td></tr>'}</tbody></table></div></div>${volver('/division/' + id)}`);
  form('#fn', async v => { await api('/notas', { method: 'POST', body: { ...v, div: id } }); msg('Nota cargada.'); notas(id); });
  accion('[data-ed]', async b => { const r = N.find(x => x.id == b.dataset.ed), v = await dialogo('Editar nota', [{ n: 'materia_id', l: 'Materia', o: mo }, { n: 'titulo', l: 'Trabajo' }, { n: 'nota', l: 'Nota', t: 'number', s: '0.5' }], r); if (v) { await api('/notas/' + r.id, { method: 'PUT', body: v }); msg('Nota actualizada.'); notas(id); } });
  accion('[data-del]', async b => { if (await confirmar('¿Eliminar esta nota?')) { await api('/notas/' + b.dataset.del, { method: 'DELETE' }); msg('Nota eliminada.'); notas(id); } });
}

async function calendario(a) {
  const m = Q.get('m') || hoy().slice(0, 7), ev = await api(`/calendario?anio=${a}&mes=${m}`), edit = ['creador', 'directivo', 'preceptor'].includes(U.rol);
  const T = { sin_clases: 'Sin clases', recreacion: 'Recreación', otro: 'Otro' }, p = new Date(m + '-01T00:00:00Z');
  const mv = n => new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + n, 1)).toISOString().slice(0, 7);
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dias = new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 0)).getUTCDate(), off = (p.getUTCDay() + 6) % 7;
  let celdas = '<td></td>'.repeat(off);
  for (let d = 1; d <= dias; d++) {
    const dt = `${m}-${String(d).padStart(2, '0')}`, w = (off + d - 1) % 7;
    celdas += `<td class="${w > 4 ? 'fin' : ''}"><b>${d}</b>${ev.filter(x => x.fecha === dt).map(x => `<span class="ev ${x.tipo}">${T[x.tipo]}${x.descripcion ? ': ' + e(x.descripcion) : ''}</span>`).join('')}</td>${w === 6 && d < dias ? '</tr><tr>' : ''}`;
  }
  page(`Calendario ${a}° año`, `<div class="d-flex align-items-center gap-3 mb-2"><a class="btn btn-cen" href="#/calendario/${a}?m=${mv(-1)}">◀</a><b class="fs-4">${meses[p.getUTCMonth()]} ${p.getUTCFullYear()}</b><a class="btn btn-cen" href="#/calendario/${a}?m=${mv(1)}">▶</a></div>
    <div class="card p-2 table-responsive"><table class="table table-bordered cal mb-0"><thead><tr><th>Lun</th><th>Mar</th><th>Mié</th><th>Jue</th><th>Vie</th><th>Sáb</th><th>Dom</th></tr></thead><tbody><tr>${celdas}</tr></tbody></table></div>
    ${edit ? `<form id="fc" class="card p-3 mt-3 flex-row flex-wrap gap-2"><b class="w-100">Agregar al calendario</b><input class="form-control w-auto" type="date" name="fecha" value="${m}-01" required>${sel('tipo', Object.entries(T)).replace('class="form-select"', 'class="form-select w-auto"')}<input class="form-control w-auto flex-grow-1" name="descripcion" maxlength="200" placeholder="Descripción breve"><button class="btn btn-cen">Agregar</button></form>
    <div class="mt-2">${ev.map(x => `<span class="d-inline-flex align-items-center gap-1 me-2 mb-1"><span class="ev ${x.tipo}">${x.fecha} ${T[x.tipo]}</span><button class="btn btn-sm btn-outline-primary" data-ed="${x.id}">Editar</button><button class="btn btn-sm btn-danger" data-del="${x.id}">Quitar</button></span>`).join('')}</div>` : ''}${volver('/anio/' + a)}`);
  form('#fc', async v => { await api('/calendario', { method: 'POST', body: { ...v, anio: a } }); msg('Agregado al calendario.'); calendario(a); });
  accion('[data-ed]', async b => { const r = ev.find(x => x.id == b.dataset.ed), v = await dialogo('Editar evento', [{ n: 'fecha', l: 'Fecha', t: 'date' }, { n: 'tipo', l: 'Tipo', o: Object.entries(T) }, { n: 'descripcion', l: 'Descripción' }], r); if (v) { await api('/calendario/' + r.id, { method: 'PUT', body: v }); msg('Evento actualizado.'); calendario(a); } });
  accion('[data-del]', async b => { if (await confirmar('¿Quitar este evento del calendario?')) { await api('/calendario/' + b.dataset.del, { method: 'DELETE' }); msg('Evento eliminado.'); calendario(a); } });
}

async function avisos() {
  const d = await api('/avisos'); barra();
  page('Avisos y recordatorios', `${d.puede ? `<form id="fa" class="card p-3 mb-3"><b>Nuevo aviso</b><div class="row g-2 mt-1"><div class="col-md-4">${sel('tipo', [['examen', 'Recordatorio de examen'], ['mensaje', 'Mensaje informativo']])}</div><div class="col-md-5"><input class="form-control" name="titulo" placeholder="Título" required></div><div class="col-md-3"><input class="form-control" type="date" name="fecha_ref" title="Fecha del examen (opcional)"></div><div class="col-12"><textarea class="form-control" name="texto" rows="3" placeholder="Mensaje" required></textarea></div><div class="col-12"><b>Enviar a:</b> ${d.divisiones.map(x => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="divs" value="${x.id}" id="d${x.id}"><label class="form-check-label" for="d${x.id}">${x.anio}.${x.nombre}</label></div>`).join('')}</div></div><div class="mt-2"><button type="button" class="btn btn-outline-secondary" id="todos">Marcar todos</button> <button class="btn btn-cen">Publicar aviso</button></div></form>` : ''}
    ${d.avisos.map(a => `<div class="card p-3 mb-2"><b>${a.tipo === 'examen' ? '📝' : '📢'} ${e(a.titulo)} ${a.nuevo ? '<span class="badge bg-danger">NUEVO</span>' : ''}</b><small>${e(a.autor)} · ${new Date(a.creado).toLocaleString('es-AR')} · Para: ${e(a.dest)}${a.fecha_ref ? ' · Fecha: ' + a.fecha_ref : ''}</small><p class="mb-2 mt-2">${e(a.texto).replace(/\n/g, '<br>')}</p>${d.puede && (staff() || a.autor_id === U.id) ? `<div><button class="btn btn-sm btn-danger" data-del="${a.id}">Borrar</button></div>` : ''}</div>`).join('') || '<div class="alert alert-secondary">No hay avisos.</div>'}`);
  document.getElementById('todos')?.addEventListener('click', () => app.querySelectorAll('[name=divs]').forEach(c => c.checked = true));
  app.querySelector('#fa')?.addEventListener('submit', async ev => { ev.preventDefault(); try { const v = Object.fromEntries(new FormData(ev.target)); v.divs = [...app.querySelectorAll('[name=divs]:checked')].map(c => +c.value); await api('/avisos', { method: 'POST', body: v }); msg('Aviso publicado.'); avisos(); } catch (x) { msg(x.message, 'danger'); } });
  accion('[data-del]', async b => { if (await confirmar('¿Borrar este aviso?')) { await api('/avisos/' + b.dataset.del, { method: 'DELETE' }); msg('Aviso eliminado.'); avisos(); } });
}

async function docentes() {
  const [c, ms] = await Promise.all([api('/contactos'), api('/materias')]);
  const fila = (p, tipo) => { const ed = staff() || p.id === U.id; return `<form class="card p-3 mb-2" data-id="${p.id}"><b>${tipo}</b><div class="row g-2 mt-1"><div class="col-md-5"><input class="form-control" name="nombre" value="${e(p.nombre)}" ${ed ? '' : 'readonly'}></div><div class="col-md-4"><input class="form-control" name="telefono" placeholder="Teléfono" value="${e(p.telefono)}" ${ed ? '' : 'readonly'}></div>${ed ? '<div class="col-md-3"><button class="btn btn-cen w-100">Guardar</button></div>' : ''}</div>
    ${p.materias ? (staff() ? `<details class="mt-2"><summary>Materias que dicta</summary>${ms.map(m => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="mats" value="${m.id}" id="m${p.id}_${m.id}" ${p.materias.some(x => x.id === m.id) ? 'checked' : ''}><label class="form-check-label" for="m${p.id}_${m.id}">${m.anio}° ${e(m.nombre)}</label></div>`).join('')}</details>` : `<small class="mt-2">Materias: ${e(p.materias.map(m => `${m.nombre} (${m.anio}°)`).join(', '))}</small>`) : `<small class="mt-2">Cursos: ${e(p.cursos.join(', '))}</small>`}</form>`; };
  page('Preceptoras y profesores', c.preceptoras.map(p => fila(p, 'Preceptor/a')).join('') + c.profesores.map(p => fila(p, 'Profesor/a')).join('') + volver('/'));
  app.querySelectorAll('form[data-id]').forEach(f => f.addEventListener('submit', async ev => { ev.preventDefault(); try { const v = Object.fromEntries(new FormData(f)); const body = { nombre: v.nombre, telefono: v.telefono }; if (f.querySelector('details')) body.materias = [...f.querySelectorAll('[name=mats]:checked')].map(x => +x.value); await api('/contactos/' + f.dataset.id, { method: 'PUT', body }); msg('Datos guardados.'); } catch (x) { msg(x.message, 'danger'); } }));
}

async function asistprof() {
  const f = Q.get('f') || hoy(), m = Q.get('m') || f.slice(0, 7), d = await api(`/asistprof?fecha=${f}&mes=${m}`), E = { P: 'Presente', A: 'Ausente', T: 'Tardanza' };
  page('Asistencia de profesores', `<form id="fv" class="card p-3 mb-3 flex-row gap-2"><input class="form-control w-auto" type="date" name="f" value="${f}"><button class="btn btn-cen">Ver</button></form>
    ${!d.habil ? '<div class="alert alert-warning">Elegí un día hábil (lunes a viernes).</div>' : `<form id="fa" class="card p-3 mb-3"><table class="table align-middle"><tbody>${d.lista.map(p => `<tr><td>${e(p.nombre)}</td><td>${Object.entries(E).map(([k, l]) => `<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="e_${p.id}" value="${k}" id="p${p.id}${k}" ${p.estado === k ? 'checked' : ''} ${d.editable ? '' : 'disabled'}><label class="form-check-label" for="p${p.id}${k}">${l}</label></div>`).join('')}</td></tr>`).join('')}</tbody></table>${d.editable ? '<div><button class="btn btn-cen">Guardar</button></div>' : '<div class="alert alert-info mb-0">Solo lectura.</div>'}</form>`}
    <h2 class="h4">Resumen de ${m}</h2><div class="card p-3"><table class="table"><thead><tr><th>Profesor</th><th>Ausencias</th><th>Tardanzas</th></tr></thead><tbody>${d.resumen.map(r => `<tr><td>${e(r.nombre)}</td><td>${r.A}</td><td>${r.T}</td></tr>`).join('')}</tbody></table></div>`);
  form('#fv', v => location.hash = `#/asistprof?f=${v.f}`);
  form('#fa', async v => { const estados = {}; Object.entries(v).forEach(([k, x]) => estados[k.slice(2)] = x); await api('/asistprof', { method: 'POST', body: { fecha: f, estados } }); msg('Asistencia de docentes guardada.'); });
}

async function admin() {
  const [us, ms] = await Promise.all([api('/usuarios'), api('/materias')]);
  page('Administración', `<div class="d-flex gap-2 mb-3"><a class="btn btn-cen" href="crear.html">➕ Nuevo usuario</a></div>
    <form id="fm" class="card p-3 mb-3 flex-row flex-wrap gap-2"><b class="w-100">Agregar materia</b>${sel('anio', [1, 2, 3, 4, 5, 6].map(x => [x, x + '° año'])).replace('class="form-select"', 'class="form-select w-auto"')}<input class="form-control w-auto flex-grow-1" name="nombre" placeholder="Nombre de la materia" required><button class="btn btn-cen">Agregar</button></form>
    <div class="card p-3"><div class="table-responsive"><table class="table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Teléfono</th><th></th></tr></thead><tbody>${us.map(u => `<tr><td>${e(u.nombre)}</td><td>${e(u.usuario)}</td><td>${u.rol}</td><td>${e(u.telefono)}</td><td class="text-nowrap"><a class="btn btn-sm btn-outline-primary" href="editar.html?id=${u.id}">Editar</a> ${u.rol !== 'creador' ? `<button class="btn btn-sm btn-danger" data-del="${u.id}">Eliminar</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`);
  form('#fm', async v => { await api('/materias', { method: 'POST', body: v }); msg('Materia agregada.'); });
  accion('[data-del]', async b => { if (await confirmar('¿Eliminar este usuario? No se puede deshacer.')) { await api('/usuarios/' + b.dataset.del, { method: 'DELETE' }); msg('Usuario eliminado.'); admin(); } });
}

// ---- enrutador ----
const rutas = [[/^\/?$/, home], [/^\/anio\/(\d)$/, anio], [/^\/division\/(\d+)$/, division], [/^\/asistencia\/(\d+)$/, asistencia], [/^\/libro\/(\d+)\/(tema|examen)$/, libro], [/^\/notas\/(\d+)$/, notas], [/^\/calendario\/(\d)$/, calendario], [/^\/avisos$/, avisos], [/^\/docentes$/, docentes], [/^\/asistprof$/, asistprof], [/^\/admin$/, admin]];
async function ir() {
  if (!U) return login();
  const [p, qs] = (location.hash.slice(1) || '/').split('?'); Q = new URLSearchParams(qs || ''); limpiar();
  try { await barra(); } catch (x) { return msg(x.message, 'danger'); }
  for (const [r, f] of rutas) { const m = p.match(r); if (m) { try { await f(...m.slice(1)); } catch (x) { app.innerHTML = `<div class="alert alert-danger">${e(x.message)}</div>`; } return; } }
  app.innerHTML = '<div class="alert alert-warning">Página no encontrada.</div>';
}
document.getElementById('tema').onclick = () => { const t = document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.bsTheme = t; localStorage.setItem('tema', t); };
addEventListener('hashchange', ir); ir();
