import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getBillingAmounts } from '@/lib/billing';
import { getPool, query } from '@/lib/db';
import { ensureInvoiceTable, PUBLIC_GENERAL } from '@/lib/invoice-store';
import { getTicketFiscalSummary } from '@/lib/taxes';

type TicketKey={idApertura:number;idVenta:number};
type SaleRow={IdApertura:number;IdVenta:number;Folio:string;FechaVenta:string;FechaOperacion:string;Total:number};
type Recipient={rfc:string;razonSocial:string;codigoPostal:string;regimenFiscal:string;usoCFDI:string;correo?:string};
const clean=(value:unknown)=>String(value??'').trim().toUpperCase();
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'Error desconocido';
const errorCode=(error:unknown)=>typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';
async function authenticated(){try{return Boolean(await getSession())}catch{return false}}
function recipientError(value:Recipient){if(!/^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(value.rfc))return'El RFC no es válido';if(value.razonSocial.length<2)return'Captura la razón social';if(!/^\d{5}$/.test(value.codigoPostal))return'El código postal fiscal no es válido';if(!/^\d{3}$/.test(value.regimenFiscal))return'El régimen fiscal no es válido';if(!/^[A-Z0-9]{3}$/.test(value.usoCFDI))return'El uso de CFDI no es válido';return''}

export async function GET(request:NextRequest){
  if(!(await authenticated()))return NextResponse.json({error:'Sesión no válida'},{status:401});
  try{
    await ensureInvoiceTable();
    const from=request.nextUrl.searchParams.get('from')||'2000-01-01';
    const to=request.nextUrl.searchParams.get('to')||'2999-12-31';
    const invoices=await query(`SELECT * FROM tblFacturasDashboard WHERE FechaOperacion BETWEEN ? AND ? ORDER BY IdFactura DESC`,[from,to]);
    if(!invoices.length)return NextResponse.json({invoices:[]});
    const ids=invoices.map(row=>Number(row.IdFactura));
    const placeholders=ids.map(()=>'?').join(',');
    const tickets=await query(`SELECT * FROM tblFacturaTicketsDashboard WHERE IdFactura IN (${placeholders}) ORDER BY FechaVenta,Folio`,ids);
    const byInvoice=new Map<number,unknown[]>();
    for(const ticket of tickets){const id=Number(ticket.IdFactura);const list=byInvoice.get(id)||[];list.push(ticket);byInvoice.set(id,list)}
    return NextResponse.json({invoices:invoices.map(invoice=>({...invoice,tickets:byInvoice.get(Number(invoice.IdFactura))||[]}))});
  }catch(error:unknown){console.error('Error listing invoices:',error);return NextResponse.json({error:errorMessage(error)},{status:500})}
}

export async function POST(request:NextRequest){
  if(!(await authenticated()))return NextResponse.json({error:'Sesión no válida'},{status:401});
  try{
    await ensureInvoiceTable();
    const body=await request.json();
    const mode=String(body.mode||'cliente') as 'cliente'|'publico_general'|'global';
    const operationDate=String(body.fecha||'');
    const issuerPostal=String(process.env.ISSUER_POSTAL_CODE||body.codigoPostalExpedicion||'').trim();
    if(!['cliente','publico_general','global'].includes(mode))return NextResponse.json({error:'El tipo de factura no es válido'},{status:400});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(operationDate))return NextResponse.json({error:'Selecciona una fecha válida'},{status:400});
    if(!/^\d{5}$/.test(issuerPostal))return NextResponse.json({error:'Captura el C.P. de expedición'},{status:400});

    let keys:TicketKey[]=[];
    if(mode==='global'){
      const activeGlobal=await query(`SELECT IdFactura FROM tblFacturasDashboard WHERE Tipo='global' AND FechaOperacion=? AND Estado<>'cancelada' LIMIT 1`,[operationDate]);
      if(activeGlobal[0])return NextResponse.json({error:'Ya existe una factura global activa para este día'},{status:409});
      const eligible=await query(`
        SELECT V.IdApertura idApertura,V.IdVenta idVenta
        FROM tblVentas V
        LEFT JOIN tblFacturaTicketsDashboard FT ON FT.IdApertura=V.IdApertura AND FT.IdVenta=V.IdVenta AND FT.AsignacionActiva=1
        LEFT JOIN tblSolicitudesFacturaDashboard S ON S.IdApertura=V.IdApertura AND S.IdVenta=V.IdVenta AND S.Estado<>'cancelada'
        LEFT JOIN tblDetalleFacturaGlobalDashboard OG ON OG.IdApertura=V.IdApertura AND OG.IdVenta=V.IdVenta
        WHERE DATE(V.FechaVenta)=? AND COALESCE(V.Cancelada,0)=0 AND FT.IdFactura IS NULL AND S.IdSolicitud IS NULL AND OG.IdVenta IS NULL
        ORDER BY V.IdApertura,V.IdVenta`,[operationDate]);
      keys=eligible.map(row=>({idApertura:Number(row.idApertura),idVenta:Number(row.idVenta)}));
    }else{
      const raw:Record<string,unknown>[]=Array.isArray(body.tickets)?body.tickets:[];
      keys=raw.map((item:Record<string,unknown>)=>({idApertura:Number(item.idApertura),idVenta:Number(item.idVenta)})).filter(item=>Number.isInteger(item.idApertura)&&Number.isInteger(item.idVenta));
    }
    const unique=new Map(keys.map(key=>[`${key.idApertura}:${key.idVenta}`,key]));keys=[...unique.values()];
    if(!keys.length)return NextResponse.json({error:mode==='global'?'No hay tickets disponibles para la global':'Selecciona al menos un ticket'},{status:400});
    if(keys.length>500)return NextResponse.json({error:'La factura no puede contener más de 500 tickets'},{status:400});

    const tuple=keys.map(()=>'(?,?)').join(',');const params=keys.flatMap(key=>[key.idApertura,key.idVenta]);
    const sales=await query(`SELECT IdApertura,IdVenta,CONCAT(IdApertura,'-',IdVenta) Folio,FechaVenta,DATE_FORMAT(FechaVenta,'%Y-%m-%d') FechaOperacion,Total FROM tblVentas WHERE (IdApertura,IdVenta) IN (${tuple}) AND COALESCE(Cancelada,0)=0`,params) as SaleRow[];
    if(sales.length!==keys.length)return NextResponse.json({error:'Uno o más tickets no existen o fueron cancelados'},{status:409});
    if(sales.some(sale=>sale.FechaOperacion!==operationDate)&&mode==='global')return NextResponse.json({error:'La global solo puede incluir tickets del día seleccionado'},{status:400});
    const details=await Promise.all(sales.map(async sale=>{const fiscal=await getTicketFiscalSummary(sale.IdApertura,sale.IdVenta);const tip=getBillingAmounts(sale.Total,sale.IdApertura,sale.IdVenta).tip;return{...sale,...fiscal,tip}}));
    const totals=details.reduce((sum,item)=>({base:sum.base+item.base,iva:sum.iva+item.iva,ieps:sum.ieps+item.ieps,consumption:sum.consumption+item.consumption,tips:sum.tips+item.tip}),{base:0,iva:0,ieps:0,consumption:0,tips:0});
    const recipient:Recipient=mode==='cliente'?{rfc:clean(body.rfc),razonSocial:clean(body.razonSocial).replace(/\s+/g,' '),codigoPostal:clean(body.codigoPostalFiscal),regimenFiscal:clean(body.regimenFiscal),usoCFDI:clean(body.usoCFDI),correo:String(body.correo||'').trim().toLowerCase()}:{rfc:PUBLIC_GENERAL.rfc,razonSocial:PUBLIC_GENERAL.legalName,codigoPostal:issuerPostal,regimenFiscal:PUBLIC_GENERAL.taxRegime,usoCFDI:PUBLIC_GENERAL.cfdiUse};
    const invalid=recipientError(recipient);if(invalid)return NextResponse.json({error:invalid},{status:400});

    const pool=await getPool();const connection=await pool.getConnection();
    try{
      await connection.beginTransaction();
      const [locked]=await connection.query(`SELECT IdApertura,IdVenta FROM tblVentas WHERE (IdApertura,IdVenta) IN (${tuple}) FOR UPDATE`,params);
      if((locked as unknown[]).length!==keys.length)throw new Error('No fue posible bloquear todos los tickets');
      const [used]=await connection.query(`SELECT IdApertura,IdVenta FROM tblFacturaTicketsDashboard WHERE (IdApertura,IdVenta) IN (${tuple}) AND AsignacionActiva=1 LIMIT 1`,params);
      if((used as unknown[]).length)throw Object.assign(new Error('Uno de los tickets ya pertenece a otra factura'),{code:'TICKET_USED'});
      const periodic=mode==='global';
      const [header]=await connection.execute(`INSERT INTO tblFacturasDashboard (Tipo,FechaOperacion,RFC,RazonSocial,CodigoPostal,CodigoPostalExpedicion,RegimenFiscal,UsoCFDI,Correo,Periodicidad,Meses,Anio,NumTickets,BaseGravable,IVA,IEPS,ConsumoFacturable,Propinas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[mode,operationDate,recipient.rfc,recipient.razonSocial,recipient.codigoPostal,issuerPostal,recipient.regimenFiscal,recipient.usoCFDI,recipient.correo||null,periodic?'01':null,periodic?operationDate.slice(5,7):null,periodic?Number(operationDate.slice(0,4)):null,details.length,totals.base,totals.iva,totals.ieps,totals.consumption,totals.tips]);
      const idFactura=(header as {insertId:number}).insertId;
      for(const item of details)await connection.execute(`INSERT INTO tblFacturaTicketsDashboard (IdFactura,IdApertura,IdVenta,Folio,FechaVenta,BaseGravable,IVA,IEPS,ConsumoFacturable,Propina) VALUES (?,?,?,?,?,?,?,?,?,?)`,[idFactura,item.IdApertura,item.IdVenta,item.Folio,item.FechaVenta,item.base,item.iva,item.ieps,item.consumption,item.tip]);
      await connection.commit();
      return NextResponse.json({success:true,idFactura,message:`Factura F-${String(idFactura).padStart(6,'0')} creada con ${details.length} ticket${details.length===1?'':'s'}`,status:'pendiente_timbrado'},{status:201});
    }catch(error){await connection.rollback();throw error}finally{connection.release()}
  }catch(error:unknown){if(['ER_DUP_ENTRY','TICKET_USED'].includes(errorCode(error)))return NextResponse.json({error:'Uno de los tickets ya pertenece a otra factura'},{status:409});console.error('Error creating invoice:',error);return NextResponse.json({error:errorMessage(error)},{status:500})}
}

export async function DELETE(request:NextRequest){
  if(!(await authenticated()))return NextResponse.json({error:'Sesión no válida'},{status:401});
  try{
    await ensureInvoiceTable();const body=await request.json();const idFactura=Number(body.idFactura);const motivo=String(body.motivo||'Cancelada antes de timbrar').trim().slice(0,254);
    if(!Number.isInteger(idFactura))return NextResponse.json({error:'La factura no es válida'},{status:400});
    const pool=await getPool();const connection=await pool.getConnection();
    try{await connection.beginTransaction();const [rows]=await connection.query(`SELECT Estado,UUID FROM tblFacturasDashboard WHERE IdFactura=? FOR UPDATE`,[idFactura]);const invoice=(rows as {Estado:string;UUID:string|null}[])[0];if(!invoice)throw Object.assign(new Error('La factura no existe'),{code:'NOT_FOUND'});if(invoice.Estado!=='pendiente_timbrado'||invoice.UUID)throw Object.assign(new Error('Solo se pueden cancelar facturas que todavía no han sido timbradas'),{code:'STAMPED'});await connection.execute(`UPDATE tblFacturasDashboard SET Estado='cancelada',CanceladaEn=NOW(),MotivoCancelacion=? WHERE IdFactura=?`,[motivo,idFactura]);await connection.execute(`UPDATE tblFacturaTicketsDashboard SET AsignacionActiva=NULL WHERE IdFactura=?`,[idFactura]);await connection.commit();return NextResponse.json({success:true,message:'Factura cancelada; sus tickets quedaron disponibles nuevamente'})}catch(error){await connection.rollback();throw error}finally{connection.release()}
  }catch(error:unknown){const status=errorCode(error)==='NOT_FOUND'?404:errorCode(error)==='STAMPED'?409:500;return NextResponse.json({error:errorMessage(error)},{status})}
}
