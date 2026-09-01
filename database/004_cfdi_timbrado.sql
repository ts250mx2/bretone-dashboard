-- Timbrado de CFDI 4.0 con el PAC (Factura Digital) y resguardo de XML/PDF.
-- Las mismas columnas y tablas se crean automáticamente al abrir el módulo de facturación.

ALTER TABLE tblFacturasDashboard
  ADD COLUMN CodigoPostalExpedicion VARCHAR(5) NULL AFTER CodigoPostal,
  ADD COLUMN Serie VARCHAR(25) NULL AFTER UUID,
  ADD COLUMN Folio VARCHAR(25) NULL AFTER Serie,
  ADD COLUMN TotalTimbrado DECIMAL(12,2) NULL AFTER Folio,
  ADD COLUMN ErrorTimbrado VARCHAR(500) NULL AFTER TotalTimbrado,
  ADD COLUMN TimbradoIniciadoEn DATETIME NULL AFTER TimbradaEn;

CREATE TABLE IF NOT EXISTS tblCfdiDocumentosDashboard (
  IdFactura BIGINT UNSIGNED NOT NULL,
  UUID VARCHAR(36) NOT NULL,
  Serie VARCHAR(25) NULL,
  Folio VARCHAR(25) NULL,
  FechaTimbrado DATETIME NULL,
  RfcReceptor VARCHAR(13) NOT NULL,
  Total DECIMAL(12,2) NOT NULL,
  Ambiente VARCHAR(20) NOT NULL DEFAULT 'produccion',
  NoCertificado VARCHAR(20) NULL,
  NoCertificadoSAT VARCHAR(20) NULL,
  RfcProvCertif VARCHAR(13) NULL,
  CadenaQR TEXT NULL,
  XmlRuta VARCHAR(512) NULL,
  PdfRuta VARCHAR(512) NULL,
  XmlUrl VARCHAR(512) NULL,
  PdfUrl VARCHAR(512) NULL,
  Xml LONGTEXT NULL,
  CreadaEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IdFactura),
  UNIQUE KEY uq_cfdi_uuid (UUID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblCfdiEnviosDashboard (
  IdEnvio BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  IdFactura BIGINT UNSIGNED NOT NULL,
  UUID VARCHAR(36) NOT NULL,
  Correo VARCHAR(254) NOT NULL,
  Mensaje VARCHAR(500) NULL,
  Exitoso TINYINT NOT NULL DEFAULT 1,
  Respuesta VARCHAR(500) NULL,
  EnviadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IdEnvio),
  KEY idx_envio_factura (IdFactura, EnviadoEn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
