This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Facturación por ticket

El módulo independiente `/dashboard/facturacion` permite crear una factura individual con datos fiscales, una factura individual a público general, una factura global diaria o copiar un enlace firmado para que el cliente capture sus datos. La ventana de autofacturación es de 3 días por defecto.

`/dashboard/facturacion` muestra el historial de facturas y sus tickets. `/dashboard/facturacion/nueva` permite seleccionar uno o varios tickets para una misma factura. Mientras una factura siga en `pendiente_timbrado` y no tenga UUID puede cancelarse; el historial se conserva y sus tickets vuelven a quedar disponibles.

La pantalla desglosa por ticket y concepto la base gravable, IVA, IEPS, consumo y propina. Debido a que el POS de origen guarda IVA en cero y no tiene una columna de IEPS, el dashboard inicia los productos con IVA 16 % e IEPS 0 %; ambas tasas pueden editarse por producto desde el desglose. Los precios se tratan como impuestos incluidos.

### Portal público para clientes

La ruta `/facturar` permite validar un ticket con su folio y total pagado, capturar los datos fiscales y registrar la solicitud sin iniciar sesión. Solo acepta tickets del mes actual o fechados dentro de los últimos cinco días naturales del mes anterior.

El total usado para validar incluye la propina; el registro fiscal conserva únicamente el consumo, con base, IVA e IEPS desglosados. La solicitud aparece en el historial administrativo como pendiente de timbrado.

Variables opcionales/recomendadas:

```env
INVOICE_SELF_SERVICE_DAYS=3
INVOICE_TOKEN_SECRET=una-clave-larga-y-privada
ISSUER_POSTAL_CODE=00000
```

La propina se calcula de forma pseudoaleatoria y estable por comanda entre 10 % y 20 %. Se guarda separada de `ConsumoFacturable` y no se incluye en el importe destinado al CFDI.

### Timbrado ante el SAT

Las facturas nacen en `pendiente_timbrado`. El botón **Timbrar** de `/dashboard/facturacion` genera el CFDI 4.0 y lo envía al PAC (Factura Digital, API v5, `POST /invoice/create`). Al recibir el UUID se guarda el XML timbrado y se descarga el PDF; la factura pasa a `timbrada` y cada renglón ofrece **PDF**, **XML** y **Enviar**.

- **Conceptos:** uno por ticket y por combinación de tasas, porque un concepto del CFDI no admite IVA/IEPS mezclados. Los precios del POS incluyen impuestos, así que la base se calcula hacia atrás; el total del CFDI siempre coincide al centavo con el ticket y el traslado queda dentro de la tolerancia de un centavo que acepta el SAT.
- **Forma de pago:** se deduce de `tblVentas.Tarjeta` (la que domine el importe) porque un CFDI `PUE` exige una forma concreta. `MetodoPago` siempre es `PUE`.
- **Factura global:** agrega el nodo `InformacionGlobal` con periodicidad diaria y usa las claves `01010101` / `ACT`.
- **Doble clic:** la factura se reserva con `TimbradoIniciadoEn` antes de llamar al PAC, de modo que dos clics simultáneos no consuman dos timbres. Si el PAC rechaza el comprobante, el motivo queda en `ErrorTimbrado` y la factura vuelve a estar disponible.
- **Resguardo:** el XML se guarda en la base (`tblCfdiDocumentosDashboard.Xml`) y, junto con el PDF, en `CFDI_STORAGE_DIR/AAAA/MM/` (por defecto `storage/cfdi`, ignorado por git). Si un archivo falta en disco al consultarlo, se vuelve a descargar del PAC y se archiva.
- **Correo:** al timbrar se envía automáticamente si la factura trae correo; el botón **Enviar** permite reenviarla a otra dirección. Todos los envíos quedan registrados en `tblCfdiEnviosDashboard`.

Una factura ya timbrada no se cancela desde el dashboard: la cancelación ante el SAT (`POST /invoice/cancel`) todavía no está expuesta en la interfaz.

Variables necesarias para timbrar:

```env
FACTURA_DIGITAL_API_URL=https://app.facturadigital.com.mx/api/v5
FACTURA_DIGITAL_API_KEY=<api key del panel del PAC>
ISSUER_POSTAL_CODE=<C.P. fiscal del restaurante>
ISSUER_TAX_REGIME=601
CFDI_SERIE=F
CFDI_CLAVE_PROD_SERV=90101501
CFDI_CLAVE_UNIDAD=E48
CFDI_FORMA_PAGO_EFECTIVO=01
CFDI_FORMA_PAGO_TARJETA=04
CFDI_STORAGE_DIR=
```

Para pruebas sin consumir timbres reales, apunta `FACTURA_DIGITAL_API_URL` a `https://sandbox-app.facturadigital.com.mx/api/v5` con la API key del portal sandbox.

Las tablas de control se crean automáticamente al abrir el módulo. También pueden instalarse con [`database/001_invoice_requests.sql`](database/001_invoice_requests.sql), [`database/002_complete_billing.sql`](database/002_complete_billing.sql), [`database/003_invoice_registry.sql`](database/003_invoice_registry.sql) y [`database/004_cfdi_timbrado.sql`](database/004_cfdi_timbrado.sql), en ese orden.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
