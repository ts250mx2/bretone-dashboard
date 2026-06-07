import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idApertura = searchParams.get('idApertura');
    const idCaja = searchParams.get('idCaja') || '1';

    if (!idApertura) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Get opening/closing master data
    const masterSql = `
      SELECT A.*, 
             C.Usuario AS SupervisorApertura, 
             D.Usuario AS SupervisorCierre
      FROM tblAperturasCierres A
      LEFT JOIN tblUsuarios C ON A.IdSupervisorApertura = C.IdUsuario
      LEFT JOIN tblUsuarios D ON A.IdSupervisorCierre = D.IdUsuario
      WHERE A.IdApertura = ?
    `;
    const masterRows = await query(masterSql, [idApertura]);
    if (!masterRows || masterRows.length === 0) {
      return NextResponse.json({ error: 'Sesión de apertura no encontrada' }, { status: 404 });
    }
    const master = masterRows[0];

    // 2. Get cash vs card payments breakdown
    const paymentsSql = `
      SELECT 
          COALESCE(SUM(Efectivo), 0) AS CashSales,
          COALESCE(SUM(Tarjeta), 0) AS CardSales
      FROM tblVentas
      WHERE IdApertura = ? AND Cancelada = 0
    `;
    const paymentRows = await query(paymentsSql, [idApertura]);
    const cashFromSales = Number(paymentRows[0]?.CashSales || 0);
    const cardFromSales = Number(paymentRows[0]?.CardSales || 0);
    const totalVentasCalculated = cashFromSales + cardFromSales;

    // 3. Get cancellations count & total
    const cancellationsSql = `
      SELECT COUNT(*) AS Cantidad, COALESCE(SUM(Total), 0) AS Monto
      FROM tblVentas
      WHERE IdApertura = ? AND Cancelada > 0
    `;
    const cancels = await query(cancellationsSql, [idApertura]);
    const cancelQty = cancels[0]?.Cantidad || 0;
    const cancelMonto = Number(cancels[0]?.Monto || 0);

    // 4. Calculate figures
    const fondoCaja = Number(master.FondoCaja || 0);
    const efectivoCierre = Number(master.Efectivo || 0);
    const expectedCash = fondoCaja + cashFromSales;
    
    const isClosed = master.FechaCierre && master.FechaCierre !== '0000-00-00 00:00:00';
    const cashDiscrepancy = isClosed ? (efectivoCierre - expectedCash) : 0;

    // Format dates
    const dateApertura = new Date(master.FechaApertura).toLocaleString('es-MX');
    const dateCierre = isClosed 
        ? new Date(master.FechaCierre).toLocaleString('es-MX')
        : 'SESIÓN ABIERTA / ACTIVA';

    // Helper functions for monospaced printing
    const formatCurrency = (num: number) => {
        return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    const pad = (text: string, length: number, char = ' ', right = false) => {
        const str = String(text);
        if (str.length >= length) return str.substring(0, length);
        const remaining = length - str.length;
        if (right) {
            return char.repeat(remaining) + str;
        }
        return str + char.repeat(remaining);
    };

    // 5. Generate monospaced Z Cut text layout
    let ticket = '';
    ticket += `==========================================\n`;
    ticket += `           TICKET DE ARQUEO / Z           \n`;
    ticket += `         LA PETITE BRETONNE COUNTRY       \n`;
    ticket += `==========================================\n\n`;
    ticket += `CAJA NÚM: ${idCaja}       ARQUEO Z: ${idApertura}\n`;
    ticket += `------------------------------------------\n`;
    ticket += `APERTURA : ${dateApertura}\n`;
    ticket += `RESP. AP : ${(master.SupervisorApertura || 'ADMIN').toUpperCase()}\n`;
    ticket += `------------------------------------------\n`;
    ticket += `CIERRE   : ${dateCierre}\n`;
    if (isClosed) {
        ticket += `RESP. CI : ${(master.SupervisorCierre || 'SISTEMA').toUpperCase()}\n`;
    }
    ticket += `==========================================\n\n`;

    ticket += `RESUMEN DE FLUJOS:\n`;
    ticket += `${pad('  FONDO DE CAJA INICIAL:', 27)} ${pad(formatCurrency(fondoCaja), 13, ' ', true)}\n`;
    ticket += `${pad('  (+) VENTAS REGISTRADAS:', 27)} ${pad(formatCurrency(totalVentasCalculated), 13, ' ', true)}\n`;
    ticket += `------------------------------------------\n`;

    ticket += `DESGLOSE DE VENTAS POR MEDIO DE PAGO:\n`;
    ticket += `  - ${pad('EFECTIVO', 23)} ${pad(formatCurrency(cashFromSales), 13, ' ', true)}\n`;
    ticket += `  - ${pad('TARJETA', 23)} ${pad(formatCurrency(cardFromSales), 13, ' ', true)}\n`;
    ticket += `------------------------------------------\n\n`;

    ticket += `AUDITORÍA DE EFECTIVO:\n`;
    ticket += `${pad('  EFECTIVO ESPERADO CAJA:', 27)} ${pad(formatCurrency(expectedCash), 13, ' ', true)}\n`;
    if (isClosed) {
        ticket += `${pad('  EFECTIVO DECLARADO (Z):', 27)} ${pad(formatCurrency(efectivoCierre), 13, ' ', true)}\n`;
        ticket += `  ----------------------------------------\n`;
        if (cashDiscrepancy === 0) {
            ticket += `  RESULTADO AUDITORÍA:     CAJA CUADRADA ($0.00)\n`;
        } else if (cashDiscrepancy > 0) {
            ticket += `  RESULTADO AUDITORÍA:     ${pad(`SOBRANTE (+${formatCurrency(cashDiscrepancy)})`, 25)}\n`;
        } else {
            ticket += `  RESULTADO AUDITORÍA:     ${pad(`FALTANTE (-${formatCurrency(Math.abs(cashDiscrepancy))})`, 25)}\n`;
        }
    } else {
        ticket += `  ESTADO ACTUAL:           CAJA EN CURSO\n`;
    }
    ticket += `==========================================\n\n`;

    ticket += `CONTROL DE CANCELACIONES:\n`;
    ticket += `  MOVIMIENTOS:  ${cancelQty}\n`;
    ticket += `  MONTO TOTAL:  ${formatCurrency(cancelMonto)}\n`;
    ticket += `==========================================\n\n`;

    ticket += `FIRMADA POR EL CAJERO Y SUPERVISOR\n\n\n`;
    ticket += `     _________________    _________________\n`;
    ticket += `          CAJERO             SUPERVISOR    \n\n`;
    ticket += `           La Petite Bretonne             \n`;
    ticket += `==========================================\n`;

    return NextResponse.json({ ticket });
  } catch (error: any) {
    console.error('Error generating Z-cut closing ticket:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
