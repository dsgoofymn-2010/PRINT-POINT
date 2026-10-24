export type Role = 'CUSTOMER' | 'SHOP_OWNER' | 'ADMIN';
export type OrderStatus = 'DRAFT' | 'REQUESTED' | 'ACCEPTED' | 'DENIED' | 'PENDING_PAYMENT' | 'PAID' | 'PRINTING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type Fulfillment = 'PICKUP' | 'DELIVERY';
export type ServiceType =
  | 'XEROX_BW' | 'COLOR_PRINT' | 'PROJECT_REPORT' | 'SPIRAL_BINDING' | 'SOFT_BINDING' | 'HARD_BINDING' | 'LAMINATION' | 'SCANNING' | 'PASSPORT_PHOTO';

export interface User {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  role: Role;
}

export interface Pricing {
  bwSingle: number;
  bwDouble: number;
  colorSingle: number;
  colorDouble: number;
  a3Multiplier: number;
  legalMultiplier: number;
  bondExtra: number;
  glossyExtra: number;
  spiralBinding: number;
  softBinding: number;
  hardBinding: number;
  laminationSingle: number;
  laminationDouble: number;
  deliveryFee: number;
  freeDeliveryAbove: number | null;
  minOrderAmount: number;
  taxPercent: number;
}

export interface PricingRule extends Pricing {
  id: string;
  name: string;
  isActive: boolean;
  updatedAt: string;
}

export interface ShopSummary {
  id: string;
  name: string;
  slug: string;
  address: string;
  area: string;
  city: string;
  pincode: string;
  mobile: string;
  mapsUrl: string | null;
  openTime: string;
  closeTime: string;
  holidays: string[];
  deliveryAvailable: boolean;
  deliveryRadiusKm: number;
  estimatedPickupMins: number;
  rating: number;
  ratingCount: number;
  services: { type: ServiceType; note: string | null }[];
  isOpen: boolean;
  minOrderAmount?: number;
  startingPrice?: number | null;
}

export interface ShopDetail extends ShopSummary {
  pricing: Pricing | null;
  reviews: { id: string; rating: number; comment: string | null; createdAt: string; customer: { name: string } }[];
}

export interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  createdAt: string;
}

export interface PrintSettings {
  color: 'BW' | 'COLOR';
  paperSize: 'A4' | 'A3' | 'LEGAL';
  sides: 'SINGLE' | 'DOUBLE';
  paperQuality: 'NORMAL_70' | 'BOND_80' | 'GLOSSY';
  copies: number;
  pageRange: string;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  fitMode: 'FIT' | 'ACTUAL';
  binding: 'NONE' | 'SPIRAL' | 'SOFT' | 'HARD';
  lamination: 'NONE' | 'SINGLE' | 'DOUBLE';
}

export interface QuoteItem {
  key: string;
  fileName: string;
  totalPages: number;
  printedPages: number;
  sheets: number;
  copies: number;
  ratePerPage: number;
  sizeMultiplier: number;
  printCost: number;
  paperExtra: number;
  bindingCost: number;
  laminationCost: number;
  lineTotal: number;
}

export interface Quote {
  items: QuoteItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode: string | null;
  tax: number;
  taxPercent: number;
  total: number;
  minOrderAmount: number;
  meetsMinimum: boolean;
}

export interface DeliveryInfo {
  name: string;
  mobile: string;
  address: string;
  landmark?: string | null;
  pincode?: string | null;
  preferredTime?: string | null;
}

export interface OrderItem extends Omit<PrintSettings, 'pageRange'> {
  id: string;
  fileId: string;
  fileName: string;
  totalPages: number;
  pageRange: string | null;
  printedPages: number;
  lineTotal: number;
  file?: { id: string; deletedAt: string | null; mimeType: string; sizeBytes: number };
}

export interface Payment {
  id: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amount: number;
  status: 'CREATED' | 'PAID' | 'FAILED' | 'REFUNDED';
  method: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface Refund {
  id: string;
  amount: number;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  reason: string | null;
  createdAt: string;
  order?: { id?: string; orderNumber: string | null; total?: number };
}

export interface Order {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  fulfillment: Fulfillment;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  total: number;
  pickupOtp?: string | null;
  specialInstructions: string | null;
  estimatedReadyAt: string | null;
  paidAt: string | null;
  completedAt: string | null;
  createdAt: string;
  shopId: string;
  shop: { id: string; name: string; address?: string; area: string; city?: string; mobile?: string; mapsUrl?: string | null; estimatedPickupMins?: number };
  customer?: { id?: string; name: string; mobile: string | null; email?: string | null };
  items: OrderItem[];
  payments?: Payment[];
  refunds?: Refund[];
  delivery?: (DeliveryInfo & { status: string; partnerName: string | null }) | null;
  review?: { rating: number; comment: string | null } | null;
  events?: { id: string; status: OrderStatus; note: string | null; createdAt: string }[];
}

/** Public queue numbers for a shop (side panel). */
export interface QueueInfo {
  shopId: string;
  name: string;
  isOpen: boolean;
  acceptingRequests: boolean;
  withinHours: boolean;
  hoursToday: { open: string; close: string } | null;
  pending: number;
  printing: number;
  estimatedWaitMins: number;
  prices: { bwSingle: number; bwDouble: number; colorSingle: number; colorDouble: number; spiralBinding: number; taxPercent: number; minOrderAmount: number } | null;
  updatedAt: string;
}

export interface ChatOptions {
  color: 'BW' | 'COLOR';
  sides: 'SINGLE' | 'DOUBLE';
  copies: number;
  binding: 'NONE' | 'SPIRAL';
}

export interface RequestItem {
  id: string;
  fileId: string;
  fileName: string;
  totalPages?: number;
  printedPages: number;
  copies: number;
  color: 'BW' | 'COLOR';
  sides: 'SINGLE' | 'DOUBLE';
  binding: 'NONE' | 'SPIRAL' | 'SOFT' | 'HARD';
  lineTotal: number;
  file: { deletedAt: string | null; sizeBytes: number; mimeType: string };
}

/** A print request as the customer sees it. */
export interface PrintRequest {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  total: number;
  pickupOtp: string | null;
  denyReason: string | null;
  specialInstructions: string | null;
  estimatedReadyAt: string | null;
  acceptedAt: string | null;
  paidAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  onlinePayment: boolean;
  shop: { id: string; name: string; area: string; address: string; mobile: string; mapsUrl: string | null };
  items: RequestItem[];
  events: { status: OrderStatus; note: string | null; createdAt: string }[];
}

/** A request as the shop owner sees it (masked phone, no pickup code). */
export interface IncomingRequest extends Omit<PrintRequest, 'pickupOtp' | 'onlinePayment' | 'shop' | 'events'> {
  pickupAttempts: number;
  customer: { name: string; mobile: string | null };
}
