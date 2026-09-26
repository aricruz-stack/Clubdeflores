const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// --- Login / logout ---

router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminHash = req.app.locals.adminPasswordHash;

  if (usuario !== adminUser || !adminHash || !bcrypt.compareSync(password || '', adminHash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/sesion', (req, res) => {
  res.json({ autenticado: !!(req.session && req.session.isAdmin) });
});

// A partir de aca, todas las rutas requieren sesion de admin
router.use(requireAdmin);

// --- Membresias ---

router.get('/membresias', (req, res) => {
  const rows = db.prepare('SELECT * FROM membresias ORDER BY creada_en DESC').all();
  res.json(rows);
});

router.post('/membresias', (req, res) => {
  const { nombre, tipo, precio } = req.body || {};
  if (!nombre || !['semanal', 'quincenal', 'mensual'].includes(tipo)) {
    return res.status(400).json({ error: 'Nombre y tipo (semanal/quincenal/mensual) son requeridos' });
  }
  const info = db.prepare('INSERT INTO membresias (nombre, tipo, precio) VALUES (?, ?, ?)').run(
    nombre, tipo, Number(precio) || 0
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/membresias/:id', (req, res) => {
  const { nombre, tipo, precio, activa } = req.body || {};
  const existing = db.prepare('SELECT * FROM membresias WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Membresía no encontrada' });

  db.prepare('UPDATE membresias SET nombre = ?, tipo = ?, precio = ?, activa = ? WHERE id = ?').run(
    nombre ?? existing.nombre,
    tipo ?? existing.tipo,
    precio === undefined ? existing.precio : Number(precio) || 0,
    activa === undefined ? existing.activa : (activa ? 1 : 0),
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/membresias/:id', (req, res) => {
  db.prepare('DELETE FROM membresias WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Fechas de entrega ---

router.get('/fechas', (req, res) => {
  const { membresia_id } = req.query;
  let rows;
  if (membresia_id) {
    rows = db.prepare('SELECT * FROM fechas_entrega WHERE membresia_id = ? ORDER BY fecha ASC').all(membresia_id);
  } else {
    rows = db.prepare('SELECT * FROM fechas_entrega ORDER BY fecha ASC').all();
  }
  res.json(rows);
});

router.post('/fechas', (req, res) => {
  const { membresia_id, fecha, cupo_maximo } = req.body || {};
  if (!membresia_id || !fecha) {
    return res.status(400).json({ error: 'membresia_id y fecha son requeridos' });
  }
  const info = db.prepare(
    'INSERT INTO fechas_entrega (membresia_id, fecha, cupo_maximo) VALUES (?, ?, ?)'
  ).run(membresia_id, fecha, cupo_maximo || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/fechas/:id', (req, res) => {
  db.prepare('DELETE FROM fechas_entrega WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Socios ---

router.get('/socios', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, m.nombre AS membresia_nombre, m.tipo AS membresia_tipo,
           f.fecha AS entrega_actual_fecha
    FROM socios s
    LEFT JOIN membresias m ON m.id = s.membresia_id
    LEFT JOIN fechas_entrega f ON f.id = s.entrega_actual_id
    ORDER BY s.creado_en DESC
  `).all();
  res.json(rows);
});

router.post('/socios', (req, res) => {
  const { codigo_socio, dni, nombre, apellido, membresia_id, fecha_vencimiento } = req.body || {};
  if (!codigo_socio || !dni || !nombre || !apellido) {
    return res.status(400).json({ error: 'codigo_socio, dni, nombre y apellido son requeridos' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO socios (codigo_socio, dni, nombre, apellido, membresia_id, fecha_vencimiento)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(codigo_socio, dni, nombre, apellido, membresia_id || null, fecha_vencimiento || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe un socio con ese código' });
    }
    res.status(500).json({ error: 'Error al crear el socio' });
  }
});

router.put('/socios/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM socios WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Socio no encontrado' });

  const { dni, nombre, apellido, membresia_id, fecha_vencimiento, activo } = req.body || {};
  db.prepare(`
    UPDATE socios SET dni = ?, nombre = ?, apellido = ?, membresia_id = ?, fecha_vencimiento = ?, activo = ?
    WHERE id = ?
  `).run(
    dni ?? existing.dni,
    nombre ?? existing.nombre,
    apellido ?? existing.apellido,
    membresia_id === undefined ? existing.membresia_id : membresia_id,
    fecha_vencimiento === undefined ? existing.fecha_vencimiento : fecha_vencimiento,
    activo === undefined ? existing.activo : (activo ? 1 : 0),
    req.params.id
  );
  res.json({ ok: true });
});

// Marca la cuota pagada: la membresía (sea semanal, quincenal o mensual en
// la frecuencia de entrega) siempre se cobra por mes, así que renovar suma
// siempre un mes desde hoy o desde el vencimiento actual si todavía no venció.
const DIAS_CICLO_PAGO = 30;

router.post('/socios/:id/renovar', (req, res) => {
  const socio = db.prepare('SELECT * FROM socios WHERE id = ?').get(req.params.id);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });

  if (!socio.membresia_id) {
    return res.status(400).json({ error: 'El socio no tiene una membresía asignada' });
  }

  const hoy = new Date();
  const vencimientoActual = socio.fecha_vencimiento ? new Date(socio.fecha_vencimiento) : null;
  const base = vencimientoActual && vencimientoActual > hoy ? vencimientoActual : hoy;

  base.setDate(base.getDate() + DIAS_CICLO_PAGO);
  const nuevaFecha = base.toISOString().slice(0, 10);

  db.prepare('UPDATE socios SET fecha_vencimiento = ? WHERE id = ?').run(nuevaFecha, req.params.id);
  res.json({ ok: true, fecha_vencimiento: nuevaFecha });
});

router.delete('/socios/:id', (req, res) => {
  db.prepare('DELETE FROM socios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
