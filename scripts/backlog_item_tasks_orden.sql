-- ============================================================
-- Soporte para reordenar por drag & drop las tareas/checklist de un
-- ticket. Se agrega una columna de orden explicita (antes el orden
-- era siempre por fecha de creacion, sin forma de cambiarlo) y se
-- backfillea con el orden actual (por created_at) para no alterar
-- el orden visible de las tareas ya existentes.
-- ============================================================

ALTER TABLE backlog_item_tasks
  ADD COLUMN orden INT NOT NULL DEFAULT 0 AFTER peso;

UPDATE backlog_item_tasks bt
INNER JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY backlog_item_id ORDER BY created_at ASC, id ASC) AS rn
  FROM backlog_item_tasks
  WHERE deleted_at IS NULL
) ranked ON ranked.id = bt.id
SET bt.orden = ranked.rn;
