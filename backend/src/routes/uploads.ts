import { Router, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { OrderStatus, UploadedFile } from '@prisma/client';
import { env } from '../config/env';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimit';
import { ALLOWED_MIME, countPages, detectKind, mimeFor } from '../services/fileInspect';
import { newStorageKey, storage } from '../services/storage';
import { signedFileUrl, verifyFileSignature, type Disposition } from '../lib/signedUrl';

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024, files: 10, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype) || file.mimetype === 'application/octet-stream') cb(null, true);
    else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  },
});

const publicFile = (f: UploadedFile) => ({
  id: f.id,
  originalName: f.originalName,
  mimeType: f.mimeType,
  sizeBytes: f.sizeBytes,
  pageCount: f.pageCount,
  createdAt: f.createdAt,
});

/** Strip any path components and control chars from a client-supplied filename. */
const cleanName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? 'file')
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .slice(0, 150) || 'file';

uploadsRouter.use(authenticate);

uploadsRouter.post(
  '/',
  uploadLimiter,
  upload.array('files', 10),
  ah(async (req, res) => {
    const user = currentUser(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('Choose at least one file');

    const saved: UploadedFile[] = [];
    for (const f of files) {
      const originalName = cleanName(Buffer.from(f.originalname, 'latin1').toString('utf8'));
      const kind = detectKind(f.buffer, originalName);
      if (!kind) throw badRequest(`${originalName}: only PDF, DOCX, JPG and PNG files are allowed`);
      const key = newStorageKey(kind);
      await storage.save(key, f.buffer, mimeFor(kind));
      saved.push(
        await prisma.uploadedFile.create({
          data: {
            ownerId: user.id,
            storageKey: key,
            originalName,
            mimeType: mimeFor(kind),
            sizeBytes: f.size,
            pageCount: await countPages(f.buffer, kind),
          },
        }),
      );
    }
    res.status(201).json({ files: saved.map(publicFile) });
  }),
);

uploadsRouter.get(
  '/',
  ah(async (req, res) => {
    const files = await prisma.uploadedFile.findMany({
      where: { ownerId: currentUser(req).id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ files: files.map(publicFile) });
  }),
);

export async function streamFile(res: Response, file: UploadedFile, disposition: Disposition = 'attachment') {
  if (file.deletedAt || !(await storage.exists(file.storageKey))) throw notFound('This file has been deleted (files are removed after pickup or 24 hours)');
  // DOCX cannot be shown in a browser tab, so it is always downloaded.
  const d = file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/') ? disposition : 'attachment';
  // Open the stream before sending headers, so a storage failure still gets a proper error response.
  const stream = await storage.read(file.storageKey);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `${d}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  stream.on('error', (err) => {
    logger.error({ err, fileId: file.id }, 'File stream failed');
    res.destroy(err);
  });
  stream.pipe(res);
}

/** Orders in these states let the shop open the customer's files. */
const SHOP_VISIBLE: OrderStatus[] = ['REQUESTED', 'ACCEPTED', 'PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'];

/** Hands out a short-lived link after checking the caller may see the file. */
uploadsRouter.get(
  '/:id/link',
  ah(async (req, res) => {
    const user = currentUser(req);
    const id = z.string().uuid().parse(req.params.id);
    const { d } = z.object({ d: z.enum(['inline', 'attachment']).default('attachment') }).parse(req.query);
    const file = await prisma.uploadedFile.findUnique({ where: { id } });
    if (!file || file.deletedAt) throw notFound('This file has been deleted (files are removed after pickup or 24 hours)');
    let allowed = file.ownerId === user.id || user.role === 'ADMIN';
    if (!allowed && user.role === 'SHOP_OWNER') {
      // Owners only see files of live requests sent to their own shop.
      const item = await prisma.orderItem.findFirst({
        where: { fileId: id, order: { shop: { ownerId: user.id }, status: { in: SHOP_VISIBLE } } },
      });
      allowed = Boolean(item);
    }
    if (!allowed) throw forbidden();
    res.json(signedFileUrl(id, d));
  }),
);

/** Public by design: the signed, expiring query string is the permission. */
export const filesRouter = Router();

filesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const q = z.object({ exp: z.coerce.number().int(), sig: z.string().min(10).max(100), d: z.enum(['inline', 'attachment']) }).safeParse(req.query);
    if (!q.success || !verifyFileSignature(id, q.data.exp, q.data.d, q.data.sig)) throw forbidden('This link has expired. Open the file again from the app.');
    const file = await prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) throw notFound();
    await streamFile(res, file, q.data.d);
  }),
);

uploadsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const file = await prisma.uploadedFile.findFirst({ where: { id, ownerId: currentUser(req).id, deletedAt: null } });
    if (!file) throw notFound();
    const active = await prisma.orderItem.findFirst({
      where: { fileId: id, order: { status: { in: SHOP_VISIBLE } } },
    });
    if (active) throw badRequest('This file is part of a request in progress');
    await storage.remove(file.storageKey);
    await prisma.uploadedFile.update({ where: { id }, data: { deletedAt: new Date() } });
    res.json({ ok: true });
  }),
);
