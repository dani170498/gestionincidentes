-- Esquema base para gestión de incidentes y soporte (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SOLICITANTE','SOPORTE','SUPERVISOR','ADMIN')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('SOLICITANTE','SOPORTE','SUPERVISOR','ADMIN')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,
  tipo_registro TEXT NOT NULL CHECK (tipo_registro IN ('INCIDENTE','SOPORTE')),
  solicitante TEXT NOT NULL,
  tipo_servicio TEXT NOT NULL,
  canal_oficina TEXT NOT NULL,
  gerencia TEXT NOT NULL,
  motivo_servicio TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  encargado TEXT NOT NULL,
  fecha_reporte DATE NOT NULL,
  hora_reporte TIME NOT NULL,
  fecha_respuesta DATE NOT NULL,
  hora_respuesta TIME NOT NULL,
  accion_tomada TEXT NOT NULL,
  primer_contacto BOOLEAN NOT NULL DEFAULT false,
  tiempo_minutos INTEGER NOT NULL,
  mes_atencion TEXT NOT NULL,
  categoria TEXT,
  porcentaje NUMERIC(5,2),
  regla_porcentaje TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('REGISTRADO','EN_ATENCION','RESPONDIDO','RESUELTO')),
  clasificacion TEXT,
  last_updated_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS status_logs (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  estado TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_actions (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  action_text TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  changes JSONB,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_service_types (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS catalog_channels (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS catalog_gerencias (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS catalog_motivos (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  service_type_id INTEGER NOT NULL REFERENCES catalog_service_types(id),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS catalog_categorias (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS kpi_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  rule JSONB NOT NULL,
  percentage NUMERIC(5,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','SENT','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
