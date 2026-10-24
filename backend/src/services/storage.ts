import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../config/env';

/** Storage abstraction; add S3/Cloudinary drivers by implementing this interface. */
export interface StorageDriver {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Readable;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const KEY_PATTERN = /^[0-9a-f-]{36}\.(pdf|docx|jpg|png)$/;

class LocalStorage implements StorageDriver {
  private root = path.resolve(env.UPLOAD_DIR);

  constructor() {
    fs.mkdirSync(this.root, { recursive: true });
  }

  /** Keys are generated server-side; still reject anything that could escape the root. */
  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    const full = path.resolve(this.root, key);
    if (path.dirname(full) !== this.root) throw new Error('Invalid storage path');
    return full;
  }

  async save(key: string, data: Buffer) {
    await fs.promises.writeFile(this.resolve(key), data, { flag: 'wx' });
  }

  read(key: string) {
    return fs.createReadStream(this.resolve(key));
  }

  async remove(key: string) {
    await fs.promises.rm(this.resolve(key), { force: true });
  }

  async exists(key: string) {
    try {
      await fs.promises.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

export const storage: StorageDriver = new LocalStorage();

export function newStorageKey(ext: 'pdf' | 'docx' | 'jpg' | 'png'): string {
  return `${crypto.randomUUID()}.${ext}`;
}
