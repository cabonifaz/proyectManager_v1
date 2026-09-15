-- ============================================================
-- Soporte para migrar un proyecto entre tenants sin romper el
-- acceso de sus miembros originales.
-- Ejecutar DESPUES de scripts/project_branding.sql (usa p.logo_url/p.color_hex via p.*).
-- Reemplaza dos stored procedures existentes (DROP + CREATE, no se puede ALTER el cuerpo).
-- ============================================================

DROP PROCEDURE IF EXISTS `sp_project_list`;

DELIMITER $$

CREATE DEFINER=`dev_admin`@`%` PROCEDURE `sp_project_list`(
    IN p_tenant_id INT,
    IN p_status    VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_user_id   INT
)
BEGIN
    SELECT
        p.*,
        u.name AS manager_name,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        (SELECT COUNT(*)
         FROM project_members pm
         WHERE pm.project_id = p.id AND pm.user_id = p_user_id AND pm.deleted_at IS NULL) AS is_member,

        (SELECT COUNT(*) FROM backlog_items WHERE project_id = p.id AND deleted_at IS NULL) AS total_backlog,
        (SELECT COUNT(*) FROM backlog_items WHERE project_id = p.id AND status = 'completado' AND deleted_at IS NULL) AS completed_backlog,
        (SELECT COALESCE(ROUND(AVG(progress), 0), 0) FROM backlog_items WHERE project_id = p.id AND deleted_at IS NULL) AS avg_progress,
        (SELECT COALESCE(ROUND((COUNT(CASE WHEN status = 'completado' THEN 1 END) / NULLIF(COUNT(*), 0)) * 100, 0), 0) FROM backlog_items WHERE project_id = p.id AND deleted_at IS NULL) AS completion_pct,

        (SELECT number FROM sprints WHERE project_id = p.id AND status = 'activo' AND deleted_at IS NULL LIMIT 1) AS current_sprint_num,

        (SELECT COALESCE(ROUND(AVG(b.progress), 0), 0)
         FROM backlog_items b
         INNER JOIN sprints s ON b.sprint_num = s.number AND s.project_id = b.project_id
         WHERE b.project_id = p.id AND s.status = 'activo' AND b.deleted_at IS NULL AND s.deleted_at IS NULL
         LIMIT 1) AS sprint_progress,

        (SELECT COUNT(*) FROM observaciones o WHERE o.project_id = p.id AND o.deleted_at IS NULL) AS obs_total,
        (SELECT COUNT(*) FROM observaciones o WHERE o.project_id = p.id AND o.estado IN ('resuelta', 'cerrada') AND o.deleted_at IS NULL) AS obs_completadas

    FROM projects p
    LEFT JOIN users   u ON p.manager_id = u.id
    LEFT JOIN tenants t ON t.id = p.tenant_id
    WHERE p.deleted_at IS NULL
      AND (p_status IS NULL OR p.status = p_status)
      AND (
          p.tenant_id = p_tenant_id
          OR EXISTS (
              SELECT 1 FROM project_members pm2
              WHERE pm2.project_id = p.id AND pm2.user_id = p_user_id AND pm2.deleted_at IS NULL
          )
      )
      AND (
          (SELECT role FROM users WHERE id = p_user_id) = 'super_admin'
          OR EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.user_id = p_user_id AND pm.deleted_at IS NULL
          )
      )
    ORDER BY p.created_at DESC;
END$$

DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_observacion_list`;

DELIMITER $$

CREATE DEFINER=`dev_admin`@`%` PROCEDURE `sp_observacion_list`(
    IN p_tenant_id  INT,
    IN p_project_id INT,
    IN p_estado     VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_tipo       VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_search     VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_limit      INT,
    IN p_offset     INT
)
BEGIN
    -- p_tenant_id se mantiene en la firma por compatibilidad con el codigo que ya la llama,
    -- pero ya no se usa para filtrar: project_id es la clave real de acceso a una observacion
    -- (un proyecto puede migrar de tenant y sus observaciones viejas no deben desaparecer).
    SELECT
        o.id,
        o.project_id,
        o.backlog_item_id,
        o.tipo,
        o.prioridad,
        o.titulo,
        o.descripcion,
        o.estado,
        o.eta,
        o.entregado_at,
        o.created_by,
        o.created_at,
        o.updated_at,
        u.name  AS created_by_name,
        b.code  AS backlog_code,
        (SELECT COUNT(*) FROM observacion_asignaciones a WHERE a.observacion_id = o.id) AS total_asignaciones
    FROM observaciones o
    LEFT JOIN users         u ON u.id = o.created_by
    LEFT JOIN backlog_items b ON b.id = o.backlog_item_id
    WHERE o.project_id = p_project_id
      AND o.deleted_at IS NULL
      AND (p_estado IS NULL OR p_estado = '' OR FIND_IN_SET(o.estado, p_estado) > 0)
      AND (p_tipo   IS NULL OR p_tipo   = '' OR FIND_IN_SET(o.tipo,   p_tipo)   > 0)
      AND (
          p_search IS NULL
          OR o.titulo      LIKE CONCAT('%', p_search, '%')
          OR o.descripcion LIKE CONCAT('%', p_search, '%')
      )
    ORDER BY
        FIELD(o.estado, 'abierta', 'asignado', 'en_seguimiento', 'resuelta', 'cerrada'),
        o.prioridad DESC,
        o.eta IS NULL,
        o.eta ASC,
        o.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END$$

DELIMITER ;
