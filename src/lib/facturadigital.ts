const DEFAULT_BASE_URL = 'https://app.facturadigital.com.mx/api/v5';
const REQUEST_TIMEOUT_MS = 60_000;

export type StampedCfdi = {
  uuid: string;
  fechaTimbrado: string;
  noCertificado: string;
  noCertificadoSAT: string;
  selloCFD: string;
  selloSAT: string;
  rfcProvCertif: string;
  cadenaOrigTFD: string;
  cadenaQR: string;
  xmlBase64: string;
  pdfUrl: string;
  xmlUrl: string;
};

export class PacError extends Error {
  readonly status: number;
  readonly pacCode: string;

  constructor(message: string, status: number, pacCode: string | number = '') {
    super(message);
    this.name = 'PacError';
    this.status = status;
    this.pacCode = String(pacCode);
  }
}

function baseUrl() {
  return (process.env.FACTURA_DIGITAL_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function apiKey() {
  const key = (process.env.FACTURA_DIGITAL_API_KEY || '').trim();
  if (!key) throw new PacError('Falta configurar FACTURA_DIGITAL_API_KEY en el servidor', 500, 'NO_API_KEY');
  return key;
}

export function isSandbox() {
  return baseUrl().includes('sandbox');
}

/** Los parámetros de cancelar/enviar viajan en encabezados HTTP: solo ASCII imprimible y sin saltos de línea. */
function headerValue(value: unknown, maxLength = 250) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

type PacResponse = { message?: string; code?: number | string; [key: string]: unknown };

async function pacRequest(path: string, init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: BodyInit }) {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers: { 'X-Api-Key': apiKey(), Accept: 'application/json', ...(init.headers || {}) },
      body: init.body,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new PacError(
      timedOut ? 'El PAC no respondió a tiempo. Verifica en su portal si el CFDI se timbró antes de reintentar.' : 'No fue posible contactar al PAC',
      504,
      timedOut ? 'TIMEOUT' : 'NETWORK',
    );
  }

  const text = await response.text();
  let payload: PacResponse | null = null;
  try {
    payload = JSON.parse(text) as PacResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || Number(payload.code) !== 200) {
    const detail = payload?.message ? String(payload.message) : text.slice(0, 300) || `El PAC respondió ${response.status}`;
    throw new PacError(detail, response.status === 200 ? 502 : response.status, payload?.code ?? response.status);
  }

  return payload;
}

export async function getBalance() {
  const payload = await pacRequest('/account/balance', { method: 'GET' });
  return { balance: Number(payload.balance) || 0, message: String(payload.message || '') };
}

export async function stampCfdi(document: Record<string, unknown>): Promise<StampedCfdi> {
  const payload = await pacRequest('/invoice/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ json: JSON.stringify(document) }),
  });

  const cfdi = (payload.cfdi || {}) as Record<string, string>;
  if (!cfdi.UUID) throw new PacError('El PAC no devolvió el folio fiscal (UUID) del comprobante', 502, 'NO_UUID');

  return {
    uuid: String(cfdi.UUID),
    fechaTimbrado: String(cfdi.FechaTimbrado || ''),
    noCertificado: String(cfdi.NoCertificado || ''),
    noCertificadoSAT: String(cfdi.NoCertificadoSAT || ''),
    selloCFD: String(cfdi.SelloCFD || ''),
    selloSAT: String(cfdi.SelloSAT || ''),
    rfcProvCertif: String(cfdi.RfcProvCertif || ''),
    cadenaOrigTFD: String(cfdi.CadenaOrigTFD || ''),
    cadenaQR: String(cfdi.CadenaQR || ''),
    xmlBase64: String(cfdi.XmlBase64 || ''),
    pdfUrl: String(cfdi.PDF || ''),
    xmlUrl: String(cfdi.XML || ''),
  };
}

export async function cancelCfdi(uuid: string, motivo: string, folioSustitucion = '') {
  const headers: Record<string, string> = { uuid: headerValue(uuid, 36), motivo: headerValue(motivo, 2) };
  if (folioSustitucion) headers.foliosustitucion = headerValue(folioSustitucion, 36);
  const payload = await pacRequest('/invoice/cancel', { method: 'POST', headers });
  return String(payload.message || 'CFDI cancelado ante el SAT');
}

export async function sendCfdiByEmail(uuid: string, recipient: string, message = '') {
  const headers: Record<string, string> = { uuid: headerValue(uuid, 36), recipient: headerValue(recipient, 254) };
  if (message) headers.message = headerValue(message, 500);
  const payload = await pacRequest('/invoice/send', { method: 'POST', headers });
  return String(payload.message || 'CFDI enviado por correo');
}

/** Descarga el PDF o XML publicado por el PAC para un CFDI ya timbrado. */
export async function downloadCfdiFile(url: string) {
  if (!/^https:\/\/[a-z0-9.-]*facturadigital\.com\.mx\//i.test(url)) {
    throw new PacError('La dirección del documento no pertenece al PAC', 400, 'BAD_URL');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'X-Api-Key': apiKey() },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PacError('No fue posible descargar el documento del PAC', 504, 'NETWORK');
  }

  if (!response.ok) throw new PacError(`El PAC respondió ${response.status} al descargar el documento`, response.status, response.status);
  return Buffer.from(await response.arrayBuffer());
}
