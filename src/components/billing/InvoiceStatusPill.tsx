import { invoiceStatusTone, labelInvoiceStatus } from "@/lib/billing";

export function InvoiceStatusPill({ status }: { status: string }) {
  return <span className={`badge ${invoiceStatusTone(status)}`}>{labelInvoiceStatus(status)}</span>;
}
