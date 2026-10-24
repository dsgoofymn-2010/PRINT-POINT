import PDFDocument from 'pdfkit';
import type { Writable } from 'node:stream';
import { formatINR } from '../lib/money';

export interface InvoiceData {
  orderNumber: string;
  date: Date;
  shop: { name: string; address: string; city: string; mobile: string };
  customer: { name: string; mobile: string | null; email: string | null };
  items: { fileName: string; description: string; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  total: number;
  paymentId: string | null;
}

// PDFKit's built-in fonts lack the ₹ glyph, so amounts use "Rs." in the PDF.
const money = (p: number) => formatINR(p).replace('₹', 'Rs. ');

export function writeInvoice(out: Writable, d: InvoiceData) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.pipe(out);

  doc.fontSize(20).fillColor('#1d4ed8').text('PrintPoint', { continued: true }).fillColor('#111').fontSize(12).text('   Tax Invoice / Receipt');
  doc.moveDown(0.5).fontSize(10).fillColor('#444');
  doc.text(`Invoice: ${d.orderNumber}`);
  doc.text(`Date: ${d.date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  if (d.paymentId) doc.text(`Payment ref: ${d.paymentId}`);
  doc.moveDown();

  doc.fillColor('#111').fontSize(11).text('Sold by', { underline: true });
  doc.fontSize(10).text(d.shop.name).text(`${d.shop.address}, ${d.shop.city}`).text(`Phone: ${d.shop.mobile}`);
  doc.moveDown();
  doc.fontSize(11).text('Billed to', { underline: true });
  doc.fontSize(10).text(d.customer.name);
  if (d.customer.mobile) doc.text(d.customer.mobile);
  if (d.customer.email) doc.text(d.customer.email);
  doc.moveDown();

  const left = 48;
  const right = 547;
  doc.fontSize(10).font('Helvetica-Bold').text('Item', left, doc.y, { continued: false });
  doc.moveUp().text('Amount', left, doc.y, { align: 'right', width: right - left });
  doc.font('Helvetica').moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).stroke('#ccc').moveDown(0.5);

  for (const it of d.items) {
    const y = doc.y;
    doc.text(it.fileName, left, y, { width: 360 });
    doc.fillColor('#666').fontSize(9).text(it.description, { width: 360 }).fillColor('#111').fontSize(10);
    doc.text(money(it.lineTotal), left, y, { align: 'right', width: right - left });
    doc.moveDown(0.8);
  }

  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke('#ccc').moveDown(0.5);
  const row = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 300, y, { width: 140 });
    doc.text(value, 300, y, { width: right - 300, align: 'right' });
  };
  row('Subtotal', money(d.subtotal));
  if (d.deliveryFee) row('Delivery', money(d.deliveryFee));
  if (d.discount) row('Discount', `- ${money(d.discount)}`);
  if (d.tax) row('Tax', money(d.tax));
  row('Total paid', money(d.total), true);

  doc.moveDown(2).font('Helvetica').fontSize(8).fillColor('#888').text('This is a computer-generated receipt. Thank you for printing with PrintPoint.', left, doc.y, {
    align: 'center',
    width: right - left,
  });
  doc.end();
}
