// Backend Express (API REST) - se ejecuta local con "npm start" y en Vercel como función.
import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase as db } from './config.js';

const SECRET = process.env.JWT_SECRET || 'cambiar-este-secreto';
const STAFF = ['creador', 'directivo'];
const ROLES = ['creador', 'directivo', 'preceptor', 'profesor', 'alumno'];
const app = express();
app.use(express.json());

// ---------- utilidades ----------
const ok = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const fail = (c, m) => { const e = new Error(m); e.status = c; throw e; };
const wrap = f => (q, s) => f(q, s).catch(e => { console.error(e.message); s.status(e.status || 500).json({ error: e.message }); });
const staff = u => STAFF.includes(u.rol);
const rol = (...r) => (q, s, n) => (r.includes(q.u.rol) ? n() : s.status(403).json({ error: 'No tenés permiso para esta acción.' }));
const hoy = () => new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '') || fail(400, 'Fecha inválida');
const wd = f => { const d = new Date(f + 'T00:00:00Z').getUTCDay(); return d > 0 && d < 6; };
const dif = f => Math.round((new Date(hoy() + 'T00:00:00Z') - new Date(f + 'T00:00:00Z')) / 864e5);
const editable = (u, f) => u.rol !== 'alumno' && wd(f) && (staff(u) || (dif(f) >= 0 && dif(f) <= 30));
const token = (u, extra = false) => {
  const p = { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, extra };
  return { token: jwt.sign(p, SECRET, { expiresIn: '8h' }), user: p };
};

// ---------- autenticación ----------
app.post('/api/login', wrap(async (q, s) => {
  const u = ok(await db.from('usuarios').select('*').eq('usuario', String(q.body.usuario || '').trim()).maybeSingle());
  if (!u || !bcrypt.compareSync(String(q.body.clave || ''), u.clave)) fail(401, 'Usuario o contraseña incorrectos.');
  s.json(token(u));
}));
app.use('/api', (q, s, n) => {
  try { q.u = jwt.verify((q.headers.authorization || '').slice(7), SECRET); n(); }
  catch { s.status(401).json({ error: 'Sesión inválida' }); }
});
app.post('/api/habilitar', rol('profesor'), wrap(async (q, s) => {
  const u = ok(await db.from('usuarios').select('clave_extra').eq('id', q.u.id).single());
  if (!u.clave_extra || !bcrypt.compareSync(String(q.body.clave || ''), u.clave_extra)) fail(403, 'Clave de habilitación incorrecta.');
  s.json(token(q.u, true));
}));

// ---------- acceso a divisiones ----------
async function divsAcc(u) {
  const all = ok(await db.from('divisiones').select('*').order('anio').order('nombre'));
  if (staff(u) || (u.rol === 'profesor' && u.extra)) return all;
  if (u.rol === 'alumno') {
    const a = ok(await db.from('alumnos').select('division_id').eq('usuario_id', u.id).maybeSingle());
    const d = all.find(x => x.id === a?.division_id);
    return d ? all.filter(x => x.anio === d.anio) : [];
  }
  const as = ok(await db.from('asignaciones').select('division_id').eq('usuario_id', u.id)).map(x => x.division_id);
  return all.filter(x => as.includes(x.id));
}
async function destDivs(u) {
  if (u.rol === 'alumno') { const a = ok(await db.from('alumnos').select('division_id').eq('usuario_id', u.id).maybeSingle()); return a ? [a.division_id] : []; }
  if (staff(u)) return ok(await db.from('divisiones').select('id')).map(x => x.id);
  return ok(await db.from('asignaciones').select('division_id').eq('usuario_id', u.id)).map(x => x.division_id);
}
const divOk = async (q, id) => (await divsAcc(q.u)).find(x => x.id === +id) || fail(403, 'División no habilitada para tu usuario.');
const anioOk = async (q, a) => (await divsAcc(q.u)).some(d => d.anio === +a) || fail(403, 'Año no habilitado.');

// ---------- inicio / contactos ----------
async function contactos(u, divs) {
  const an = u.rol === 'alumno' ? new Set(divs.map(d => d.anio)) : null;
  const us = ok(await db.from('usuarios').select('id,nombre,telefono,rol').in('rol', ['preceptor', 'profesor']).order('nombre'));
  const as = ok(await db.from('asignaciones').select('usuario_id,divisiones(anio,nombre)'));
  const dc = ok(await db.from('docencia').select('usuario_id,materias(id,anio,nombre)'));
  return {
    preceptoras: us.filter(x => x.rol === 'preceptor').map(x => ({
      id: x.id, nombre: x.nombre, telefono: x.telefono,
      cursos: as.filter(a => a.usuario_id === x.id).map(a => a.divisiones).filter(d => !an || an.has(d.anio)).map(d => d.anio + '.' + d.nombre).sort()
    })).filter(x => !an || x.cursos.length),
    profesores: us.filter(x => x.rol === 'profesor').map(x => ({
      id: x.id, nombre: x.nombre, telefono: u.rol === 'alumno' ? null : x.telefono,
      materias: dc.filter(d => d.usuario_id === x.id).map(d => d.materias).filter(m => !an || an.has(m.anio))
    })).filter(x => !an || x.materias.length)
  };
}
app.get('/api/home', wrap(async (q, s) => {
  const d = await divsAcc(q.u);
  s.json({ anios: [...new Set(d.map(x => x.anio))], sinLeer: (await avisosDe(q.u)).filter(a => a.nuevo).length, ...(await contactos(q.u, d)) });
}));
app.get('/api/contactos', rol('creador', 'directivo', 'preceptor', 'profesor'), wrap(async (q, s) => s.json(await contactos(q.u, await divsAcc(q.u)))));
app.put('/api/contactos/:id', rol('creador', 'directivo', 'preceptor', 'profesor'), wrap(async (q, s) => {
  const id = +q.params.id;
  if (!staff(q.u) && id !== q.u.id) fail(403, 'Solo podés editar tus propios datos.');
  const { nombre, telefono, materias } = q.body;
  if (!String(nombre || '').trim()) fail(400, 'El nombre es obligatorio.');
  ok(await db.from('usuarios').update({ nombre: nombre.trim(), telefono: telefono || null }).eq('id', id).in('rol', ['preceptor', 'profesor']));
  if (staff(q.u) && Array.isArray(materias)) {
    ok(await db.from('docencia').delete().eq('usuario_id', id));
    if (materias.length) ok(await db.from('docencia').insert(materias.map(m => ({ usuario_id: id, materia_id: +m }))));
  }
  s.json({ ok: true });
}));
app.get('/api/divisiones', wrap(async (q, s) => s.json(await divsAcc(q.u))));
app.get('/api/materias', wrap(async (q, s) => s.json(ok(await db.from('materias').select('*').order('anio').order('nombre')))));
app.post('/api/materias', rol(...STAFF), wrap(async (q, s) => {
  if (!q.body.nombre?.trim()) fail(400, 'Nombre obligatorio');
  s.json(ok(await db.from('materias').insert({ anio: +q.body.anio, nombre: q.body.nombre.trim() }).select().single()));
}));

// ---------- división ----------
app.get('/api/division/:id', wrap(async (q, s) => {
  const division = await divOk(q, q.params.id);
  const alumnos = ok(await db.from('alumnos').select('id,nombre').eq('division_id', division.id).order('nombre'));
  const materias = ok(await db.from('materias').select('*').eq('anio', division.anio).order('nombre'));
  s.json({ division, alumnos, materias, puedeHorario: ['creador', 'directivo', 'preceptor'].includes(q.u.rol) });
}));
app.put('/api/division/:id/horario', rol('creador', 'directivo', 'preceptor'), wrap(async (q, s) => {
  await divOk(q, q.params.id);
  ok(await db.from('divisiones').update({ horario_url: q.body.url || null }).eq('id', q.params.id));
  s.json({ ok: true });
}));

// ---------- asistencia de alumnos ----------
app.get('/api/asistencia', wrap(async (q, s) => {
  const { div, fecha, mat = 0 } = q.query; fechaOk(fecha); await divOk(q, div);
  const al = ok(await db.from('alumnos').select('id,nombre').eq('division_id', div).order('nombre'));
  const as = al.length ? ok(await db.from('asistencias').select('alumno_id,estado').eq('fecha', fecha).eq('materia_id', mat).in('alumno_id', al.map(a => a.id))) : [];
  s.json({ habil: wd(fecha), editable: editable(q.u, fecha), alumnos: al.map(a => ({ ...a, estado: as.find(x => x.alumno_id === a.id)?.estado || 'P' })) });
}));
app.post('/api/asistencia', rol('creador', 'directivo', 'preceptor', 'profesor'), wrap(async (q, s) => {
  const { div, fecha, mat = 0, estados = {} } = q.body; fechaOk(fecha); await divOk(q, div);
  if (!editable(q.u, fecha)) fail(403, 'Esa fecha no se puede editar (día no hábil o fuera de período).');
  const al = ok(await db.from('alumnos').select('id').eq('division_id', div)).map(a => a.id);
  const rows = Object.entries(estados).filter(([id, e]) => al.includes(+id) && ['P', 'A', 'T', 'R'].includes(e))
    .map(([id, estado]) => ({ alumno_id: +id, fecha, materia_id: +mat, estado }));
  if (rows.length) ok(await db.from('asistencias').upsert(rows, { onConflict: 'alumno_id,fecha,materia_id' }));
  s.json({ ok: true });
}));
app.get('/api/asistencia/mensual', wrap(async (q, s) => {
  const { div, mes, mat = 0 } = q.query; await divOk(q, div);
  if (!/^\d{4}-\d{2}$/.test(mes || '')) fail(400, 'Mes inválido');
  const [y, m] = mes.split('-').map(Number), sig = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const al = ok(await db.from('alumnos').select('id,nombre').eq('division_id', div).order('nombre'));
  const as = al.length ? ok(await db.from('asistencias').select('alumno_id,fecha,estado').eq('materia_id', mat).gte('fecha', mes + '-01').lt('fecha', sig).in('alumno_id', al.map(a => a.id))) : [];
  s.json(al.map(a => {
    const r = { nombre: a.nombre, sem: [0, 0, 0, 0, 0], A: 0, T: 0, R: 0 };
    as.filter(x => x.alumno_id === a.id && wd(x.fecha)).forEach(x => { r[x.estado] !== undefined && r[x.estado]++; if (x.estado === 'A') r.sem[Math.floor((+x.fecha.slice(8) - 1) / 7)]++; });
    return r;
  }));
}));

// ---------- libro de temas / exámenes ----------
const libroRow = async (q) => { const r = ok(await db.from('libro').select('*').eq('id', q.params.id).maybeSingle()) || fail(404, 'No existe'); await divOk(q, r.division_id); return r; };
app.get('/api/libro', wrap(async (q, s) => {
  const { div, tipo, mat } = q.query; await divOk(q, div);
  let c = db.from('libro').select('*,materia:materias(nombre),autor:usuarios(nombre)').eq('division_id', div).eq('tipo', tipo === 'examen' ? 'examen' : 'tema').order('fecha', { ascending: false }).order('id', { ascending: false });
  if (mat) c = c.eq('materia_id', mat);
  s.json(ok(await c));
}));
app.post('/api/libro', rol('creador', 'directivo', 'preceptor', 'profesor'), wrap(async (q, s) => {
  const b = q.body; fechaOk(b.fecha); await divOk(q, b.div);
  if (!b.texto?.trim()) fail(400, 'El texto es obligatorio.');
  s.json(ok(await db.from('libro').insert({ division_id: +b.div, materia_id: +b.materia_id, tipo: b.tipo === 'examen' ? 'examen' : 'tema', fecha: b.fecha, texto: b.texto.trim(), autor_id: q.u.id }).select().single()));
}));
app.put('/api/libro/:id', rol('creador', 'directivo', 'preceptor', 'profesor'), wrap(async (q, s) => {
  const r = await libroRow(q); if (!staff(q.u) && r.autor_id !== q.u.id) fail(403, 'Solo podés editar tus anotaciones.');
  fechaOk(q.body.fecha); if (!q.body.texto?.trim()) fail(400, 'El texto es obligatorio.');
  ok(await db.from('libro').update({ fecha: q.body.fecha, texto: q.body.texto.trim(), materia_id: +q.body.materia_id }).eq('id', r.id)); s.json({ ok: true });
}));
app.delete('/api/libro/:id', rol(...STAFF), wrap(async (q, s) => { const r = await libroRow(q); ok(await db.from('libro').delete().eq('id', r.id)); s.json({ ok: true }); }));

// ---------- notas ----------
const notaRow = async (q) => { const r = ok(await db.from('notas').select('*,alumno:alumnos(division_id)').eq('id', q.params.id).maybeSingle()) || fail(404, 'No existe'); await divOk(q, r.alumno.division_id); return r; };
app.get('/api/notas', wrap(async (q, s) => {
  await divOk(q, q.query.div);
  let c = db.from('notas').select('*,alumno:alumnos!inner(nombre,division_id,usuario_id),materia:materias(nombre)').eq('alumno.division_id', q.query.div).order('fecha', { ascending: false });
  if (q.u.rol === 'alumno') c = c.eq('alumno.usuario_id', q.u.id);
  s.json(ok(await c));
}));
const notaVal = b => { const n = +b.nota; if (!b.titulo?.trim() || !(n >= 1 && n <= 10)) fail(400, 'Completá el trabajo y una nota entre 1 y 10.'); return { titulo: b.titulo.trim(), nota: n, materia_id: +b.materia_id }; };
app.post('/api/notas', rol('creador', 'directivo', 'profesor'), wrap(async (q, s) => {
  await divOk(q, q.body.div);
  const al = ok(await db.from('alumnos').select('id').eq('id', q.body.alumno_id).eq('division_id', q.body.div).maybeSingle()) || fail(400, 'Alumno inválido');
  s.json(ok(await db.from('notas').insert({ ...notaVal(q.body), alumno_id: al.id, fecha: hoy(), prof_id: q.u.id }).select().single()));
}));
app.put('/api/notas/:id', rol('creador', 'directivo', 'profesor'), wrap(async (q, s) => {
  const r = await notaRow(q); if (!staff(q.u) && r.prof_id !== q.u.id) fail(403, 'Solo podés editar tus notas.');
  ok(await db.from('notas').update(notaVal(q.body)).eq('id', r.id)); s.json({ ok: true });
}));
app.delete('/api/notas/:id', rol(...STAFF), wrap(async (q, s) => { const r = await notaRow(q); ok(await db.from('notas').delete().eq('id', r.id)); s.json({ ok: true }); }));

// ---------- calendario ----------
const calRow = async (q) => { const r = ok(await db.from('calendario').select('*').eq('id', q.params.id).maybeSingle()) || fail(404, 'No existe'); await anioOk(q, r.anio); return r; };
const calVal = b => { fechaOk(b.fecha); if (!['sin_clases', 'recreacion', 'otro'].includes(b.tipo)) fail(400, 'Tipo inválido'); return { fecha: b.fecha, tipo: b.tipo, descripcion: (b.descripcion || '').slice(0, 200) }; };
app.get('/api/calendario', wrap(async (q, s) => {
  await anioOk(q, q.query.anio); const [y, m] = q.query.mes.split('-').map(Number);
  s.json(ok(await db.from('calendario').select('*').eq('anio', q.query.anio).gte('fecha', q.query.mes + '-01').lt('fecha', new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)).order('fecha')));
}));
app.post('/api/calendario', rol('creador', 'directivo', 'preceptor'), wrap(async (q, s) => { await anioOk(q, q.body.anio); s.json(ok(await db.from('calendario').insert({ anio: +q.body.anio, ...calVal(q.body) }).select().single())); }));
app.put('/api/calendario/:id', rol('creador', 'directivo', 'preceptor'), wrap(async (q, s) => { const r = await calRow(q); ok(await db.from('calendario').update(calVal(q.body)).eq('id', r.id)); s.json({ ok: true }); }));
app.delete('/api/calendario/:id', rol('creador', 'directivo', 'preceptor'), wrap(async (q, s) => { const r = await calRow(q); ok(await db.from('calendario').delete().eq('id', r.id)); s.json({ ok: true }); }));

// ---------- avisos ----------
async function avisosDe(u) {
  const ds = await destDivs(u); if (!ds.length) return [];
  const ids = [...new Set(ok(await db.from('aviso_dest').select('aviso_id').in('division_id', ds)).map(d => d.aviso_id))]; if (!ids.length) return [];
  const av = ok(await db.from('avisos').select('*,autor:usuarios(nombre)').in('id', ids).order('creado', { ascending: false }));
  const todos = ok(await db.from('aviso_dest').select('aviso_id,divisiones(anio,nombre)').in('aviso_id', ids));
  const leidos = ok(await db.from('avisos_leidos').select('aviso_id').eq('usuario_id', u.id)).map(x => x.aviso_id);
  return av.map(a => ({ ...a, autor: a.autor?.nombre, dest: todos.filter(t => t.aviso_id === a.id).map(t => t.divisiones.anio + '.' + t.divisiones.nombre).sort().join(', '), nuevo: a.autor_id !== u.id && !leidos.includes(a.id) }));
}
app.get('/api/avisos/count', wrap(async (q, s) => s.json({ n: (await avisosDe(q.u)).filter(a => a.nuevo).length })));
app.get('/api/avisos', wrap(async (q, s) => {
  const l = await avisosDe(q.u);
  const nuevos = l.filter(a => a.nuevo).map(a => ({ aviso_id: a.id, usuario_id: q.u.id }));
  if (nuevos.length) ok(await db.from('avisos_leidos').upsert(nuevos, { onConflict: 'aviso_id,usuario_id' }));
  const dd = await destDivs(q.u);
  s.json({ avisos: l, puede: ['creador', 'directivo', 'preceptor'].includes(q.u.rol), divisiones: (await divsAcc(q.u)).filter(d => dd.includes(d.id)) });
}));
app.post('/api/avisos', rol('creador', 'directivo', 'preceptor'), wrap(async (q, s) => {
  const b = q.body, perm = await destDivs(q.u), dv = (b.divs || []).map(Number).filter(d => perm.includes(d));
  if (!b.titulo?.trim() || !b.texto?.trim() || !dv.length) fail(400, 'Completá título, mensaje y elegí al menos un curso.');
  const a = ok(await db.from('avisos').insert({ autor_id: q.u.id, tipo: b.tipo === 'examen' ? 'examen' : 'mensaje', titulo: b.titulo.trim(), texto: b.texto.trim(), fecha_ref: b.fecha_ref || null }).select().single());
  ok(await db.from('aviso_dest').insert(dv.map(d => ({ aviso_id: a.id, division_id: d })))); s.json(a);
}));
app.delete('/api/avisos/:id', rol('creador', 'directivo', 'preceptor'), wrap(async (q, s) => {
  const a = ok(await db.from('avisos').select('autor_id').eq('id', q.params.id).maybeSingle()) || fail(404, 'No existe');
  if (!staff(q.u) && a.autor_id !== q.u.id) fail(403, 'Solo podés borrar tus avisos.');
  ok(await db.from('avisos').delete().eq('id', q.params.id)); s.json({ ok: true });
}));

// ---------- asistencia de profesores ----------
app.get('/api/asistprof', rol('creador', 'directivo', 'preceptor'), wrap(async (q, s) => {
  const { fecha, mes } = q.query; fechaOk(fecha);
  const pr = ok(await db.from('usuarios').select('id,nombre').eq('rol', 'profesor').order('nombre'));
  const as = ok(await db.from('asistencia_prof').select('usuario_id,estado').eq('fecha', fecha));
  const [y, m] = (mes || fecha.slice(0, 7)).split('-').map(Number), sig = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const mm = ok(await db.from('asistencia_prof').select('usuario_id,estado').gte('fecha', (mes || fecha.slice(0, 7)) + '-01').lt('fecha', sig));
  s.json({ habil: wd(fecha), editable: editable(q.u, fecha),
    lista: pr.map(p => ({ ...p, estado: as.find(x => x.usuario_id === p.id)?.estado || 'P' })),
    resumen: pr.map(p => ({ nombre: p.nombre, A: mm.filter(x => x.usuario_id === p.id && x.estado === 'A').length, T: mm.filter(x => x.usuario_id === p.id && x.estado === 'T').length })) });
}));
app.post('/api/asistprof', rol('creador', 'directivo', 'preceptor'), wrap(async (q, s) => {
  const { fecha, estados = {} } = q.body; fechaOk(fecha); if (!editable(q.u, fecha)) fail(403, 'Esa fecha no se puede editar.');
  const rows = Object.entries(estados).filter(([, e]) => ['P', 'A', 'T'].includes(e)).map(([id, estado]) => ({ usuario_id: +id, fecha, estado }));
  if (rows.length) ok(await db.from('asistencia_prof').upsert(rows, { onConflict: 'usuario_id,fecha' }));
  s.json({ ok: true });
}));

// ---------- administración de usuarios (CRUD) ----------
const uVal = (q, b, nuevo) => {
  if (!ROLES.includes(b.rol)) fail(400, 'Rol inválido');
  if (b.rol === 'creador' && q.u.rol !== 'creador') fail(403, 'Solo el creador puede crear otro creador.');
  if (!b.nombre?.trim() || !b.usuario?.trim() || (nuevo && !b.clave)) fail(400, 'Nombre, usuario y contraseña son obligatorios.');
  const r = { nombre: b.nombre.trim(), usuario: b.usuario.trim(), rol: b.rol, telefono: b.telefono || null };
  if (b.clave) r.clave = bcrypt.hashSync(b.clave, 10);
  if (b.clave_extra) r.clave_extra = bcrypt.hashSync(b.clave_extra, 10);
  return r;
};
async function vinculos(id, b) {
  if (b.rol === 'alumno' && b.division_id) {
    const e = ok(await db.from('alumnos').select('id').eq('usuario_id', id).maybeSingle());
    if (e) ok(await db.from('alumnos').update({ nombre: b.nombre, division_id: +b.division_id }).eq('id', e.id));
    else ok(await db.from('alumnos').insert({ nombre: b.nombre, division_id: +b.division_id, usuario_id: id }));
  }
  if (Array.isArray(b.cursos)) {
    ok(await db.from('asignaciones').delete().eq('usuario_id', id));
    if (b.cursos.length && ['preceptor', 'profesor'].includes(b.rol)) ok(await db.from('asignaciones').insert(b.cursos.map(c => ({ usuario_id: id, division_id: +c }))));
  }
}
const dupe = e => { throw e.message.includes('duplicate') ? Object.assign(new Error('Ese nombre de usuario ya existe.'), { status: 409 }) : e; };
app.get('/api/usuarios', rol(...STAFF), wrap(async (q, s) => s.json(ok(await db.from('usuarios').select('id,usuario,nombre,rol,telefono').order('rol').order('nombre')))));
app.get('/api/usuarios/:id', rol(...STAFF), wrap(async (q, s) => {
  const u = ok(await db.from('usuarios').select('id,usuario,nombre,rol,telefono').eq('id', q.params.id).maybeSingle()) || fail(404, 'No existe');
  const cursos = ok(await db.from('asignaciones').select('division_id').eq('usuario_id', u.id)).map(x => x.division_id);
  const a = ok(await db.from('alumnos').select('division_id').eq('usuario_id', u.id).maybeSingle());
  s.json({ ...u, cursos, division_id: a?.division_id || '' });
}));
app.post('/api/usuarios', rol(...STAFF), wrap(async (q, s) => {
  const row = uVal(q, q.body, true);
  const u = ok(await db.from('usuarios').insert(row).select('id').single().then(r => r.error ? dupe(r.error) : r));
  await vinculos(u.id, q.body); s.json({ id: u.id });
}));
app.put('/api/usuarios/:id', rol(...STAFF), wrap(async (q, s) => {
  const row = uVal(q, q.body, false);
  const prev = ok(await db.from('usuarios').select('rol').eq('id', q.params.id).maybeSingle()) || fail(404, 'No existe');
  if (prev.rol === 'creador' && q.u.rol !== 'creador') fail(403, 'No podés modificar al creador.');
  const r = await db.from('usuarios').update(row).eq('id', q.params.id); if (r.error) dupe(r.error);
  await vinculos(+q.params.id, q.body); s.json({ ok: true });
}));
app.delete('/api/usuarios/:id', rol(...STAFF), wrap(async (q, s) => {
  const u = ok(await db.from('usuarios').select('rol').eq('id', q.params.id).maybeSingle()) || fail(404, 'No existe');
  if (u.rol === 'creador') fail(403, 'No se puede eliminar al creador.');
  ok(await db.from('usuarios').delete().eq('id', q.params.id)); s.json({ ok: true });
}));

app.use('/api', (q, s) => s.status(404).json({ error: 'Ruta no encontrada' }));

// ---------- arranque local (en Vercel lo ejecuta la plataforma) ----------
if (!process.env.VERCEL) {
  const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');
  app.use(express.static(pub));
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Sistema C.E.N. en http://localhost:${port}`));
}
export default app;
