-- ============================================================
-- sp_sprint_item_delete (accion "Quitar del sprint"):
-- - Igual que sp_sprint_items_list, hacia UPDATE sobre `sprint_item_tech`,
--   tabla que ya no existe (renombrada a z_deprecated_sprint_item_tech).
--   Nunca se pudo llamar sin error SQL. Se corrige a sprint_item_tech_users
--   (la tabla real de asignaciones).
-- - Ademas, quitar un ticket de un sprint dejaba backlog_items.sprint_num
--   intacto (el ticket seguia figurando como parte de ese sprint desde
--   Backlog) y no reordenaba las prioridades del resto de tickets del
--   sprint. Ahora limpia sprint_num/priority del ticket y reordena
--   automaticamente (decrementa) la prioridad de los demas.
-- Reemplaza el stored procedure existente (DROP + CREATE, no se puede
-- ALTER el cuerpo).
-- ============================================================

DROP PROCEDURE IF EXISTS `sp_sprint_item_delete`;

DELIMITER $$

CREATE DEFINER=`dev_admin`@`%` PROCEDURE `sp_sprint_item_delete`(
    IN  p_tenant_id  INT UNSIGNED,
    IN  p_item_id    INT UNSIGNED,
    IN  p_deleted_by INT UNSIGNED,
    OUT p_error      VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
)
BEGIN
    DECLARE v_backlog_item_id INT UNSIGNED;
    DECLARE v_project_id      INT UNSIGNED;
    DECLARE v_sprint_num      SMALLINT;
    DECLARE v_priority        INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 p_error = MESSAGE_TEXT;
        ROLLBACK;
    END;

    SET p_error = NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sprint_items si
        INNER JOIN projects p ON p.id = si.project_id
        WHERE si.id = p_item_id AND p.tenant_id = p_tenant_id AND si.deleted_at IS NULL
    ) THEN
        SET p_error = 'Item no encontrado o ya eliminado';
    ELSE
        SELECT backlog_item_id, project_id, sprint_num, priority
          INTO v_backlog_item_id, v_project_id, v_sprint_num, v_priority
        FROM sprint_items WHERE id = p_item_id;

        START TRANSACTION;
            UPDATE sprint_item_tech_users
            SET deleted_at = CURRENT_TIMESTAMP, deleted_by = p_deleted_by
            WHERE sprint_item_id = p_item_id AND deleted_at IS NULL;

            UPDATE sprint_items
            SET deleted_at = CURRENT_TIMESTAMP, deleted_by = p_deleted_by, updated_by = p_deleted_by
            WHERE id = p_item_id;

            UPDATE backlog_items
            SET sprint_num = NULL, priority = 0, updated_by = p_deleted_by, updated_at = CURRENT_TIMESTAMP
            WHERE id = v_backlog_item_id;

            IF v_priority > 0 AND v_sprint_num IS NOT NULL THEN
                UPDATE backlog_items
                SET priority = priority - 1
                WHERE project_id = v_project_id AND sprint_num = v_sprint_num
                  AND priority > v_priority AND status != 'completado' AND deleted_at IS NULL;

                UPDATE sprint_items
                SET priority = priority - 1
                WHERE project_id = v_project_id AND sprint_num = v_sprint_num
                  AND priority > v_priority AND status != 'completado' AND deleted_at IS NULL;
            END IF;
        COMMIT;
    END IF;
END$$

DELIMITER ;
