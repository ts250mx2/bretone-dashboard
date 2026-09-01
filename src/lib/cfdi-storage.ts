import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

export type CfdiFileKind = 'xml' | 'pdf';

export const CFDI_MIME: Record<CfdiFileKind, string> = {
  xml: 'application/xml; charset=utf-8',
  pdf: 'application/pdf',
};

export function storageRoot() {
  const configured = (process.env.CFDI_STORAGE_DIR || '').trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), 'storage', 'cfdi');
}

/** Los CFDI se archivan por año y mes de timbrado para conservarlos los 5 años que exige el SAT. */
function relativeDirectory(stampedAt: Date) {
  const year = String(stampedAt.getFullYear());
  const month = String(stampedAt.getMonth() + 1).padStart(2, '0');
  return path.posix.join(year, month);
}

export function documentFileName(idFactura: number, uuid: string, kind: CfdiFileKind) {
  const safeUuid = uuid.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  return `F${String(idFactura).padStart(6, '0')}_${safeUuid}.${kind}`;
}

export async function saveCfdiFile(relativePath: string, content: Buffer) {
  const absolute = resolveStoredPath(relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
  return relativePath;
}

export function buildRelativePath(idFactura: number, uuid: string, kind: CfdiFileKind, stampedAt: Date) {
  return path.posix.join(relativeDirectory(stampedAt), documentFileName(idFactura, uuid, kind));
}

/** Evita que una ruta guardada en base de datos escape del directorio de almacenamiento. */
export function resolveStoredPath(relativePath: string) {
  const root = storageRoot();
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error('La ruta del documento no es válida');
  }
  return absolute;
}

export async function readCfdiFile(relativePath: string) {
  try {
    return await readFile(resolveStoredPath(relativePath));
  } catch {
    return null;
  }
}
