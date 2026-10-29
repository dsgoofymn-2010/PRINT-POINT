import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../lib/prisma';

export async function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({
    data: { actorId: req.user?.id ?? null, action, entityType, entityId, metadata, ip: req.ip },
  });
}
