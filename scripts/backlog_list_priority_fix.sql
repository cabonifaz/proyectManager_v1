-- ============================================================
-- Fix: sp_backlog_list mostraba la prioridad de un ticket leyendola de
-- sprint_items, cruzando por sprint_num (si.sprint_num = bi.sprint_num).
-- Si un ticket se movio de sprint (se edito bi.sprint_num) sin que su
-- fila en sprint_items se actualizara (ese campo nunca se sincroniza
-- ahi), el cruce dejaba de calzar y la prioridad se mostraba como "—"
-- aunque el ticket SI tenia una prioridad real guardada en
-- backlog_items.priority (la que de hecho usa la validacion de
-- duplicados y el reordenamiento). Ahora se lee directo de
-- backlog_items.priority, la fuente real, sin depender de ese cruce.
-- Reemplaza el stored procedure existente (DROP + CREATE, no se puede
-- ALTER el cuerpo).
-- ============================================================

DROP PROCEDURE IF EXISTS `sp_backlog_list`;

DELIMITER $$

CREATE DEFINER=`dev_admin`@`%` PROCEDURE `sp_backlog_list`(
    IN p_tenant_id   INT UNSIGNED,
    IN p_project_id  INT UNSIGNED,
    IN p_status      VARCHAR(20)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_sprint_num  SMALLINT,
    IN p_search      VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_limit       SMALLINT,
    IN p_offset      INT,
    IN p_user_id     INT UNSIGNED
)
BEGIN
    SELECT
        bi.id, bi.code, bi.module, bi.description,
        bi.progress, bi.status, bi.sprint_num,
        MAX(COALESCE(si.eta, bi.eta)) AS eta,
        bi.priority AS priority,
        MAX(si.review_date) AS review_date,
        bi.reg_date, bi.comment,
        bi.created_at, bi.created_by, bi.updated_at, bi.updated_by,
        (SELECT COUNT(id) FROM observaciones obs
         WHERE obs.backlog_item_id = bi.id
           AND obs.estado IN ('abierta', 'en_seguimiento')
           AND obs.deleted_at IS NULL) AS obs_count,
        (SELECT COUNT(id) FROM backlog_item_tasks bitasks
         WHERE bitasks.backlog_item_id = bi.id AND bitasks.deleted_at IS NULL) AS task_count,
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'col_key', pc.col_key,
                'name',    pc.name,
                'value',   COALESCE((
                    SELECT GROUP_CONCAT(u.name SEPARATOR ', ')
                    FROM sprint_item_tech_users situ
                    INNER JOIN users u ON u.id = situ.user_id
                    WHERE situ.backlog_item_id = bi.id AND situ.column_id = pc.id AND situ.deleted_at IS NULL
                ), ''),
                'eta',     (
                    SELECT MAX(situ.eta)
                    FROM sprint_item_tech_users situ
                    WHERE situ.backlog_item_id = bi.id AND situ.column_id = pc.id AND situ.deleted_at IS NULL
                ),
                'assigned_users', (
                    SELECT JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'name', u.name, 'role', u.role))
                    FROM sprint_item_tech_users situ
                    INNER JOIN users u ON u.id = situ.user_id
                    WHERE situ.backlog_item_id = bi.id
                      AND situ.column_id = pc.id
                      AND situ.deleted_at IS NULL
                )
            )
        ) AS tech_columns
    FROM backlog_items bi
    INNER JOIN projects p ON p.id = bi.project_id AND p.tenant_id = p_tenant_id AND p.deleted_at IS NULL
    LEFT JOIN sprint_items si ON si.backlog_item_id = bi.id AND si.sprint_num = bi.sprint_num AND si.deleted_at IS NULL
    LEFT JOIN project_columns pc ON pc.project_id = bi.project_id AND pc.active = 1 AND pc.col_type IN ('backlog','both') AND pc.deleted_at IS NULL
    WHERE bi.project_id = p_project_id
      AND bi.deleted_at IS NULL
      AND (p_status IS NULL OR bi.status COLLATE utf8mb4_unicode_ci = p_status)
      AND (p_sprint_num IS NULL OR bi.sprint_num = p_sprint_num)
      AND (p_search IS NULL OR bi.description LIKE CONCAT('%', p_search, '%')
           OR bi.code LIKE CONCAT('%', p_search, '%')
           OR bi.module LIKE CONCAT('%', p_search, '%'))
      AND (
          p_user_id IS NULL
          OR bi.project_id IN (
              SELECT pm.project_id FROM project_members pm
              WHERE pm.user_id = p_user_id AND pm.deleted_at IS NULL
          )
      )
    GROUP BY bi.id
    ORDER BY bi.sprint_num ASC, bi.code ASC
    LIMIT p_limit OFFSET p_offset;
END$$

DELIMITER ;
