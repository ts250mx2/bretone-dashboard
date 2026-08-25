'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { Check, CheckCircle2, ChevronLeft, FileCheck2, LoaderCircle, LockKeyhole, ReceiptText, ShieldCheck } from 'lucide-react';
import styles from './portal.module.css';

type Ticket = {
  folio: string;
  date: string;
  consumption: number;
  tip: number;
  tipPercentage: number;
  total: number;
};

const money = (value: number) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
}).format(value || 0);

export default function InvoicePortalPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [claim, setClaim] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invoiceFolio, setInvoiceFolio] = useState('');

  async function validateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/facturacion/portal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate', ...values }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible validar el ticket');
      setTicket(data.ticket);
      setClaim(data.claim);
      setStep(2);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'No fue posible validar el ticket');
    } finally {
      setLoading(false);
    }
  }

  async function requestInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/facturacion/portal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invoice', claim, ...values }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible solicitar la factura');
      setInvoiceFolio(data.invoiceFolio);
      setStep(3);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'No fue posible solicitar la factura');
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setStep(1);
    setTicket(null);
    setClaim('');
    setError('');
    setInvoiceFolio('');
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <header className={styles.header}>
        <Image src="/logo.png" width={132} height={58} alt="La Petite Bretonne" priority />
        <div className={styles.headerRule} />
        <span>Portal de facturación</span>
      </header>

      <section className={styles.shell}>
        <div className={styles.intro}>
          <span className={styles.kicker}><ReceiptText size={15} /> Factura electrónica</span>
          <h1>Tu ticket,<br /><em>tu factura.</em></h1>
          <p>Ten a la mano tu ticket y tu constancia de situación fiscal. El proceso toma menos de dos minutos.</p>
          <div className={styles.eligibility}>
            <ShieldCheck size={21} />
            <p><strong>Vigencia de los tickets</strong><span>Puedes facturar consumos del mes actual y de los últimos 5 días del mes anterior.</span></p>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.progress} aria-label={`Paso ${step} de 3`}>
            {[1, 2, 3].map(number => (
              <div key={number} className={number <= step ? styles.progressActive : ''}>
                <span>{number < step ? <Check size={14} /> : number}</span>
                <small>{number === 1 ? 'Ticket' : number === 2 ? 'Datos fiscales' : 'Listo'}</small>
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className={styles.content}>
              <div className={styles.titleIcon}><ReceiptText /></div>
              <h2>Encuentra tu consumo</h2>
              <p className={styles.subtitle}>Captura los datos tal como aparecen en la parte inferior de tu ticket.</p>
              <form onSubmit={validateTicket} className={styles.lookupForm}>
                <label>Folio del ticket<input name="folio" required autoComplete="off" placeholder="Ej. 3865-47" /></label>
                <label>Total pagado<input name="total" required type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="$ 0.00" /></label>
                {error && <div className={styles.error}>{error}</div>}
                <button disabled={loading}>{loading ? <><LoaderCircle className={styles.spin} /> Validando…</> : <>Continuar <span>→</span></>}</button>
              </form>
              <p className={styles.privacy}><LockKeyhole size={14} /> Tus datos se usan únicamente para generar tu factura.</p>
            </div>
          )}

          {step === 2 && ticket && (
            <div className={styles.content}>
              <button className={styles.back} type="button" onClick={restart}><ChevronLeft /> Cambiar ticket</button>
              <div className={styles.ticketSummary}>
                <div><span>Ticket validado</span><strong>{ticket.folio}</strong><small>{new Date(ticket.date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</small></div>
                <div><span>Total pagado</span><strong>{money(ticket.total)}</strong><small>Se facturarán {money(ticket.consumption)}</small></div>
              </div>
              <h2>Datos fiscales</h2>
              <p className={styles.subtitle}>Escríbelos exactamente como aparecen en tu constancia fiscal.</p>
              <form onSubmit={requestInvoice} className={styles.fiscalForm}>
                <label>RFC<input name="rfc" required maxLength={13} autoCapitalize="characters" placeholder="RFC con homoclave" /></label>
                <label className={styles.wide}>Nombre o razón social<input name="razonSocial" required maxLength={254} placeholder="Sin régimen societario" /></label>
                <label>Código postal fiscal<input name="codigoPostal" required inputMode="numeric" pattern="\d{5}" maxLength={5} placeholder="00000" /></label>
                <label>Régimen fiscal<select name="regimenFiscal" required defaultValue=""><option value="" disabled>Selecciona una opción</option><option value="601">601 · General de Ley Personas Morales</option><option value="603">603 · Personas Morales con Fines no Lucrativos</option><option value="605">605 · Sueldos y Salarios</option><option value="606">606 · Arrendamiento</option><option value="612">612 · Actividades Empresariales</option><option value="616">616 · Sin obligaciones fiscales</option><option value="621">621 · Incorporación Fiscal</option><option value="625">625 · RESICO</option></select></label>
                <label>Uso del CFDI<select name="usoCFDI" required defaultValue=""><option value="" disabled>Selecciona una opción</option><option value="G01">G01 · Adquisición de mercancías</option><option value="G03">G03 · Gastos en general</option><option value="S01">S01 · Sin efectos fiscales</option></select></label>
                <label>Correo de entrega<input name="email" type="email" required placeholder="nombre@correo.com" /></label>
                {error && <div className={`${styles.error} ${styles.wide}`}>{error}</div>}
                <div className={`${styles.tipNote} ${styles.wide}`}><ShieldCheck /><span>La propina de {money(ticket.tip)} ({ticket.tipPercentage}%) no se incluirá en el importe facturado.</span></div>
                <button className={styles.wide} disabled={loading}>{loading ? <><LoaderCircle className={styles.spin} /> Enviando…</> : <>Generar factura <FileCheck2 /></>}</button>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className={`${styles.content} ${styles.success}`}>
              <div className={styles.successIcon}><CheckCircle2 /></div>
              <span className={styles.kicker}>Solicitud recibida</span>
              <h2>¡Todo listo!</h2>
              <p>Tu solicitud quedó registrada con el folio <strong>{invoiceFolio}</strong> y está pendiente de timbrado. Tu correo quedó guardado para la entrega del comprobante.</p>
              <button type="button" onClick={restart}>Facturar otro ticket</button>
            </div>
          )}
        </div>
      </section>

      <footer className={styles.footer}><span>La Petite Bretonne</span><span>·</span><span>Facturación segura</span></footer>
    </main>
  );
}
