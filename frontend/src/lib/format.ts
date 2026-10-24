import type { OrderStatus, ServiceType } from './types';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrShort = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Formats paise as Indian Rupees, e.g. 123450 -> ₹1,234.50 */
export const rupees = (paise: number) => inr.format(paise / 100);
export const rupeesShort = (paise: number) => inrShort.format(paise / 100);
export const toPaise = (rupeesValue: number) => Math.round(rupeesValue * 100);

export const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Draft',
  REQUESTED: 'Waiting for shop',
  ACCEPTED: 'Accepted',
  DENIED: 'Denied',
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  PRINTING: 'Printing',
  READY: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  COMPLETED: 'Collected',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export const STATUS_TONE: Record<OrderStatus, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'gray',
  REQUESTED: 'amber',
  ACCEPTED: 'blue',
  DENIED: 'red',
  PENDING_PAYMENT: 'amber',
  PAID: 'blue',
  PRINTING: 'blue',
  READY: 'green',
  OUT_FOR_DELIVERY: 'green',
  COMPLETED: 'green',
  CANCELLED: 'red',
  REFUNDED: 'red',
};

export const SERVICE_LABEL: Record<ServiceType, string> = {
  XEROX_BW: 'B/W Xerox',
  COLOR_PRINT: 'Colour printing',
  PROJECT_REPORT: 'Project reports',
  SPIRAL_BINDING: 'Spiral binding',
  SOFT_BINDING: 'Soft binding',
  HARD_BINDING: 'Hard binding',
  LAMINATION: 'Lamination',
  SCANNING: 'Scanning',
  PASSPORT_PHOTO: 'Passport photos',
};

export const ALL_SERVICES = Object.keys(SERVICE_LABEL) as ServiceType[];

export const clock = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';

export const minutesLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
