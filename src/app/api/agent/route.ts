import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '@/lib/auth';
import { tools, runTool } from '@/lib/agent/tools';
import { buildSystemPrompt } from '@/lib/agent/system-prompt';
import {
  correrRonda,
  credencialParaRuta,
  esErrorDeAutenticacion,
  esLimiteDePeticiones,
  textoDe,
  type CredencialIA,
} from '@/lib/agent/agente-ia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TOOL_TURNS = 8;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  // Auth — same session cookie that protects the dashboard.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  const history = (body.messages ?? [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20); // cap context to the last 20 turns

  if (history.length === 0) {
    return NextResponse.json({ error: 'No hay mensajes para procesar.' }, { status: 400 });
  }

  // HL Console determina el modelo y guarda la llave del agente configurado en HL_AGENTE.
  const credencialInicial = await credencialParaRuta();
  if (!credencialInicial.ok) {
    return NextResponse.json({ error: credencialInicial.error }, { status: 503 });
  }
  let credencial: CredencialIA = credencialInicial.credencial;

  const system = buildSystemPrompt();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  try {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      // Claude o un proveedor con API de OpenAI (DeepSeek...), según lo que HL asigne al agente.
      const ronda = await correrRonda(credencial, { sistema: system, herramientas: tools, mensajes: messages, maxTokens: 8192 });
      credencial = ronda.credencial;
      const { contenido, pidioHerramientas } = ronda.resultado;

      if (pidioHerramientas) {
        // Preserve the full assistant turn (tool_use blocks) before replying with results.
        messages.push({ role: 'assistant', content: contenido });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of contenido) {
          if (block.type === 'tool_use') {
            const result = await runTool(block.name, block.input as Record<string, unknown>);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          }
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Terminal turn — collect the visible text.
      const reply = textoDe(contenido);

      return NextResponse.json({ reply: reply || 'No tengo una respuesta para eso.' });
    }

    return NextResponse.json(
      { reply: 'La consulta requirió demasiados pasos. Intenta reformular la pregunta de forma más específica.' },
    );
  } catch (err) {
    if (esErrorDeAutenticacion(err)) {
      return NextResponse.json({ error: 'HL Console rechazó la key de acceso del asistente.' }, { status: 502 });
    }
    if (esLimiteDePeticiones(err)) {
      return NextResponse.json({ error: 'El asistente está saturado. Intenta de nuevo en unos segundos.' }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('Agent error:', err);
    return NextResponse.json({ error: `Error del asistente: ${message}` }, { status: 500 });
  }
}
