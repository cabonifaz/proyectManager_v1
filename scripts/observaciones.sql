-- ============================================================
-- Módulo: Observaciones
-- Ejecutar en el schema de la base de datos del proyecto
-- ============================================================

-- Tabla principal de observaciones
CREATE TABLE IF NOT EXISTS observaciones (
  id              INT           AUTO_INCREMENT PRIMARY KEY,
  tenant_id       INT           NOT NULL,
  project_id      INT           NOT NULL,
  backlog_item_id INT           NULL,
  tipo            ENUM('riesgo','bloqueo','mejora','nota') NOT NULL DEFAULT 'nota',
  prioridad       ENUM('alta','media','baja')              NOT NULL DEFAULT 'media',
  titulo          VARCHAR(255)  NOT NULL,
  descripcion     TEXT          NULL,
  estado          ENUM('abierta','en_seguimiento','resuelta','cerrada') NOT NULL DEFAULT 'abierta',
  eta             DATE          NULL,
  entregado_at    DATE          NULL,
  created_by      INT           NOT NULL,
  updated_by      INT           NULL,
  created_at      DATETIME      NOT NULL DEFAULT NOW(),
  updated_at      DATETIME      NULL,
  deleted_at      DATETIME      NULL,
  deleted_by      INT           NULL,
  INDEX idx_tenant_project (tenant_id, project_id),
  INDEX idx_estado          (estado),
  INDEX idx_tipo            (tipo),
  INDEX idx_deleted         (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Asignaciones: qué desarrollador cubre cada tecnología (project_column) en la observación
-- Sigue el mismo patrón que sprint_item_tech.assigned_user_id
CREATE TABLE IF NOT EXISTS observacion_asignaciones (
  id               INT          AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT          NOT NULL,
  observacion_id   INT          NOT NULL,
  column_id        INT          NOT NULL,
  col_key          VARCHAR(100) NOT NULL,
  tech_name        VARCHAR(150) NOT NULL,
  developer_name   VARCHAR(150) NOT NULL,
  created_at       DATETIME     NOT NULL DEFAULT NOW(),
  UNIQUE KEY uq_obs_col    (observacion_id, column_id),
  INDEX idx_observacion    (observacion_id),
  INDEX idx_tenant         (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
DELIMITER $$

-- Lista observaciones con eta, entregado_at y conteo de asignaciones
DROP PROCEDURE IF EXISTS sp_observacion_list$$
CREATE PROCEDURE sp_observacion_list(
  IN p_tenant_id  INT,
  IN p_project_id INT,
  IN p_estado     VARCHAR(20),
  IN p_tipo       VARCHAR(20),
  IN p_search     VARCHAR(255),
  IN p_limit      INT,
  IN p_offset     INT
)
BEGIN
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
    u.name AS created_by_name,
    b.code AS backlog_code,
    (SELECT COUNT(*) FROM observacion_asignaciones a WHERE a.observacion_id = o.id) AS total_asignaciones
  FROM observaciones o
  LEFT JOIN users         u ON u.id = o.created_by
  LEFT JOIN backlog_items b ON b.id = o.backlog_item_id
  WHERE o.tenant_id  = p_tenant_id
    AND o.project_id = p_project_id
    AND o.deleted_at IS NULL
    AND (p_estado IS NULL OR o.estado = p_estado)
    AND (p_tipo   IS NULL OR o.tipo   = p_tipo)
    AND (
      p_search IS NULL
      OR o.titulo      LIKE CONCAT('%', p_search, '%')
      OR o.descripcion LIKE CONCAT('%', p_search, '%')
    )
  ORDER BY
    FIELD(o.prioridad, 'alta', 'media', 'baja'),
    o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END$$

-- Crea una observación
DROP PROCEDURE IF EXISTS sp_observacion_create$$
CREATE PROCEDURE sp_observacion_create(
  IN  p_tenant_id       INT,
  IN  p_project_id      INT,
  IN  p_backlog_item_id INT,
  IN  p_tipo            VARCHAR(20),
  IN  p_prioridad       VARCHAR(10),
  IN  p_titulo          VARCHAR(255),
  IN  p_descripcion     TEXT,
  IN  p_eta             DATE,
  IN  p_created_by      INT,
  OUT p_new_id          INT,
  OUT p_error           VARCHAR(255)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 p_error = MESSAGE_TEXT;
    SET p_new_id = NULL;
  END;

  SET p_error = NULL;

  INSERT INTO observaciones
    (tenant_id, project_id, backlog_item_id, tipo, prioridad, titulo, descripcion, eta, estado, created_by, created_at)
  VALUES
    (p_tenant_id, p_project_id, p_backlog_item_id, p_tipo, p_prioridad, p_titulo, p_descripcion, p_eta, 'abierta', p_created_by, NOW());

  SET p_new_id = LAST_INSERT_ID();
END$$

-- Actualiza una observación
DROP PROCEDURE IF EXISTS sp_observacion_update$$
CREATE PROCEDURE sp_observacion_update(
  IN  p_tenant_id    INT,
  IN  p_id           INT,
  IN  p_tipo         VARCHAR(20),
  IN  p_prioridad    VARCHAR(10),
  IN  p_titulo       VARCHAR(255),
  IN  p_descripcion  TEXT,
  IN  p_estado       VARCHAR(20),
  IN  p_eta          DATE,
  IN  p_entregado_at DATE,
  IN  p_updated_by   INT,
  OUT p_error        VARCHAR(255)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 p_error = MESSAGE_TEXT;
  END;

  SET p_error = NULL;

  UPDATE observaciones
  SET
    tipo         = p_tipo,
    prioridad    = p_prioridad,
    titulo       = p_titulo,
    descripcion  = p_descripcion,
    estado       = p_estado,
    eta          = p_eta,
    entregado_at = p_entregado_at,
    updated_by   = p_updated_by,
    updated_at   = NOW()
  WHERE id        = p_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL;

  IF ROW_COUNT() = 0 THEN
    SET p_error = 'Observación no encontrada o sin cambios';
  END IF;
END$$

-- Soft-delete de una observación
DROP PROCEDURE IF EXISTS sp_observacion_delete$$
CREATE PROCEDURE sp_observacion_delete(
  IN  p_tenant_id  INT,
  IN  p_id         INT,
  IN  p_deleted_by INT,
  OUT p_error      VARCHAR(255)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 p_error = MESSAGE_TEXT;
  END;

  SET p_error = NULL;

  UPDATE observaciones
  SET deleted_at = NOW(), deleted_by = p_deleted_by, updated_by = p_deleted_by
  WHERE id        = p_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL;

  IF ROW_COUNT() = 0 THEN
    SET p_error = 'Observación no encontrada';
  END IF;
END$$

DELIMITER ;
