/* Seed: 1 admin, 2 shop owners, 1 shop (single-shop app), pricing, 1 customer, 1 completed order. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PrismaClient, type ServiceType } from '@prisma/client';
import { calculateQuote, ruleSnapshot } from '../src/services/pricing';

const prisma = new PrismaClient();
const PASSWORD = 'Password@123';

const baseRule = {
  bwSingle: 150, // ₹1.50
  bwDouble: 100,
  colorSingle: 1000,
  colorDouble: 800,
  a3Multiplier: 2,
  legalMultiplier: 1.2,
  bondExtra: 50,
  glossyExtra: 500,
  spiralBinding: 3000,
  softBinding: 6000,
  hardBinding: 15000,
  laminationSingle: 1500,
  laminationDouble: 2500,
  deliveryFee: 3000,
  freeDeliveryAbove: 50000,
  minOrderAmount: 1000,
  taxPercent: 0,
};

async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 12; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`PrintPoint sample project report - page ${i}`, { x: 60, y: 780, size: 16, font });
  }
  return Buffer.from(await doc.save());
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@printpoint.test' },
    update: {},
    create: { name: 'PrintPoint Admin', email: 'admin@printpoint.test', mobile: '9000000001', role: 'ADMIN', passwordHash: hash },
  });
  const owner1 = await prisma.user.upsert({
    where: { email: 'owner1@printpoint.test' },
    update: {},
    create: { name: 'Ravi Kumar', email: 'owner1@printpoint.test', mobile: '9000000002', role: 'SHOP_OWNER', passwordHash: hash },
  });
  const customer = await prisma.user.upsert({
    where: { email: 'customer@printpoint.test' },
    update: {},
    create: { name: 'Arun S', email: 'customer@printpoint.test', mobile: '9876543210', role: 'CUSTOMER', passwordHash: hash },
  });

  const allServices: ServiceType[] = ['XEROX_BW', 'COLOR_PRINT', 'PROJECT_REPORT', 'SPIRAL_BINDING', 'SOFT_BINDING', 'HARD_BINDING', 'LAMINATION', 'SCANNING', 'PASSPORT_PHOTO'];
  const shopsData = [
    {
      slug: 'printpoint', owner: owner1, name: 'PrintPoint', area: 'T. Nagar', pincode: '600017',
      address: '12, Usman Road, T. Nagar', open: '08:30', close: '21:30', delivery: true, radius: 5, services: allServices, rating: 4.6, rule: baseRule,
    },
  ];

  const shops = [];
  for (const s of shopsData) {
    const shop = await prisma.shop.upsert({
      where: { slug: s.slug },
      update: {},
      create: {
        slug: s.slug, ownerId: s.owner.id, name: s.name, ownerName: s.owner.name, mobile: s.owner.mobile!, email: s.owner.email,
        address: s.address, area: s.area, city: 'Chennai', pincode: s.pincode, openTime: s.open, closeTime: s.close,
        holidays: ['SUNDAY'].filter(() => s.slug === 'anna-nagar-copy-centre'), status: 'APPROVED',
        deliveryAvailable: s.delivery, deliveryRadiusKm: s.radius, estimatedPickupMins: 30, rating: s.rating, ratingCount: 0,
        mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(`${s.name} ${s.area} Chennai`)}`,
        services: { create: s.services.map((type) => ({ type })) },
        pricingRules: { create: { name: 'Standard', ...s.rule } },
      },
      include: { pricingRules: true },
    });
    shops.push(shop);
  }

  await prisma.customerAddress.deleteMany({ where: { userId: customer.id } });
  await prisma.customerAddress.create({
    data: { userId: customer.id, label: 'Hostel', name: 'Arun S', mobile: '9876543210', line1: 'Room 214, Guindy Hostel', landmark: 'Near Anna University Gate', area: 'Guindy', city: 'Chennai', pincode: '600025', isDefault: true },
  });

  await prisma.coupon.upsert({
    where: { code: 'STUDENT10' },
    update: {},
    create: { code: 'STUDENT10', discountType: 'PERCENT', value: 10, maxDiscount: 5000, minOrder: 5000 },
  });
  await prisma.platformSetting.upsert({ where: { key: 'commissionPercent' }, update: {}, create: { key: 'commissionPercent', value: 5 } });

  // A completed sample order, with a real PDF file on disk.
  const exists = await prisma.printOrder.findFirst({ where: { customerId: customer.id, status: 'COMPLETED' } });
  if (!exists) {
    const shop = shops[0];
    const rule = shop.pricingRules[0];
    const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    const key = `${crypto.randomUUID()}.pdf`;
    const pdf = await samplePdf();
    fs.writeFileSync(path.join(uploadDir, key), pdf);
    const file = await prisma.uploadedFile.create({
      data: { ownerId: customer.id, storageKey: key, originalName: 'Mini-Project-Report.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length, pageCount: 12 },
    });
    const settings = { color: 'BW', paperSize: 'A4', sides: 'DOUBLE', paperQuality: 'BOND_80', copies: 2, pageRange: null, binding: 'SPIRAL', lamination: 'NONE' } as const;
    const quote = calculateQuote(ruleSnapshot(rule), [{ key: file.id, fileName: file.originalName, totalPages: 12, settings }], 'PICKUP');
    const year = new Date().getFullYear();
    const counter = await prisma.orderCounter.upsert({ where: { year }, create: { year, value: 1 }, update: { value: { increment: 1 } } });
    const paidAt = new Date(Date.now() - 2 * 86_400_000);
    const order = await prisma.printOrder.create({
      data: {
        orderNumber: `PP-${year}-${String(counter.value).padStart(6, '0')}`,
        customerId: customer.id, shopId: shop.id, status: 'COMPLETED', fulfillment: 'PICKUP',
        subtotal: quote.subtotal, total: quote.total, deliveryFee: 0, discount: 0, tax: 0,
        commissionPercent: 5, commissionAmount: Math.round(quote.subtotal * 0.05),
        priceSnapshot: JSON.parse(JSON.stringify({ rule: ruleSnapshot(rule), quote })),
        pickupOtp: '482913', paidAt, completedAt: new Date(paidAt.getTime() + 3_600_000),
        specialInstructions: 'Please use a blue spiral and transparent front cover.',
        items: {
          create: {
            fileId: file.id, fileName: file.originalName, totalPages: 12, printedPages: 12, copies: 2, color: 'BW', paperSize: 'A4', sides: 'DOUBLE',
            paperQuality: 'BOND_80', orientation: 'PORTRAIT', fitMode: 'FIT', binding: 'SPIRAL', lamination: 'NONE',
            lineTotal: quote.items[0].lineTotal, breakdown: JSON.parse(JSON.stringify(quote.items[0])),
          },
        },
        events: {
          create: [
            { status: 'PENDING_PAYMENT', note: 'Order placed', createdAt: new Date(paidAt.getTime() - 60_000) },
            { status: 'PAID', note: 'Payment confirmed', createdAt: paidAt },
            { status: 'PRINTING', createdAt: new Date(paidAt.getTime() + 600_000) },
            { status: 'READY', createdAt: new Date(paidAt.getTime() + 1_800_000) },
            { status: 'COMPLETED', createdAt: new Date(paidAt.getTime() + 3_600_000) },
          ],
        },
      },
    });
    await prisma.payment.create({
      data: { orderId: order.id, razorpayOrderId: `order_seed_${order.id.slice(0, 8)}`, razorpayPaymentId: `pay_seed_${order.id.slice(0, 8)}`, amount: quote.total, status: 'PAID', method: 'upi' },
    });
    await prisma.review.create({ data: { orderId: order.id, shopId: shop.id, customerId: customer.id, rating: 5, comment: 'Quick service and neat spiral binding!' } });
    await prisma.shop.update({ where: { id: shop.id }, data: { rating: 4.6, ratingCount: 1 } });
  }

  await prisma.auditLog.create({ data: { actorId: admin.id, action: 'seed.run', entityType: 'System', metadata: { shops: shops.length } } });
  console.log('Seed complete. Password for all seed users:', PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
