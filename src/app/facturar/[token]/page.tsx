'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle2, Clock3, FileText, LoaderCircle, ReceiptText, ShieldCheck } from 'lucide-react';
import styles from './ticket.module.css';

type Ticket = {
  Folio: string;
  FechaVenta: string;
  taxableConsumption: number;
  tipPercentage: number;
  tip: number;
  totalWithTip: number;
  Estado?: string;
  RFC?: string;
};

const money = (value: number) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
}).format(value || 0);

export default function SelfInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [expired, setExpired] = useState(false);
  const [alreadyRequested, setAlreadyRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/facturacion/ticket/${encodeURIComponent(token)}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No fue posible abrir el ticket');
        setTicket(data.ticket);
        setExpiresAt(data.expiresAt);
        setExpired(data.expired);
        setAlreadyRequested(data.alreadyRequested);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError('');
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/facturacion/ticket/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible enviar la solicitud');
      setSuccess(data.message);
      setAlreadyRequested(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No fue posible enviar la solicitud');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className={styles.state}><LoaderCircle className={styles.spin} /><p>Consultando tu ticket…</p></main>;
  if (!ticket) return <main className={styles.state}><ReceiptText size={40} /><h1>Ticket no disponible</h1><p>{error}</p></main>;

  const unavailable = expired || alreadyRequested;

  return (
    <main className={styles.page}>
      <header className={styles.brand}>
        <Image src="/logo.png" alt="La Petite Bretonne" width={118} height={52} priority />
        <div><span>Autofacturación</span><strong>Tu consumo, listo para facturar</strong></div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.receipt}>
          <div className={styles.receiptTop}>
            <ReceiptText size={22} />
            <div><span>Comanda</span><strong>{ticket.Folio}</strong></div>
          </div>
          <p className={styles.date}>{new Date(ticket.FechaVenta).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}</p>
          <div className={styles.rule} />
          <div className={styles.line}><span>Consumo facturable</span><strong>{money(ticket.taxableConsumption)}</strong></div>
          <div className={styles.line}><span>Propina · {ticket.tipPercentage}%</span><strong>{money(ticket.tip)}</strong></div>
          <div className={styles.total}><span>Total pagado</span><strong>{money(ticket.totalWithTip)}</strong></div>
          <div className={styles.taxNote}><ShieldCheck size={16} /><span>La factura considera únicamente el consumo. La propina no se incluye en el CFDI.</span></div>
          <div className={styles.receiptEdge} />
        </aside>

        <section className={styles.formCard}>
          <div className={styles.eyebrow}><FileText size={15} /> Datos fiscales CFDI 4.0</div>
          <h1>Factura este ticket</h1>
          <p className={styles.intro}>Captura los datos exactamente como aparecen en tu constancia de situación fiscal.</p>

          {unavailable ? (
            <div className={alreadyRequested ? styles.successBox : styles.expiredBox}>
              {alreadyRequested ? <CheckCircle2 size={24} /> : <Clock3 size={24} />}
              <div>
                <strong>{alreadyRequested ? 'Solicitud recibida' : 'El enlace venció'}</strong>
                <p>{success || (alreadyRequested
                  ? `Este ticket ya está ${ticket.Estado === 'timbrada' ? 'timbrado' : 'pendiente de timbrado'}.`
                  : 'Solicita apoyo en caja para revisar la facturación de esta comanda.')}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className={styles.form}>
              <label className={styles.full}>RFC<input name="rfc" required maxLength={13} autoCapitalize="characters" placeholder="XAXX010101000" /></label>
              <label className={styles.full}>Nombre o razón social<input name="razonSocial" required maxLength={254} placeholder="Como aparece en tu constancia" /></label>
              <label>Código postal fiscal<input name="codigoPostal" required inputMode="numeric" pattern="\d{5}" maxLength={5} placeholder="00000" /></label>
              <label>Régimen fiscal<select name="regimenFiscal" required defaultValue=""><option value="" disabled>Selecciona</option><option value="601">601 · General de Ley Personas Morales</option><option value="603">603 · Personas Morales con Fines no Lucrativos</option><option value="605">605 · Sueldos y Salarios</option><option value="606">606 · Arrendamiento</option><option value="612">612 · Actividades Empresariales</option><option value="616">616 · Sin obligaciones fiscales</option><option value="621">621 · Incorporación Fiscal</option><option value="625">625 · RESICO</option></select></label>
              <label>Uso del CFDI<select name="usoCFDI" required defaultValue=""><option value="" disabled>Selecciona</option><option value="G01">G01 · Adquisición de mercancías</option><option value="G03">G03 · Gastos en general</option><option value="S01">S01 · Sin efectos fiscales</option><option value="D10">D10 · Pagos por servicios educativos</option></select></label>
              <label>Correo de entrega<input name="email" type="email" required placeholder="cliente@correo.com" /></label>
              {error && <div className={`${styles.error} ${styles.full}`}>{error}</div>}
              <button className={styles.submit} disabled={sending}>{sending ? <><LoaderCircle className={styles.spin} size={18} /> Enviando…</> : 'Solicitar factura'}</button>
            </form>
          )}

          <div className={styles.deadline}><Clock3 size={15} /><span>Disponible hasta el {new Date(expiresAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}</span></div>
        </section>
      </div>
    </main>
  );
}
