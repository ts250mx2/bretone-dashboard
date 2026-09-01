import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { CFDI_MIME, CfdiFileKind, buildRelativePath, documentFileName, readCfdiFile, saveCfdiFile } from '@/lib/cfdi-storage';
import { query } from '@/lib/db';
import { downloadCfdiFile } from '@/lib/facturadigital';
import { ensureInvoiceTable } from '@/lib/invoice-store';

type RouteParams = { params: Promise<{ idFactura: string }> };
type DocumentRow = {
  UUID: string;
  FechaTimbrado: string | null;
  XmlRuta: string | null;
  PdfRuta: string | null;
  XmlUrl: string | null;
  PdfUrl: string | null;
  Xml: string | null;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Error desconocido');

async function authenticated() {
  try {
    return Boolean(await getSession());
  } catch {
    return false;
  }
}

/** Devuelve el archivo resguardado; si falta en disco lo recupera del PAC y lo vuelve a archivar. */
async function loadFile(idFactura: number, kind: CfdiFileKind, document: DocumentRow) {
  const storedPath = kind === 'xml' ? document.XmlRuta : document.PdfRuta;
  if (storedPath) {
    const cached = await readCfdiFile(storedPath);
    if (cached) return cached;
  }

  if (kind === 'xml' && document.Xml) return Buffer.from(document.Xml, 'utf8');

  const remoteUrl = kind === 'xml' ? document.XmlUrl : document.PdfUrl;
  if (!remoteUrl) return null;

  const file = await downloadCfdiFile(remoteUrl);
  const stampedAt = document.FechaTimbrado ? new Date(document.FechaTimbrado) : new Date();
  const relativePath = buildRelativePath(idFactura, document.UUID, kind, Number.isNaN(stampedAt.getTime()) ? new Date() : stampedAt);
  try {
    await saveCfdiFile(relativePath, file);
    await query(`UPDATE tblCfdiDocumentosDashboard SET ${kind === 'xml' ? 'XmlRuta' : 'PdfRuta'} = ? WHERE IdFactura = ?`, [relativePath, idFactura]);
  } catch (error) {
    console.error('No fue posible archivar el documento recuperado del PAC:', error);
  }
  return file;
}

export async function GET(request: NextRequest, context: RouteParams) {
  if (!(await authenticated())) return NextResponse.json({ error: 'Sesión no válida' }, { status: 401 });

  try {
    await ensureInvoiceTable();
    const idFactura = Number((await context.params).idFactura);
    const kind = (request.nextUrl.searchParams.get('tipo') || 'pdf').toLowerCase() as CfdiFileKind;
    const inline = request.nextUrl.searchParams.get('vista') === 'inline';
    if (!Number.isInteger(idFactura) || idFactura <= 0) return NextResponse.json({ error: 'La factura no es válida' }, { status: 400 });
    if (kind !== 'pdf' && kind !== 'xml') return NextResponse.json({ error: 'El tipo de documento no es válido' }, { status: 400 });

    const rows = await query(`SELECT * FROM tblCfdiDocumentosDashboard WHERE IdFactura = ?`, [idFactura]) as DocumentRow[];
    const document = rows[0];
    if (!document) return NextResponse.json({ error: 'La factura todavía no tiene un CFDI timbrado' }, { status: 404 });

    const file = await loadFile(idFactura, kind, document);
    if (!file) return NextResponse.json({ error: `No fue posible recuperar el ${kind.toUpperCase()} del comprobante` }, { status: 404 });

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': CFDI_MIME[kind],
        'Content-Length': String(file.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${documentFileName(idFactura, document.UUID, kind)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Error serving CFDI document:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
