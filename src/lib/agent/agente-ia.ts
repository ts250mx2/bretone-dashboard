import Anthropic from '@anthropic-ai/sdk';
import { HlClienteError, configProxy, obtenerAgente } from '@/lib/hl-cliente';

export type ProveedorIA = 'claude';

export interface CredencialIA {
  proveedor: ProveedorIA;
  modelo: string;
  baseURL: string;
  headers: Record<string, string>;
}

export const ERROR_SIN_IA =
  'El servicio de IA no está disponible en este momento. Intenta de nuevo en unos minutos.';

export async function credencialDeAgente(opciones: { forzar?: boolean } = {}): Promise<CredencialIA> {
  const { proveedor, modelo } = await obtenerAgente(opciones);
  if (proveedor.trim().toLowerCase() !== 'claude') {
    throw new HlClienteError(
      `HL Console asignó a Brioche el proveedor "${proveedor}", pero esta aplicación solo admite Claude`,
    );
  }
  return { proveedor: 'claude', modelo, ...configProxy() };
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

// La llave nunca llega a esta app: el proxy de HL Console la inyecta y fija el modelo del agente.
export function clienteAnthropic(credencial: CredencialIA): Anthropic {
  return new Anthropic({
    baseURL: credencial.baseURL,
    apiKey: 'hl',
    defaultHeaders: credencial.headers,
  });
}

function headerDeError(error: unknown, nombre: string): string | null {
  const headers = (error as { headers?: unknown }).headers;
  if (!headers) return null;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(nombre);
  const plano = headers as Record<string, string | undefined>;
  return plano[nombre] ?? plano[nombre.toLowerCase()] ?? null;
}

export function esCambioDeProveedor(error: unknown): boolean {
  const status = error instanceof Anthropic.APIError ? error.status : undefined;
  return status === 422 && headerDeError(error, 'x-hl-error') === 'PROVEEDOR_CAMBIADO';
}

export function refrescarCredencial(): Promise<CredencialIA> {
  return credencialDeAgente({ forzar: true });
}

/**
 * Ejecuta una llamada contra el proxy; si HL Console cambió el proveedor del agente
 * (422 PROVEEDOR_CAMBIADO), refresca la credencial y reintenta una sola vez.
 */
export async function conCredencial<T>(
  inicial: CredencialIA,
  llamada: (credencial: CredencialIA) => Promise<T>,
): Promise<{ resultado: T; credencial: CredencialIA }> {
  try {
    return { resultado: await llamada(inicial), credencial: inicial };
  } catch (error) {
    if (!esCambioDeProveedor(error)) throw error;
    const credencial = await refrescarCredencial();
    console.warn(`[hl] Brioche ahora corre con ${credencial.proveedor} / ${credencial.modelo}`);
    return { resultado: await llamada(credencial), credencial };
  }
}
