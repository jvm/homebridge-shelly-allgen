import { createHash, randomBytes } from 'node:crypto';
import type { Credentials } from '../shelly/types.js';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface FetchOptions {
  timeoutMs: number;
  credentials?: Credentials;
  method?: string;
  body?: unknown;
}

export async function fetchJson<T>(target: string, opts: FetchOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    let response = await fetch(target, { method, headers, body, signal: controller.signal });
    if (response.status === 401 && opts.credentials?.username && opts.credentials.password) {
      const challenge = response.headers.get('www-authenticate') ?? '';
      const authHeader = buildAuthHeader(target, method, challenge, opts.credentials);
      response = await fetch(target, { method, headers: { ...headers, Authorization: authHeader }, body, signal: controller.signal });
    }
    if (!response.ok) throw new HttpError(response.status, await response.text());
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function buildAuthHeader(target: string, method: string, challenge: string, credentials: Credentials): string {
  const username = credentials.username ?? '';
  const password = credentials.password ?? '';
  const scheme = challenge.split(/\s+/, 1)[0]?.toLowerCase();
  if (scheme === 'digest') {
    return buildDigestHeader(target, method, challenge, username, password);
  }
  if (scheme === 'basic') {
    if (!target.startsWith('https://')) {
      throw new Error('Refusing to send Basic credentials over cleartext HTTP. Use protocol="https" or rely on Digest auth.');
    }
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
  throw new HttpError(401, `Unsupported auth scheme: ${scheme || 'none'}`);
}

function parseDigestChallenge(challenge: string): Record<string, string> {
  const params: Record<string, string> = {};
  const body = challenge.replace(/^Digest\s+/i, '');
  const re = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const key = m[1].toLowerCase();
    params[key] = (m[2] ?? m[3] ?? '').trim();
  }
  return params;
}

function buildDigestHeader(target: string, method: string, challenge: string, username: string, password: string): string {
  const p = parseDigestChallenge(challenge);
  const realm = p.realm ?? '';
  const nonce = p.nonce ?? '';
  const opaque = p.opaque;
  const algorithm = (p.algorithm ?? 'MD5').toUpperCase();
  const hash = algorithm.includes('SHA-256') ? 'sha256' : 'md5';
  const qopList = (p.qop ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const qop = qopList.includes('auth') ? 'auth' : qopList[0];

  const parsedUrl = new URL(target);
  const uri = parsedUrl.pathname + parsedUrl.search;
  const cnonce = randomBytes(8).toString('hex');
  const nc = '00000001';
  const ha1 = createHash(hash).update(`${username}:${realm}:${password}`).digest('hex');
  const ha2 = createHash(hash).update(`${method}:${uri}`).digest('hex');
  const response = qop
    ? createHash(hash).update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex')
    : createHash(hash).update(`${ha1}:${nonce}:${ha2}`).digest('hex');

  const parts = [
    `username="${escapeQuoted(username)}"`,
    `realm="${escapeQuoted(realm)}"`,
    `nonce="${escapeQuoted(nonce)}"`,
    `uri="${escapeQuoted(uri)}"`,
    `algorithm=${algorithm}`,
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (opaque) parts.push(`opaque="${escapeQuoted(opaque)}"`);
  return `Digest ${parts.join(', ')}`;
}

function escapeQuoted(value: string): string {
  return value.replace(/(["\\])/g, '\\$1');
}

export function url(host: string, path: string, protocol: 'http' | 'https' = 'http'): string {
  const safeHost = validateHost(host);
  return `${protocol}://${safeHost}${path.startsWith('/') ? path : `/${path}`}`;
}

export function validateHost(host: string): string {
  const value = host.trim();
  if (!value || value.length > 253) {
    throw new Error('Invalid Shelly host.');
  }
  if (/[\\/\s@?#%]/.test(value) || value.includes('://')) {
    throw new Error('Invalid Shelly host: provide only a hostname/IP and optional port, not a URL.');
  }
  if (!/^[A-Za-z0-9.:[\]-]+$/.test(value)) {
    throw new Error('Invalid Shelly host characters.');
  }
  return value;
}

export const __test = { parseDigestChallenge, buildDigestHeader };
