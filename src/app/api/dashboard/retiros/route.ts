import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const getSupervisors = searchParams.get("getSupervisors");
    const getActiveAperturas = searchParams.get("getActiveAperturas");

    if (getSupervisors === "true") {
      // Fetch active users to act as supervisors
      const sql = `
        SELECT IdUsuario, Nombre
        FROM tblUsuarios
        ORDER BY Nombre ASC
      `;
      const supervisors = await query(sql);
      return NextResponse.json({ success: true, data: supervisors });
    }

    if (getActiveAperturas === "true") {
      // Fetch currently open box sessions (FechaCierre is typically NULL or '0000-00-00 00:00:00' if not closed, but we can just fetch the most recent ones)
      const sql = `
        SELECT A.IdApertura, A.FechaApertura, U.Nombre AS Cajero
        FROM tblAperturasCierres A
        LEFT JOIN tblUsuarios U ON A.IdCajero = U.IdUsuario
        ORDER BY A.IdApertura DESC
        LIMIT 20
      `;
      const aperturas = await query(sql);
      return NextResponse.json({ success: true, data: aperturas });
    }

    // Default: fetch retiros for date range
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    let condition = "1=1";
    const params: any[] = [];

    if (dateFrom && dateTo) {
      condition += " AND DATE(R.Fecha) >= ? AND DATE(R.Fecha) <= ?";
      params.push(dateFrom, dateTo);
    } else {
      // default to today
      condition += " AND DATE(R.Fecha) = CURDATE()";
    }

    const sql = `
      SELECT 
        R.IdRetiro,
        R.IdApertura,
        R.Efectivo,
        R.Concepto,
        R.Fecha,
        R.IdSupervisor,
        USup.Usuario AS Supervisor,
        A.IdCajero,
        UCaj.Usuario AS Cajero
      FROM tblRetiros R
      LEFT JOIN tblUsuarios USup ON R.IdSupervisor = USup.IdUsuario
      LEFT JOIN tblAperturasCierres A ON R.IdApertura = A.IdApertura
      LEFT JOIN tblUsuarios UCaj ON A.IdCajero = UCaj.IdUsuario
      WHERE ${condition}
      ORDER BY R.Fecha DESC
    `;

    const rows = await query(sql, params);

    // Calculate KPIs
    let totalEfectivo = 0;
    let maxRetiro = 0;
    const transacciones = Array.isArray(rows) ? rows.length : 0;

    if (Array.isArray(rows)) {
      rows.forEach((r: any) => {
        const amt = Number(r.Efectivo) || 0;
        totalEfectivo += amt;
        if (amt > maxRetiro) maxRetiro = amt;
      });
    }

    const promedio = transacciones > 0 ? totalEfectivo / transacciones : 0;

    return NextResponse.json({
      success: true,
      data: rows,
      kpis: {
        totalEfectivo,
        transacciones,
        promedio,
        maxRetiro
      }
    });

  } catch (error: any) {
    console.error("Error in GET /api/dashboard/retiros:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idApertura, monto, concepto, idSupervisor, passwordSupervisor } = body;

    if (!idApertura || !monto || !concepto || !idSupervisor || !passwordSupervisor) {
      return NextResponse.json({ success: false, error: "Faltan campos requeridos" }, { status: 400 });
    }

    // Verify supervisor password
    const verifySql = `
      SELECT IdUsuario FROM tblUsuarios WHERE IdUsuario = ? AND Contrasena = ?
    `;
    const users: any = await query(verifySql, [idSupervisor, passwordSupervisor]);

    if (!users || users.length === 0) {
      return NextResponse.json({ success: false, error: "Contraseña de supervisor incorrecta" }, { status: 401 });
    }

    // Insert retiro (we hardcode IdComputadora = 1 as standard for now, unless provided)
    const idComputadora = body.idComputadora || 1;

    const insertSql = `
      INSERT INTO tblRetiros (IdComputadora, IdApertura, Efectivo, Concepto, Fecha, IdSupervisor)
      VALUES (?, ?, ?, ?, NOW(), ?)
    `;

    const result: any = await query(insertSql, [idComputadora, idApertura, monto, concepto, idSupervisor]);

    return NextResponse.json({ success: true, insertId: result.insertId });

  } catch (error: any) {
    console.error("Error in POST /api/dashboard/retiros:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
