-- ============================================================
-- Fix critico: el frontend de Sprint usaba sprint_items.id como si
-- fuera backlog_items.id para editar el ticket, sus columnas tecnicas
-- y su checklist/tareas. Como son secuencias independientes, esto
-- podia fallar con "no encontrado" o, peor, pisar datos de OTRO
-- ticket cuyo id coincidiera por casualidad.
-- Se agrega backlog_item_id (la clave real) al resultado, y de paso
-- el modulo del ticket (bi.module), que hoy nunca llegaba porque
-- sprint_items no tiene esa columna propia.
--
-- FIX ADICIONAL CRITICO: el procedure (ya desde antes de este cambio)
-- hacia LEFT JOIN a `sprint_item_tech`, tabla que ya no existe (fue
-- renombrada a z_deprecated_sprint_item_tech). Esto rompia con error
-- SQL la carga de items de Sprint para cualquier proyecto con columnas
-- tecnicas configuradas. El dato real hoy vive en sprint_item_tech_users
-- (usuarios asignados por columna); se quita la referencia a la tabla
-- muerta y los campos value/progress que ya no existen en ningun lado.
--
-- Reemplaza el stored procedure existente (DROP + CREATE, no se puede
-- ALTER el cuerpo).
-- ============================================================

DROP PROCEDURE IF EXISTS `sp_sprint_items_list`;

DELIMITER $$

CREATE DEFINER=`dev_admin`@`%` PROCEDURE `sp_sprint_items_list`(
    IN p_tenant_id        INT UNSIGNED,
    IN p_project_id       INT UNSIGNED,
    IN p_sprint_id        INT UNSIGNED,
    IN p_status           VARCHAR(20)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_priority         INT,
    IN p_assigned_user_id INT UNSIGNED,
    IN p_limit            SMALLINT,
    IN p_offset           INT
)
BEGIN
    IF p_sprint_id IS NULL THEN
        SELECT id INTO p_sprint_id FROM sprints
        WHERE project_id = p_project_id AND status = 'activo' AND deleted_at IS NULL LIMIT 1;
    END IF;

    SELECT
        si.id, si.backlog_item_id, si.code, si.description, si.sprint_num,
        si.status, si.priority, si.reg_date, si.review_date, si.eta,
        si.created_at, si.created_by, si.updated_at, si.updated_by,
        bi.module AS module,
        (SELECT COUNT(*) FROM observaciones o
         WHERE o.backlog_item_id = si.backlog_item_id
           AND o.estado IN ('abierta','en_seguimiento','asignado')
           AND o.deleted_at IS NULL) AS obs_count,
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'col_key',        pc.col_key,
                    'col_name',       pc.name,
                    'assigned_users', (
                        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'name', u.name, 'role', u.role))
                        FROM sprint_item_tech_users situ
                        INNER JOIN users u ON u.id = situ.user_id
                        WHERE situ.sprint_item_id = si.id
                          AND situ.column_id      = pc.id
                          AND situ.deleted_at IS NULL
                    )
                )
            )
            FROM project_columns pc
            WHERE pc.project_id = si.project_id
              AND pc.active     = 1
              AND pc.col_type IN ('sprint','both')
              AND pc.deleted_at IS NULL
        ) AS tech_columns
    FROM sprint_items si
    INNER JOIN sprints  s  ON s.id  = si.sprint_id  AND s.deleted_at IS NULL
    INNER JOIN projects p  ON p.id  = si.project_id AND p.tenant_id = p_tenant_id AND p.deleted_at IS NULL
    LEFT JOIN  backlog_items bi ON bi.id = si.backlog_item_id AND bi.deleted_at IS NULL
    WHERE si.sprint_id  = p_sprint_id
      AND si.project_id = p_project_id
      AND si.deleted_at IS NULL
      AND (p_status   IS NULL OR si.status   = p_status)
      AND (p_priority IS NULL OR si.priority = p_priority)
      AND (p_assigned_user_id IS NULL OR EXISTS (
          SELECT 1 FROM sprint_item_tech_users situ
          WHERE situ.sprint_item_id = si.id AND situ.user_id = p_assigned_user_id AND situ.deleted_at IS NULL
      ))
    GROUP BY si.id
    ORDER BY
        CASE WHEN si.status = 'completado' OR si.priority = 0 THEN 1 ELSE 0 END ASC,
        si.priority ASC,
        si.eta      ASC,
        si.code     ASC
    LIMIT p_limit OFFSET p_offset;
END$$

DELIMITER ;
