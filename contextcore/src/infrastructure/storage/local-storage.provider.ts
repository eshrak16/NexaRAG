import { promises as fs } from 'node:fs';
import path from 'node:path';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'uploads');

function sanitizeRelativePath(raw: string): string {
  const normalized = raw.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const safeSegments = segments.map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, '-'));

  if (safeSegments.length === 0) {
    throw new Error('A valid storage folder is required.');
  }

  return safeSegments.join('/');
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName || 'upload.bin');
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '-');

  if (!safe || safe === '.' || safe === '..') {
    throw new Error('A valid file name is required.');
  }

  return safe;
}

export const localStorageProvider = {
  async save(folder: string, fileName: string, buffer: Buffer): Promise<string> {
    const relativeFolder = sanitizeRelativePath(folder);
    const safeName = sanitizeFileName(fileName);
    const directory = path.resolve(STORAGE_ROOT, relativeFolder);

    await fs.mkdir(directory, { recursive: true });
    const finalPath = path.resolve(directory, safeName);

    await fs.writeFile(finalPath, buffer);
    return finalPath;
  },

  async read(filePath: string): Promise<Buffer> {
    const resolved = path.resolve(filePath);

    const relativePath = path.relative(STORAGE_ROOT, resolved);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Access to the requested file path is not allowed.');
    }

    return fs.readFile(resolved);
  },
};
