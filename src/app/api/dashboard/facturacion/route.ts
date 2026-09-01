import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildSelfInvoiceUrl, createSelfInvoiceToken, getBillingAmounts, getSelfInvoiceExpiry } from '@/lib/billing';
import { getPool, query } from '@/lib/db';
import { ensureInvoiceTable, PUBLIC_GENERAL } from '@/lib/invoice-store';
import { getTicketFiscalSummary } from '@/lib/taxes';

type TicketRow = {
  IdApertura:number; IdVenta:number; FechaVenta:string; Total:number; IdSolicitud?:number;
  IdFacturaGlobal?:number; IdFactura?:number; [key:string]:unknown;
};
type Recipient = { rfc:string; razonSocial:string; codigoPostal:string; regimenFiscal:string; usoCFDI:string; correo?:string };
const message = (error:unknown) => error instanceof Error ? error.message : 'Error desconocido';
const code = (error:unknown) => typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
const clean = (value:unknown) => String(value ?? '').trim().toUpperCase();

async function authenticated() { try { return Boolean(await getSession()) } catch { return false } }

function validateRecipient(input:Recipient) {
  if (!/^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(input.rfc)) return 'El RFC no es válido';
  if (input.razonSocial.length < 2) return 'Captura la razón social';
  if (!/^\d{5}$/.test(input.codigoPostal)) return 'El código postal fiscal no es válido';
  if (!/^\d{3}$/.test(input.regimenFiscal)) return 'El régimen fiscal no es válido';
  if (!/^[A-Z0-9]{3}$/.test(input.usoCFDI)) return 'El uso de CFDI no es válido';
  return '';
}

export async function GET(request:NextRequest) {
  if (!(await authenticated())) return NextResponse.json({error:'Sesión no válida'},{status:401});
  const fecha=request.nextUrl.searchParams.get('fecha');
  if(!fecha||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({error:'La fecha es obligatoria'},{status:400});
  try {
    await ensureInvoiceTable();
    const [rows, globals] = await Promise.all([
      query(`
        SELECT V.IdApertura,V.IdVenta,CONCAT(V.IdApertura,'-',V.IdVenta) Folio,V.FechaVenta,
               COALESCE(NULLIF(V.Cliente,''),'Público general') Cliente,V.Total,
               S.IdSolicitud,S.TipoReceptor,S.RFC,S.RazonSocial,S.Estado,S.UUID,S.CreadaEn,
               GD.IdFacturaGlobal,G.Estado EstadoGlobal,G.UUID UUIDGlobal,
               FT.IdFactura,F.Tipo TipoFactura,F.Estado EstadoFactura
        FROM tblVentas V
        LEFT JOIN tblSolicitudesFacturaDashboard S ON S.IdApertura=V.IdApertura AND S.IdVenta=V.IdVenta
        LEFT JOIN tblDetalleFacturaGlobalDashboard GD ON GD.IdApertura=V.IdApertura AND GD.IdVenta=V.IdVenta
        LEFT JOIN tblFacturasGlobalesDashboard G ON G.IdFacturaGlobal=GD.IdFacturaGlobal
        LEFT JOIN tblFacturaTicketsDashboard FT ON FT.IdApertura=V.IdApertura AND FT.IdVenta=V.IdVenta AND FT.AsignacionActiva=1
        LEFT JOIN tblFacturasDashboard F ON F.IdFactura=FT.IdFactura
        WHERE DATE(V.FechaVenta)=? AND COALESCE(V.Cancelada,0)=0
        ORDER BY V.FechaVenta DESC`,[fecha]),
      query(`SELECT * FROM tblFacturasGlobalesDashboard WHERE FechaOperacion=? ORDER BY IdFacturaGlobal DESC`,[fecha]),
    ]);

    const tickets=await Promise.all(rows.map(async(row:TicketRow)=>{
      const [fiscal, amounts]=await Promise.all([
        getTicketFiscalSummary(row.IdApertura,row.IdVenta),
        Promise.resolve(getBillingAmounts(row.Total,row.IdApertura,row.IdVenta)),
      ]);
      const token=createSelfInvoiceToken(row.IdApertura,row.IdVenta,row.FechaVenta);
      const expiresAt=getSelfInvoiceExpiry(row.FechaVenta);
      return {...row,...amounts,fiscal,expiresAt,selfInvoiceAvailable:!row.IdSolicitud&&!row.IdFacturaGlobal&&!row.IdFactura&&expiresAt.getTime()>=Date.now(),selfInvoiceUrl:buildSelfInvoiceUrl(request.nextUrl.origin,token)};
    }));
    const latestRows = tickets.length ? [] : await query(`SELECT DATE_FORMAT(MAX(FechaVenta),'%Y-%m-%d') AS LatestDate FROM tblVentas WHERE COALESCE(Cancelada,0)=0`);
    return NextResponse.json({tickets,globalInvoice:globals[0]||null,latestDate:latestRows[0]?.LatestDate||null,issuerPostalCode:String(process.env.ISSUER_POSTAL_CODE||'').trim()||null,taxDefaults:{iva:Number(process.env.DEFAULT_RESTAURANT_IVA_RATE||16),ieps:0,source:'Configuración fiscal del dashboard'}});
  } catch(error:unknown){console.error('Error loading billing center:',error);return NextResponse.json({error:message(error)||'No fue posible consultar la facturación'},{status:500})}
}

export async function POST(request:NextRequest) {
  if (!(await authenticated())) return NextResponse.json({error:'Sesión no válida'},{status:401});
  try {
    await ensureInvoiceTable();
    const body=await request.json();
    const action=String(body.action||'individual_general');
    if(action==='tax_config') {
      const idProducto=Number(body.idProducto),iva=Number(body.iva),ieps=Number(body.ieps);
      if(!Number.isInteger(idProducto)||idProducto<=0||iva<0||iva>100||ieps<0||ieps>100) return NextResponse.json({error:'Las tasas fiscales no son válidas'},{status:400});
      await query(`INSERT INTO tblConfiguracionFiscalProductosDashboard (IdProducto,TasaIVA,TasaIEPS) VALUES (?,?,?) ON DUPLICATE KEY UPDATE TasaIVA=VALUES(TasaIVA),TasaIEPS=VALUES(TasaIEPS)`,[idProducto,iva,ieps]);
      return NextResponse.json({success:true,message:'Tasas fiscales actualizadas'});
    }
    const postalCode=String(process.env.ISSUER_POSTAL_CODE||body.codigoPostal||'').trim();
    if(!/^\d{5}$/.test(postalCode)) return NextResponse.json({error:'Captura el código postal de expedición'},{status:400});

    if(action==='global_day') {
      const fecha=String(body.fecha||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({error:'Selecciona una fecha válida'},{status:400});
      const existing=await query(`SELECT IdFacturaGlobal FROM tblFacturasGlobalesDashboard WHERE FechaOperacion=? LIMIT 1`,[fecha]);
      if(existing[0]) return NextResponse.json({error:'Ya existe una factura global para este día'},{status:409});
      const eligible=await query(`
        SELECT V.IdApertura,V.IdVenta,V.Total
        FROM tblVentas V
        LEFT JOIN tblSolicitudesFacturaDashboard S ON S.IdApertura=V.IdApertura AND S.IdVenta=V.IdVenta
        LEFT JOIN tblDetalleFacturaGlobalDashboard G ON G.IdApertura=V.IdApertura AND G.IdVenta=V.IdVenta
        WHERE DATE(V.FechaVenta)=? AND COALESCE(V.Cancelada,0)=0 AND S.IdSolicitud IS NULL AND G.IdVenta IS NULL
        ORDER BY V.IdApertura,V.IdVenta`,[fecha]);
      if(!eligible.length) return NextResponse.json({error:'No hay tickets disponibles para la factura global'},{status:409});
      const details=await Promise.all(eligible.map(async(row:{IdApertura:number;IdVenta:number;Total:number})=>{
        const fiscal=await getTicketFiscalSummary(row.IdApertura,row.IdVenta);
        const tip=getBillingAmounts(row.Total,row.IdApertura,row.IdVenta).tip;
        return {...row,...fiscal,tip};
      }));
      const totals=details.reduce((sum,item)=>({base:sum.base+item.base,iva:sum.iva+item.iva,ieps:sum.ieps+item.ieps,consumption:sum.consumption+item.consumption,tips:sum.tips+item.tip}),{base:0,iva:0,ieps:0,consumption:0,tips:0});
      const pool=await getPool(); const connection=await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [header]=await connection.execute(`INSERT INTO tblFacturasGlobalesDashboard (FechaOperacion,Periodicidad,Meses,Anio,CodigoPostal,NumTickets,BaseGravable,IVA,IEPS,ConsumoFacturable,Propinas) VALUES (?,'01',LPAD(MONTH(?),2,'0'),YEAR(?),?,?,?,?,?,?,?)`,[fecha,fecha,fecha,postalCode,details.length,totals.base,totals.iva,totals.ieps,totals.consumption,totals.tips]);
        const idGlobal=(header as {insertId:number}).insertId;
        for(const item of details) await connection.execute(`INSERT INTO tblDetalleFacturaGlobalDashboard (IdFacturaGlobal,IdApertura,IdVenta,BaseGravable,IVA,IEPS,ConsumoFacturable,Propina) VALUES (?,?,?,?,?,?,?,?)`,[idGlobal,item.IdApertura,item.IdVenta,item.base,item.iva,item.ieps,item.consumption,item.tip]);
        await connection.commit();
        return NextResponse.json({success:true,idFacturaGlobal:idGlobal,message:`Factura global diaria creada con ${details.length} tickets`,status:'pendiente_timbrado'},{status:201});
      } catch(error){await connection.rollback();throw error} finally {connection.release()}
    }

    const idApertura=Number(body.idApertura),idVenta=Number(body.idVenta);
    if(!Number.isInteger(idApertura)||!Number.isInteger(idVenta)) return NextResponse.json({error:'La comanda no es válida'},{status:400});
    const used=await query(`SELECT (SELECT COUNT(*) FROM tblSolicitudesFacturaDashboard WHERE IdApertura=? AND IdVenta=?)+(SELECT COUNT(*) FROM tblDetalleFacturaGlobalDashboard WHERE IdApertura=? AND IdVenta=?) AS Usada`,[idApertura,idVenta,idApertura,idVenta]);
    if(Number(used[0].Usada)>0) return NextResponse.json({error:'Esta comanda ya está incluida en una factura'},{status:409});
    const fiscal=await getTicketFiscalSummary(idApertura,idVenta);
    const amounts=getBillingAmounts(fiscal.consumption,idApertura,idVenta);
    const recipient:Recipient=action==='individual_cliente'?{rfc:clean(body.rfc),razonSocial:clean(body.razonSocial).replace(/\s+/g,' '),codigoPostal:clean(body.codigoPostalFiscal),regimenFiscal:clean(body.regimenFiscal),usoCFDI:clean(body.usoCFDI),correo:String(body.correo||'').trim().toLowerCase()}:{rfc:PUBLIC_GENERAL.rfc,razonSocial:PUBLIC_GENERAL.legalName,codigoPostal:postalCode,regimenFiscal:PUBLIC_GENERAL.taxRegime,usoCFDI:PUBLIC_GENERAL.cfdiUse};
    const recipientError=validateRecipient(recipient); if(recipientError) return NextResponse.json({error:recipientError},{status:400});
    await query(`INSERT INTO tblSolicitudesFacturaDashboard (IdApertura,IdVenta,TipoReceptor,RFC,RazonSocial,CodigoPostal,RegimenFiscal,UsoCFDI,Correo,ConsumoFacturable,Propina,PorcentajePropina,BaseGravable,IVA,IEPS) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[idApertura,idVenta,action==='individual_cliente'?'cliente':'publico_general',recipient.rfc,recipient.razonSocial,recipient.codigoPostal,recipient.regimenFiscal,recipient.usoCFDI,recipient.correo||null,fiscal.consumption,amounts.tip,amounts.tipPercentage,fiscal.base,fiscal.iva,fiscal.ieps]);
    return NextResponse.json({success:true,message:action==='individual_cliente'?'Factura individual creada y pendiente de timbrado':'Factura a público general creada y pendiente de timbrado',status:'pendiente_timbrado'},{status:201});
  } catch(error:unknown){if(code(error)==='ER_DUP_ENTRY')return NextResponse.json({error:'La factura ya existe o uno de sus tickets ya fue utilizado'},{status:409});console.error('Error creating invoice:',error);return NextResponse.json({error:message(error)||'No fue posible crear la factura'},{status:500})}
}
