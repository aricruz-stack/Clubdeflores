const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'floreria.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS membresias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('semanal','quincenal','mensual')),
  precio REAL NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1,
  creada_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fechas_entrega (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  membresia_id INTEGER NOT NULL REFERENCES membresias(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  cupo_maximo INTEGER,
  creada_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS socios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_socio TEXT NOT NULL UNIQUE,
  dni TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  membresia_id INTEGER REFERENCES membresias(id) ON DELETE SET NULL,
  fecha_vencimiento TEXT,
  foto TEXT,
  entrega_actual_id INTEGER REFERENCES fechas_entrega(id) ON DELETE SET NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fechas_membresia ON fechas_entrega(membresia_id);
CREATE INDEX IF NOT EXISTS idx_socios_membresia ON socios(membresia_id);
`);

module.exports = db;
