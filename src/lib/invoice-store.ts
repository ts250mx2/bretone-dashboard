import { query } from '@/lib/db';

let tableReady: Promise<void> | null = null;

async function ensureColumn(name: string, definition: string) {
  const rows = await query(`
    SELECT COUNT(*) AS Found
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tblSolicitudesFacturaDashboard' AND COLUMN_NAME = ?
  `, [name]);
  if (!Number(rows[0]?.Found)) {
    await query(`ALTER TABLE tblSolicitudesFacturaDashboard ADD COLUMN ${name} ${definition}`);
  }
}

export function ensureInvoiceTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await query(`
      CREATE TABLE IF NOT EXISTS tblSolicitudesFacturaDashboard (
        IdSolicitud BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        IdApertura INT NOT NULL,
        IdVenta INT NOT NULL,
        TipoReceptor ENUM('publico_general', 'cliente') NOT NULL,
        RFC VARCHAR(13) NOT NULL,
        RazonSocial VARCHAR(254) NOT NULL,
        CodigoPostal VARCHAR(5) NOT NULL,
        RegimenFiscal VARCHAR(3) NOT NULL,
        UsoCFDI VARCHAR(3) NOT NULL,
        Correo VARCHAR(254) NULL,
        ConsumoFacturable DECIMAL(12,2) NOT NULL,
        Propina DECIMAL(12,2) NOT NULL,
        PorcentajePropina TINYINT UNSIGNED NOT NULL,
        BaseGravable DECIMAL(12,2) NOT NULL DEFAULT 0,
        IVA DECIMAL(12,2) NOT NULL DEFAULT 0,
        IEPS DECIMAL(12,2) NOT NULL DEFAULT 0,
        Estado ENUM('pendiente_timbrado', 'timbrada', 'cancelada') NOT NULL DEFAULT 'pendiente_timbrado',
        UUID VARCHAR(36) NULL,
        CreadaEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ActualizadaEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (IdSolicitud),
        UNIQUE KEY uq_solicitud_venta (IdApertura, IdVenta),
        KEY idx_solicitudes_estado (Estado, CreadaEn)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await ensureColumn('BaseGravable', 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER PorcentajePropina');
      await ensureColumn('IVA', 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER BaseGravable');
      await ensureColumn('IEPS', 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER IVA');
      await query(`
        CREATE TABLE IF NOT EXISTS tblConfiguracionFiscalProductosDashboard (
          IdProducto INT NOT NULL,
          TasaIVA DECIMAL(6,3) NOT NULL DEFAULT 16.000,
          TasaIEPS DECIMAL(6,3) NOT NULL DEFAULT 0.000,
          ObjetoImpuesto VARCHAR(2) NOT NULL DEFAULT '02',
          ActualizadaEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (IdProducto)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS tblFacturasGlobalesDashboard (
          IdFacturaGlobal BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          FechaOperacion DATE NOT NULL,
          Periodicidad VARCHAR(2) NOT NULL DEFAULT '01',
          Meses VARCHAR(2) NOT NULL,
          Anio SMALLINT NOT NULL,
          CodigoPostal VARCHAR(5) NOT NULL,
          NumTickets INT NOT NULL,
          BaseGravable DECIMAL(12,2) NOT NULL,
          IVA DECIMAL(12,2) NOT NULL,
          IEPS DECIMAL(12,2) NOT NULL,
          ConsumoFacturable DECIMAL(12,2) NOT NULL,
          Propinas DECIMAL(12,2) NOT NULL,
          Estado ENUM('pendiente_timbrado','timbrada','cancelada') NOT NULL DEFAULT 'pendiente_timbrado',
          UUID VARCHAR(36) NULL,
          CreadaEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (IdFacturaGlobal),
          UNIQUE KEY uq_global_fecha (FechaOperacion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS tblDetalleFacturaGlobalDashboard (
          IdFacturaGlobal BIGINT UNSIGNED NOT NULL,
          IdApertura INT NOT NULL,
          IdVenta INT NOT NULL,
          BaseGravable DECIMAL(12,2) NOT NULL,
          IVA DECIMAL(12,2) NOT NULL,
          IEPS DECIMAL(12,2) NOT NULL,
          ConsumoFacturable DECIMAL(12,2) NOT NULL,
          Propina DECIMAL(12,2) NOT NULL,
          PRIMARY KEY (IdFacturaGlobal, IdApertura, IdVenta),
          UNIQUE KEY uq_ticket_global (IdApertura, IdVenta)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS tblFacturasDashboard (
          IdFactura BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          Tipo ENUM('cliente','publico_general','global') NOT NULL,
          FechaOperacion DATE NOT NULL,
          RFC VARCHAR(13) NOT NULL,
          RazonSocial VARCHAR(254) NOT NULL,
          CodigoPostal VARCHAR(5) NOT NULL,
          RegimenFiscal VARCHAR(3) NOT NULL,
          UsoCFDI VARCHAR(3) NOT NULL,
          Correo VARCHAR(254) NULL,
          Periodicidad VARCHAR(2) NULL,
          Meses VARCHAR(2) NULL,
          Anio SMALLINT NULL,
          NumTickets INT NOT NULL,
          BaseGravable DECIMAL(12,2) NOT NULL,
          IVA DECIMAL(12,2) NOT NULL,
          IEPS DECIMAL(12,2) NOT NULL,
          ConsumoFacturable DECIMAL(12,2) NOT NULL,
          Propinas DECIMAL(12,2) NOT NULL,
          Estado ENUM('pendiente_timbrado','timbrada','cancelada') NOT NULL DEFAULT 'pendiente_timbrado',
          UUID VARCHAR(36) NULL,
          CreadaEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          TimbradaEn DATETIME NULL,
          CanceladaEn DATETIME NULL,
          MotivoCancelacion VARCHAR(254) NULL,
          PRIMARY KEY (IdFactura),
          KEY idx_facturas_fecha (FechaOperacion, Estado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS tblFacturaTicketsDashboard (
          IdFactura BIGINT UNSIGNED NOT NULL,
          IdApertura INT NOT NULL,
          IdVenta INT NOT NULL,
          Folio VARCHAR(32) NOT NULL,
          FechaVenta DATETIME NOT NULL,
          BaseGravable DECIMAL(12,2) NOT NULL,
          IVA DECIMAL(12,2) NOT NULL,
          IEPS DECIMAL(12,2) NOT NULL,
          ConsumoFacturable DECIMAL(12,2) NOT NULL,
          Propina DECIMAL(12,2) NOT NULL,
          AsignacionActiva TINYINT NULL DEFAULT 1,
          PRIMARY KEY (IdFactura, IdApertura, IdVenta),
          UNIQUE KEY uq_ticket_factura_activa (IdApertura, IdVenta, AsignacionActiva),
          KEY idx_factura_ticket (IdFactura)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }

  return tableReady;
}

export const PUBLIC_GENERAL = {
  rfc: 'XAXX010101000',
  legalName: 'PUBLICO EN GENERAL',
  taxRegime: '616',
  cfdiUse: 'S01',
};
