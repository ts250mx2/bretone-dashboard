import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Factura tu ticket | La Petite Bretonne',
  description: 'Portal de autofacturación de tickets de La Petite Bretonne.',
};

export default function InvoicePortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
