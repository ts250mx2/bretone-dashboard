import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '@/lib/auth';
import { tools, runTool } from '@/lib/agent/tools';
import { buildSystemPrompt } from '@/lib/agent/system-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-4-8';
const MAX_TOOL_TURNS = 8;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  // Auth — same session cookie that protects the dashboard.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'El asistente no está configurado: falta ANTHROPIC_API_KEY en el servidor.' },
      { status: 503 },
    );
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

  const client = new Anthropic();
  const system = buildSystemPrompt();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  try {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system,
        tools,
        messages,
      });

      if (response.stop_reason === 'tool_use') {
        // Preserve the full assistant turn (thinking + tool_use blocks) before replying with results.
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await runTool(block.name, block.input as Record<string, unknown>);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          }
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Terminal turn — collect the visible text.
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      return NextResponse.json({ reply: reply || 'No tengo una respuesta para eso.' });
    }

    return NextResponse.json(
      { reply: 'La consulta requirió demasiados pasos. Intenta reformular la pregunta de forma más específica.' },
    );
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'La clave de API de Anthropic es inválida.' }, { status: 502 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'El asistente está saturado. Intenta de nuevo en unos segundos.' }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('Agent error:', err);
    return NextResponse.json({ error: `Error del asistente: ${message}` }, { status: 500 });
  }
}
