-- ============================================================
-- Fix: sp_backlog_update usaba COALESCE(p_sprint_num, sprint_num), lo
-- que significa que enviar sprint_num = NULL (para "sacar un ticket
-- del sprint") no tenia ningun efecto: COALESCE simplemente conservaba
-- el valor viejo. Nunca era posible quitar un ticket de su sprint.
-- Se agrega p_sprint_num_explicit (mismo patron ya usado para p_eta),
-- para poder distinguir "no lo toques" de "ponlo en NULL a proposito".
-- Reemplaza el stored procedure existente (DROP + CREATE, no se puede
-- ALTER el cuerpo).
-- ============================================================

DROP PROCEDURE IF EXISTS `sp_backlog_update`;

DELIMITER $$

CREATE DEFINER=`dev_admin`@`%` PROCEDURE `sp_backlog_update`(
    IN p_tenant_id    INT UNSIGNED,
    IN p_item_id      INT UNSIGNED,
    IN p_code         VARCHAR(50)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_module       VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_description  TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_progress     TINYINT,
    IN p_status       VARCHAR(20)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_sprint_num   SMALLINT,
    IN p_eta          DATE,
    IN p_comment      TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_updated_by   INT UNSIGNED,
    IN p_eta_explicit TINYINT,
    IN p_priority     INT,
    IN p_sprint_num_explicit TINYINT,
    OUT p_error       VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 p_error = MESSAGE_TEXT;
        ROLLBACK;
    END;

    SET p_error = NULL;

    IF NOT EXISTS (
        SELECT 1 FROM backlog_items bi
        INNER JOIN projects p ON p.id = bi.project_id
        WHERE bi.id = p_item_id AND p.tenant_id = p_tenant_id AND bi.deleted_at IS NULL
    ) THEN
        SET p_error = 'Item no encontrado o acceso denegado';
    ELSE
        START TRANSACTION;
            UPDATE backlog_items
            SET code        = COALESCE(p_code,        code),
                module      = COALESCE(p_module,      module),
                description = COALESCE(p_description, description),
                progress    = COALESCE(p_progress,    progress),
                status      = COALESCE(p_status,      status),
                sprint_num  = IF(p_sprint_num_explicit = 1, p_sprint_num, COALESCE(p_sprint_num, sprint_num)),
                eta         = IF(p_eta_explicit = 1, p_eta, COALESCE(p_eta, eta)),
                comment     = COALESCE(p_comment,     comment),
                priority    = COALESCE(p_priority,    priority),
                updated_by  = p_updated_by,
                updated_at  = CURRENT_TIMESTAMP
            WHERE id = p_item_id;
        COMMIT;
    END IF;
END$$

DELIMITER ;
