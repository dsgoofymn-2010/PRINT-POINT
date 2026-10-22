import { Router, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { UploadedFile } from '@prisma/client';
import { env } from '../config/env';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimit';
import { ALLOWED_MIME, countPages, detectKind, mimeFor } from '../services/fileInspect';
import { newStorageKey, storage } from '../services/storage';

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
      await storage.save(key, f.buffer);
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

export async function streamFile(res: Response, file: UploadedFile) {
  if (file.deletedAt || !(await storage.exists(file.storageKey))) throw notFound('File has been deleted after the retention period');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  storage.read(file.storageKey).pipe(res);
}

uploadsRouter.get(
  '/:id/download',
  ah(async (req, res) => {
    const user = currentUser(req);
    const id = z.string().uuid().parse(req.params.id);
    const file = await prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) throw notFound();
    let allowed = file.ownerId === user.id || user.role === 'ADMIN';
    if (!allowed && user.role === 'SHOP_OWNER') {
      // A shop owner may download files only for paid orders placed at their shop.
      const item = await prisma.orderItem.findFirst({
        where: { fileId: id, order: { shop: { ownerId: user.id }, status: { notIn: ['DRAFT', 'PENDING_PAYMENT'] } } },
      });
      allowed = Boolean(item);
    }
    if (!allowed) throw forbidden();
    await streamFile(res, file);
  }),
);

uploadsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const file = await prisma.uploadedFile.findFirst({ where: { id, ownerId: currentUser(req).id, deletedAt: null } });
    if (!file) throw notFound();
    const active = await prisma.orderItem.findFirst({
      where: { fileId: id, order: { status: { in: ['PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY'] } } },
    });
    if (active) throw badRequest('This file is part of an order in progress');
    await storage.remove(file.storageKey);
    await prisma.uploadedFile.update({ where: { id }, data: { deletedAt: new Date() } });
    res.json({ ok: true });
  }),
);
