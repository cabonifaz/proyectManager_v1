-- ============================================================
-- Branding de tenants: logo y color de marca
-- Ejecutar en el schema de la base de datos del proyecto
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN logo_url  VARCHAR(255) NULL AFTER slug,
  ADD COLUMN color_hex CHAR(7)      NULL DEFAULT '#2563eb' AFTER logo_url;
