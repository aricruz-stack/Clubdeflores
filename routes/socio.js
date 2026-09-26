const express = require('express');
const db = require('../db');
const { requireSocio } = require('../middleware/auth');

const router = express.Router();

function socioPublico(s) {
  return {
    id: s.id,
    codigo_socio: s.codigo_socio,
    nombre: s.nombre,
    apellido: s.apellido,
    fecha_vencimiento: s.fecha_vencimiento,
    foto: s.foto || null,
    membresia_id: s.membresia_id,
    membresia_nombre: s.membresia_nombre,
    membresia_tipo: s.membresia_tipo,
    membresia_precio: s.membresia_precio,
    entrega_actual_id: s.entrega_actual_id,
    entrega_actual_fecha: s.entrega_actual_fecha
  };
}

router.post('/login', (req, res) => {
  const { codigo_socio, dni } = req.body || {};
  if (!codigo_socio || !dni) {
    return res.status(400).json({ error: 'Código de socio y DNI son requeridos' });
  }

  const socio = db.prepare(`
    SELECT s.*, m.nombre AS membresia_nombre, m.tipo AS membresia_tipo, m.precio AS membresia_precio,
           f.fecha AS entrega_actual_fecha
    FROM socios s
    LEFT JOIN membresias m ON m.id = s.membresia_id
    LEFT JOIN fechas_entrega f ON f.id = s.entrega_actual_id
    WHERE s.codigo_socio = ? AND s.dni = ? AND s.activo = 1
  `).get(codigo_socio.trim(), dni.trim());

  if (!socio) {
    return res.status(401).json({ error: 'Código de socio o DNI incorrectos' });
  }

  req.session.socioId = socio.id;
  res.json({ ok: true, socio: socioPublico(socio) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireSocio, (req, res) => {
  const socio = db.prepare(`
    SELECT s.*, m.nombre AS membresia_nombre, m.tipo AS membresia_tipo, m.precio AS membresia_precio,
           f.fecha AS entrega_actual_fecha
    FROM socios s
    LEFT JOIN membresias m ON m.id = s.membresia_id
    LEFT JOIN fechas_entrega f ON f.id = s.entrega_actual_id
    WHERE s.id = ?
  `).get(req.session.socioId);

  if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
  res.json(socioPublico(socio));
});

// Fechas disponibles para la membresia del socio logueado (solo futuras, con cupo libre)
router.get('/fechas-disponibles', requireSocio, (req, res) => {
  const socio = db.prepare('SELECT * FROM socios WHERE id = ?').get(req.session.socioId);
  if (!socio || !socio.membresia_id) return res.json([]);

  const hoy = new Date().toISOString().slice(0, 10);

  const fechas = db.prepare(`
    SELECT * FROM fechas_entrega
    WHERE membresia_id = ? AND fecha >= ?
    ORDER BY fecha ASC
  `).all(socio.membresia_id, hoy);

  const conCupo = fechas.map(f => {
    let ocupadas = 0;
    if (f.cupo_maximo !== null && f.cupo_maximo !== undefined) {
      ocupadas = db.prepare('SELECT COUNT(*) AS c FROM socios WHERE entrega_actual_id = ?').get(f.id).c;
    }
    return {
      ...f,
      disponible: f.cupo_maximo === null || f.cupo_maximo === undefined || ocupadas < f.cupo_maximo
    };
  });

  res.json(conCupo);
});

router.post('/seleccionar-fecha', requireSocio, (req, res) => {
  const { fecha_entrega_id } = req.body || {};
  const socio = db.prepare('SELECT * FROM socios WHERE id = ?').get(req.session.socioId);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });

  const fecha = db.prepare('SELECT * FROM fechas_entrega WHERE id = ?').get(fecha_entrega_id);
  if (!fecha || fecha.membresia_id !== socio.membresia_id) {
    return res.status(400).json({ error: 'Esa fecha no corresponde a tu membresía' });
  }

  if (fecha.cupo_maximo !== null && fecha.cupo_maximo !== undefined) {
    const ocupadas = db.prepare(
      'SELECT COUNT(*) AS c FROM socios WHERE entrega_actual_id = ? AND id != ?'
    ).get(fecha.id, socio.id).c;
    if (ocupadas >= fecha.cupo_maximo) {
      return res.status(409).json({ error: 'Esa fecha ya no tiene cupo disponible' });
    }
  }

  db.prepare('UPDATE socios SET entrega_actual_id = ? WHERE id = ?').run(fecha.id, socio.id);
  res.json({ ok: true });
});

// La foto llega ya recortada y redimensionada desde el navegador (canvas),
// como data URL en base64, para no depender de una librería de imágenes en
// el servidor. Point de referencia: ~300x300 en JPEG pesa unos pocos KB.
const FOTO_MAX_BYTES = 900 * 1024; // margen prudente sobre el límite de json del server

router.post('/foto', requireSocio, (req, res) => {
  const { foto } = req.body || {};
  if (!foto || typeof foto !== 'string' || !foto.startsWith('data:image/')) {
    return res.status(400).json({ error: 'La foto debe enviarse como imagen (data URL) válida' });
  }
  if (foto.length > FOTO_MAX_BYTES) {
    return res.status(413).json({ error: 'La imagen es demasiado grande' });
  }

  db.prepare('UPDATE socios SET foto = ? WHERE id = ?').run(foto, req.session.socioId);
  res.json({ ok: true });
});

router.delete('/foto', requireSocio, (req, res) => {
  db.prepare('UPDATE socios SET foto = NULL WHERE id = ?').run(req.session.socioId);
  res.json({ ok: true });
});

module.exports = router;
