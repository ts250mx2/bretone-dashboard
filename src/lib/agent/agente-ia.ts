import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { HlClienteError, configProxy, obtenerAgente, type ApiIA } from '@/lib/hl-cliente';

// Adaptador de proveedor para Brioche (mismo patrón que vidaurri-ia): el ciclo del
// agente siempre habla "formato Anthropic" (bloques tool_use / tool_result) y aquí
// se enruta al SDK que corresponde al proveedor que HL Console asignó al agente.
// Las llamadas van por el proxy de HL: la llave del proveedor nunca llega a esta app.

/** SDK con que se corre el agente. */
export type ProveedorIA = 'claude' | 'openai';

export interface CredencialIA {
  proveedor: ProveedorIA;
  /** Nombre del proveedor en HL ("claude", "deepseek"...); `proveedor` solo dice el SDK. */
  proveedorHl: string;
  modelo: string;
  baseURL: string;
  headers: Record<string, string>;
}

export const ERROR_SIN_IA =
  'El servicio de IA no está disponible en este momento. Intenta de nuevo en unos minutos.';

/** El SDK exige una llave; la real la pone HL en el proxy. */
const LLAVE_DE_PASO = 'hl';

/** Proveedores que hablan el API de OpenAI: por el proxy de HL se corren con el SDK de OpenAI. */
const COMPATIBLES_OPENAI = new Set(['openai', 'deepseek', 'groq', 'mistral', 'xai', 'openrouter', 'kimi', 'qwen', 'glm']);

/** Manda el campo `api` de HL; si HL es anterior y no lo trae, se deduce del nombre. */
export function proveedorSoportado(proveedor: string, api: ApiIA | null): ProveedorIA | null {
  if (api === 'anthropic') return 'claude';
  if (api === 'openai') return 'openai';
  if (api) return null;
  const limpio = proveedor.trim().toLowerCase();
  if (limpio === 'claude') return 'claude';
  return COMPATIBLES_OPENAI.has(limpio) ? 'openai' : null;
}

export async function credencialDeAgente(opciones: { forzar?: boolean } = {}): Promise<CredencialIA> {
  let { proveedor, modelo, api } = await obtenerAgente(opciones);
  let soportado = proveedorSoportado(proveedor, api);
  if (!soportado && !opciones.forzar) {
    // Puede ser un valor viejo del cache: si en el portal ya cambiaron la llave, se pregunta de nuevo.
    ({ proveedor, modelo, api } = await obtenerAgente({ forzar: true }));
    soportado = proveedorSoportado(proveedor, api);
  }
  if (!soportado) {
    throw new HlClienteError(
      `HL Console asignó a Brioche el proveedor "${proveedor}", que esta aplicación no sabe correr (solo API de Anthropic u OpenAI)`,
    );
  }
  return { proveedor: soportado, proveedorHl: proveedor.trim().toLowerCase(), modelo, ...configProxy() };
}

export async function credencialParaRuta(): Promise<
  { ok: true; credencial: CredencialIA } | { ok: false; error: string }
> {
  try {
    return { ok: true, credencial: await credencialDeAgente() };
  } catch (error) {
    console.error('[hl] sin credencial para Brioche:', error);
    return { ok: false, error: ERROR_SIN_IA };
  }
}

function headerDeError(error: unknown, nombre: string): string | null {
  const headers = (error as { headers?: unknown }).headers;
  if (!headers) return null;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(nombre);
  const plano = headers as Record<string, string | undefined>;
  return plano[nombre] ?? plano[nombre.toLowerCase()] ?? null;
}

function statusDeError(error: unknown): number | undefined {
  return error instanceof Anthropic.APIError || error instanceof OpenAI.APIError ? error.status : undefined;
}

/** HL avisa (422 + X-HL-Error: PROVEEDOR_CAMBIADO) que el agente ya corre con otro SDK. */
export function esCambioDeProveedor(error: unknown): boolean {
  return statusDeError(error) === 422 && headerDeError(error, 'x-hl-error') === 'PROVEEDOR_CAMBIADO';
}

/** 401 del proxy: HL rechazó la key de acceso de la app. */
export function esErrorDeAutenticacion(error: unknown): boolean {
  return statusDeError(error) === 401;
}

export function esLimiteDePeticiones(error: unknown): boolean {
  return statusDeError(error) === 429;
}

export interface Ronda {
  sistema: string;
  herramientas: Anthropic.Tool[];
  mensajes: Anthropic.MessageParam[];
  maxTokens: number;
}

export interface ResultadoRonda {
  /** Bloques en formato Anthropic, listos para el historial del ciclo. */
  contenido: Anthropic.ContentBlock[];
  /** true si el modelo pidió herramientas y espera sus resultados. */
  pidioHerramientas: boolean;
}

/**
 * Corre una ronda del agente con el SDK de la credencial. Si HL avisa que el agente
 * cambió de proveedor, refresca la credencial y repite la ronda una sola vez.
 */
export async function correrRonda(
  inicial: CredencialIA,
  ronda: Ronda,
): Promise<{ resultado: ResultadoRonda; credencial: CredencialIA }> {
  try {
    return { resultado: await ejecutar(inicial, ronda), credencial: inicial };
  } catch (error) {
    if (!esCambioDeProveedor(error)) throw error;
    const credencial = await credencialDeAgente({ forzar: true });
    console.warn(`[hl] Brioche ahora corre con ${credencial.proveedorHl} / ${credencial.modelo}`);
    return { resultado: await ejecutar(credencial, ronda), credencial };
  }
}

function ejecutar(credencial: CredencialIA, ronda: Ronda): Promise<ResultadoRonda> {
  return credencial.proveedor === 'openai' ? rondaOpenAI(credencial, ronda) : rondaAnthropic(credencial, ronda);
}

/** Texto visible de una respuesta. */
export function textoDe(contenido: Anthropic.ContentBlock[]): string {
  return contenido
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ---------- Anthropic ----------

async function rondaAnthropic(credencial: CredencialIA, ronda: Ronda): Promise<ResultadoRonda> {
  const client = new Anthropic({ baseURL: credencial.baseURL, apiKey: LLAVE_DE_PASO, defaultHeaders: credencial.headers });
  const respuesta = await client.messages.create({
    model: credencial.modelo,
    max_tokens: ronda.maxTokens,
    system: ronda.sistema,
    ...(ronda.herramientas.length ? { tools: ronda.herramientas } : {}),
    messages: ronda.mensajes,
  });
  return { contenido: respuesta.content, pidioHerramientas: respuesta.stop_reason === 'tool_use' };
}

// ---------- OpenAI y compatibles (DeepSeek, Groq...) ----------

type MensajeOpenAI = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Traduce el historial formato Anthropic al formato chat.completions. */
export function traducirMensajes(sistema: string, mensajes: Anthropic.MessageParam[]): MensajeOpenAI[] {
  const salida: MensajeOpenAI[] = [{ role: 'system', content: sistema }];
  for (const mensaje of mensajes) {
    if (typeof mensaje.content === 'string') {
      salida.push({ role: mensaje.role, content: mensaje.content });
    } else if (mensaje.role === 'assistant') {
      salida.push(traducirAsistente(mensaje.content));
    } else {
      salida.push(...traducirUsuario(mensaje.content));
    }
  }
  return salida;
}

function traducirAsistente(bloques: Exclude<Anthropic.MessageParam['content'], string>): MensajeOpenAI {
  let texto = '';
  const llamadas: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
  for (const bloque of bloques) {
    if (bloque.type === 'text') texto += bloque.text;
    if (bloque.type === 'tool_use') {
      llamadas.push({ id: bloque.id, type: 'function', function: { name: bloque.name, arguments: JSON.stringify(bloque.input ?? {}) } });
    }
  }
  return { role: 'assistant', content: texto || null, ...(llamadas.length ? { tool_calls: llamadas } : {}) };
}

function traducirUsuario(bloques: Exclude<Anthropic.MessageParam['content'], string>): MensajeOpenAI[] {
  const salida: MensajeOpenAI[] = [];
  let texto = '';
  for (const bloque of bloques) {
    if (bloque.type === 'tool_result') {
      salida.push({
        role: 'tool',
        tool_call_id: bloque.tool_use_id,
        content: typeof bloque.content === 'string' ? bloque.content : JSON.stringify(bloque.content),
      });
    } else if (bloque.type === 'text') {
      texto += bloque.text;
    }
  }
  if (texto) salida.push({ role: 'user', content: texto });
  return salida;
}

function herramientasOpenAI(herramientas: Anthropic.Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return herramientas.map((h) => ({
    type: 'function' as const,
    function: {
      name: h.name,
      description: h.description ?? '',
      parameters: (h.input_schema ?? { type: 'object' }) as Record<string, unknown>,
    },
  }));
}

async function rondaOpenAI(credencial: CredencialIA, ronda: Ronda): Promise<ResultadoRonda> {
  // El SDK de OpenAI cuelga las rutas de la baseURL, así que el proxy lleva /v1.
  const client = new OpenAI({ baseURL: `${credencial.baseURL}/v1`, apiKey: LLAVE_DE_PASO, defaultHeaders: credencial.headers });
  // OpenAI pide max_completion_tokens; los compatibles (DeepSeek...) siguen usando max_tokens.
  const limite = credencial.proveedorHl === 'openai'
    ? { max_completion_tokens: ronda.maxTokens }
    : { max_tokens: ronda.maxTokens };
  const respuesta = await client.chat.completions.create({
    model: credencial.modelo,
    ...limite,
    messages: traducirMensajes(ronda.sistema, ronda.mensajes),
    ...(ronda.herramientas.length ? { tools: herramientasOpenAI(ronda.herramientas) } : {}),
  });

  const mensaje = respuesta.choices[0]?.message;
  const contenido: Anthropic.ContentBlock[] = [];
  if (mensaje?.content) {
    contenido.push({ type: 'text', text: mensaje.content, citations: null } as Anthropic.ContentBlock);
  }
  for (const llamada of mensaje?.tool_calls ?? []) {
    if (llamada.type !== 'function') continue;
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(llamada.function.arguments || '{}');
    } catch {
      // argumentos ilegibles: se pasa vacío y la herramienta reportará el error
    }
    contenido.push({ type: 'tool_use', id: llamada.id, name: llamada.function.name, input } as Anthropic.ContentBlock);
  }
  return { contenido, pidioHerramientas: contenido.some((b) => b.type === 'tool_use') };
}
