-- ============================================================
-- Segundo checkbox por tarea del checklist: el desarrollador marca su
-- propio avance (completado_dev) sin afectar el porcentaje del ticket;
-- el check existente (completado) queda como la verificacion del
-- gestor/lider tecnico, que es el unico que sigue recalculando el
-- avance del ticket (igual que antes de este cambio).
-- ============================================================

ALTER TABLE backlog_item_tasks
  ADD COLUMN completado_dev    TINYINT(1) NOT NULL DEFAULT 0 AFTER completado,
  ADD COLUMN completado_dev_at DATETIME   DEFAULT NULL       AFTER completado_at;
