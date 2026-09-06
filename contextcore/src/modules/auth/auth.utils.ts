import crypto from 'node:crypto';

const ttlUnits = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
} as const;

export function parseTokenTtl(rawTtl: string): number {
  const match = /^([0-9]+)(ms|s|m|h|d)$/i.exec(rawTtl.trim());

  if (!match || !match[2]) {
    throw new Error(`Unsupported token TTL format: ${rawTtl}`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase() as keyof typeof ttlUnits;

  return value * ttlUnits[unit];
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
