import { createHmac, timingSafeEqual } from 'crypto';

export const SELF_INVOICE_DAYS = Math.max(
  1,
  Number.parseInt(process.env.INVOICE_SELF_SERVICE_DAYS || '3', 10) || 3,
);

const secret = process.env.INVOICE_TOKEN_SECRET || process.env.JWT_SECRET || 'bretone-secret-key';

export function getTipPercentage(idApertura: number | string, idVenta: number | string) {
  const digest = createHmac('sha256', secret)
    .update(`${idApertura}:${idVenta}:propina`)
    .digest();

  return 10 + (digest.readUInt16BE(0) % 11);
}

export function getBillingAmounts(
  consumption: number,
  idApertura: number | string,
  idVenta: number | string,
) {
  const tipPercentage = getTipPercentage(idApertura, idVenta);
  const taxableConsumption = Math.round((Number(consumption) || 0) * 100) / 100;
  const tip = Math.round(taxableConsumption * tipPercentage) / 100;

  return {
    taxableConsumption,
    tipPercentage,
    tip,
    totalWithTip: Math.round((taxableConsumption + tip) * 100) / 100,
  };
}

function signature(payload: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function getSelfInvoiceExpiry(saleDate: Date | string) {
  const expiresAt = new Date(saleDate);
  expiresAt.setDate(expiresAt.getDate() + SELF_INVOICE_DAYS);
  return expiresAt;
}

export function createSelfInvoiceToken(
  idApertura: number | string,
  idVenta: number | string,
  saleDate: Date | string,
) {
  const expiresAt = getSelfInvoiceExpiry(saleDate);
  const payload = `${idApertura}.${idVenta}.${expiresAt.getTime()}`;
  return `${payload}.${signature(payload)}`;
}

export function verifySelfInvoiceToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 4) return null;

  const [idAperturaRaw, idVentaRaw, expiresRaw, receivedSignature] = parts;
  const payload = `${idAperturaRaw}.${idVentaRaw}.${expiresRaw}`;
  const expectedSignature = signature(payload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  const idApertura = Number(idAperturaRaw);
  const idVenta = Number(idVentaRaw);
  const expiresAt = new Date(Number(expiresRaw));

  if (!Number.isInteger(idApertura) || !Number.isInteger(idVenta) || Number.isNaN(expiresAt.getTime())) {
    return null;
  }

  return { idApertura, idVenta, expiresAt, expired: expiresAt.getTime() < Date.now() };
}

export function buildSelfInvoiceUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, '')}/facturar/${encodeURIComponent(token)}`;
}

const PORTAL_CLAIM_MINUTES = 15;

export function createPortalTicketClaim(idApertura: number, idVenta: number) {
  const expiresAt = Date.now() + PORTAL_CLAIM_MINUTES * 60 * 1000;
  const payload = `${idApertura}.${idVenta}.${expiresAt}`;
  return `${payload}.${signature(`portal:${payload}`)}`;
}

export function verifyPortalTicketClaim(token: string) {
  const parts = token.split('.');
  if (parts.length !== 4) return null;

  const [openingRaw, saleRaw, expiryRaw, receivedSignature] = parts;
  const payload = `${openingRaw}.${saleRaw}.${expiryRaw}`;
  const expectedSignature = signature(`portal:${payload}`);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  const idApertura = Number(openingRaw);
  const idVenta = Number(saleRaw);
  const expiresAt = Number(expiryRaw);
  if (!Number.isInteger(idApertura) || !Number.isInteger(idVenta) || !Number.isFinite(expiresAt)) return null;

  return { idApertura, idVenta, expiresAt, expired: expiresAt < Date.now() };
}
