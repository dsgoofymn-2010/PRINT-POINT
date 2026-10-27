import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { env } from '../config/env';

/** Where uploaded files live. Keys are generated server-side (see newStorageKey). */
export interface StorageDriver {
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const KEY_PATTERN = /^[0-9a-f-]{36}\.(pdf|docx|jpg|png)$/;

/** Rejects anything that is not a generated key, so no caller can reach other paths. */
function checkKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
  return key;
}

class LocalStorage implements StorageDriver {
  private root = path.resolve(env.UPLOAD_DIR);

  constructor() {
    fs.mkdirSync(this.root, { recursive: true });
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, checkKey(key));
    if (path.dirname(full) !== this.root) throw new Error('Invalid storage path');
    return full;
  }

  async save(key: string, data: Buffer) {
    await fs.promises.writeFile(this.resolve(key), data, { flag: 'wx' });
  }

  async read(key: string) {
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

/** Private Supabase Storage bucket, reached with the server-only service role key. */
class SupabaseStorage implements StorageDriver {
  private base: string;
  private headers: Record<string, string>;

  constructor(url: string, serviceKey: string, private bucket: string) {
    this.base = `${url.replace(/\/+$/, '')}/storage/v1/object`;
    this.headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  }

  private url(key: string) {
    return `${this.base}/${this.bucket}/${checkKey(key)}`;
  }

  private async fail(res: Response, action: string): Promise<never> {
    const body = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Supabase storage ${action} failed (${res.status}): ${body}`);
  }

  async save(key: string, data: Buffer, contentType: string) {
    const res = await fetch(this.url(key), {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': contentType, 'x-upsert': 'false' },
      body: data,
    });
    if (!res.ok) await this.fail(res, 'upload');
  }

  async read(key: string) {
    const res = await fetch(this.url(key), { headers: this.headers });
    if (!res.ok || !res.body) await this.fail(res, 'download');
    return Readable.fromWeb(res.body as unknown as WebReadableStream);
  }

  async remove(key: string) {
    // Deleting a missing object succeeds with an empty list, so this is safe to repeat.
    const res = await fetch(`${this.base}/${this.bucket}`, {
      method: 'DELETE',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [checkKey(key)] }),
    });
    if (!res.ok) await this.fail(res, 'delete');
  }

  async exists(key: string) {
    const res = await fetch(this.url(key), { method: 'HEAD', headers: this.headers });
    if (res.ok) return true;
    // Supabase answers 400 or 404 for a missing object; anything else is a real outage.
    if (res.status === 404 || res.status === 400) return false;
    return this.fail(res, 'lookup');
  }
}

export const storage: StorageDriver =
  env.STORAGE_DRIVER === 'supabase'
    ? new SupabaseStorage(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, env.SUPABASE_BUCKET)
    : new LocalStorage();

export function newStorageKey(ext: 'pdf' | 'docx' | 'jpg' | 'png'): string {
  return `${crypto.randomUUID()}.${ext}`;
}
