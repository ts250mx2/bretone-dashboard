import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

// Helper to format currency in MXN
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'El asistente no está configurado: falta ANTHROPIC_API_KEY en el servidor.' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const {
      dateFrom,
      dateTo,
      totalStandard,
      totalReal,
      alignmentIndex,
      timeByCategory = [],
      timeByProduct = [],
    } = body;

    const diff = totalStandard - totalReal;

    const prompt = `
Actúa como Brioche, el consultor analítico de negocios de "La Petite Bretonne".
Analiza la comparación horaria y tiempos de servicio del periodo ${dateFrom} al ${dateTo}:
- Ventas registradas administrativamente (Cierre / FechaVenta): ${fmt(totalStandard)}
- Ventas reales en cocina (Cocina / Fecha): ${fmt(totalReal)}
- El desfase total acumulado (Standard - Real) es: ${fmt(diff)}
- El índice de coincidencia operativa es: ${Number(alignmentIndex || 0).toFixed(1)}%

Top categorías que toman más tiempo en cerrarse (desfase promedio desde orden a cobro final):
${timeByCategory.slice(0, 5).map((c: any) => `- ${c.nombre}: promedio ${c.tiempoPromedio} mins (${c.cantidad} uds)`).join('\n')}

Top 5 platillos con mayor tiempo transcurrido desde orden a ticket final:
${timeByProduct.slice(0, 5).map((p: any) => `- ${p.nombre} (${p.categoria}): promedio ${p.tiempoPromedio} mins (${p.cantidad} uds)`).join('\n')}

Por favor, elabora un análisis estructurado y resumido (3 párrafos cortos) en tono profesional, asertivo y amigable:
1. **Párrafo 1 (Desfase de Curvas)**: Diagnóstico de la coincidencia operativa e interpretación de las horas pico de preparación frente al registro administrativo del ticket.
2. **Párrafo 2 (Análisis de Bottlenecks / Cuellos de Botella)**: Cuáles categorías/platillos toman más tiempo en facturarse/cerrarse desde su orden y qué repercusiones operativas tiene (ej. retención de comandas abiertas, demoras en cobros, sobrecarga de servicio).
3. **Párrafo 3 (Recomendaciones de Acción)**: Dos recomendaciones de acción concretas y realistas para mitigar este desalineamiento (por ejemplo, automatización de comandas, agilización del cobro móvil en mesa, pre-facturación de combos, etc.).

No añadas saludos formalistas, ve directo al grano, usando formato markdown limpio y subtítulos elegantes.
`;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return NextResponse.json({ summary: reply || 'No fue posible generar el resumen.' });
  } catch (error: any) {
    console.error('Error generating AI Summary:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
