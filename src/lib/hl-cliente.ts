import { createDecipheriv } from 'node:crypto';

/** API que habla el proveedor del agente, según HL Console. */
export type ApiIA = 'anthropic' | 'openai' | 'gemini';

export interface AgenteIA {
  uuid: string;
  agente: string;
  proveedor: string;
  modelo: string;
  /** null si HL Console es anterior al campo `api`. */
  api: ApiIA | null;
  caducidad: string | null;
}

export interface LlaveIA extends AgenteIA {
  llave: string;
}

interface DatosWs {
  uuid: string;
  agente: string;
  proveedor: string;
  modelo: string;
  api: ApiIA | null;
  llave: string | null;
  llaveCifrada: string | null;
  caducidad: string | null;
}

interface Config {
  url: string;
  key: string;
  secreto: Buffer | null;
  agente: string;
  ttlMinutos: number;
}

export class HlClienteError extends Error {
  constructor(message: string, public readonly status: number | null = null) {
    super(message);
    this.name = 'HlClienteError';
  }
}

const KEY_FORMAT = /^hl_[0-9a-f]{48}$/;
const SECRET_FORMAT = /^[0-9a-fA-F]{64}$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerConfig(): Config {
  const url = (process.env.HL_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.HL_KEY || '').trim();
  const secretoHex = (process.env.HL_SECRET || '').trim();
  const agente = (process.env.HL_AGENTE || '').trim();
  const ttl = Number(process.env.HL_TTL_MIN);

  if (!url) throw new HlClienteError('Falta HL_URL en el entorno');
  if (!KEY_FORMAT.test(key)) throw new HlClienteError('HL_KEY ausente o con formato inválido');
  if (secretoHex && !SECRET_FORMAT.test(secretoHex)) throw new HlClienteError('HL_SECRET con formato inválido');
  if (!UUID_FORMAT.test(agente)) throw new HlClienteError('HL_AGENTE ausente o no es un UUID válido');

  return {
    url,
    key,
    secreto: secretoHex ? Buffer.from(secretoHex, 'hex') : null,
    agente,
    ttlMinutos: Number.isFinite(ttl) && ttl > 0 ? ttl : 30,
  };
}

function describirErrorRed(error: unknown, baseUrl: string): string {
  const causa = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  const mensaje = error instanceof Error ? error.message : 'error de red';
  const detalle = causa ? `${mensaje} (${causa})` : mensaje;
  if (baseUrl.startsWith('https://') && /ssl|tls|wrong version|certificate|EPROTO/i.test(causa)) {
    return `${detalle}. Si HL Console sirve HTTP plano, usa http:// en HL_URL`;
  }
  return detalle;
}

function validarDatos(value: unknown): DatosWs | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.proveedor !== 'string' || typeof data.modelo !== 'string') return null;
  return {
    uuid: typeof data.uuid === 'string' ? data.uuid : '',
    agente: typeof data.agente === 'string' ? data.agente : '',
    proveedor: data.proveedor.trim().toLowerCase(),
    modelo: data.modelo.trim(),
    llave: typeof data.llave === 'string' ? data.llave : null,
    llaveCifrada: typeof data.llaveCifrada === 'string' ? data.llaveCifrada : null,
    api: data.api === 'anthropic' || data.api === 'openai' || data.api === 'gemini' ? data.api : null,
    caducidad: typeof data.caducidad === 'string' ? data.caducidad : null,
  };
}

async function consultarWs(config: Config): Promise<DatosWs> {
  const url = `${config.url}/api/ws/llave/${config.agente}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'X-HL-Key': config.key, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch (error) {
    throw new HlClienteError(`No se pudo conectar con HL Console: ${describirErrorRed(error, config.url)}`);
  }

  let body: { success?: boolean; data?: unknown; error?: string };
  try {
    body = await response.json();
  } catch {
    throw new HlClienteError(`HL Console respondió ${response.status} sin JSON válido`, response.status);
  }
  if (!response.ok || !body.success || !body.data) {
    throw new HlClienteError(body.error || `HL Console respondió ${response.status}`, response.status);
  }
  const datos = validarDatos(body.data);
  if (!datos) throw new HlClienteError('HL Console respondió sin proveedor o modelo', response.status);
  return datos;
}

let cache: { valor: DatosWs; expira: number } | null = null;
let enCurso: Promise<DatosWs> | null = null;

async function obtenerDatos(forzar = false): Promise<DatosWs> {
  if (!forzar && cache && cache.expira > Date.now()) return cache.valor;
  if (enCurso) return enCurso;
  const config = leerConfig();
  enCurso = consultarWs(config)
    .then((valor) => {
      cache = { valor, expira: Date.now() + config.ttlMinutos * 60_000 };
      return valor;
    })
    .catch((error: unknown) => {
      if (cache) {
        console.error('[hl] falló el refresco; se reutiliza la configuración anterior.', error);
        return cache.valor;
      }
      throw error;
    })
    .finally(() => { enCurso = null; });
  return enCurso;
}

export async function obtenerAgente(opciones: { forzar?: boolean } = {}): Promise<AgenteIA> {
  const { uuid, agente, proveedor, modelo, api, caducidad } = await obtenerDatos(opciones.forzar);
  return { uuid, agente, proveedor, modelo, api, caducidad };
}

export async function obtenerLlave(opciones: { forzar?: boolean } = {}): Promise<LlaveIA> {
  const datos = await obtenerDatos(opciones.forzar);
  const config = leerConfig();
  let llave = datos.llave;
  if (!llave && datos.llaveCifrada && config.secreto) {
    const [iv, tag, cifrado] = datos.llaveCifrada.split('.').map((parte) => Buffer.from(parte, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', config.secreto, iv);
    decipher.setAuthTag(tag);
    llave = Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
  }
  if (!llave) throw new HlClienteError('HL Console no regresó una llave utilizable');
  return { ...datos, llave };
}

export function limpiarCacheLlave(): void {
  cache = null;
}

export function configProxy(): { baseURL: string; headers: Record<string, string> } {
  const config = leerConfig();
  return {
    baseURL: `${config.url}/api/ws/proxy/${config.agente}`,
    headers: { 'X-HL-Key': config.key },
  };
}
