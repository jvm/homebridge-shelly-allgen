import { Bonjour } from 'bonjour-service';
import type { DeviceEndpoint } from '../shelly/types.js';

export interface DiscoveredEndpoint extends DeviceEndpoint {
  mac?: string;
}

export interface DiscoverOptions {
  signal?: AbortSignal;
}

export async function discoverMdns(timeoutMs = 5000, options: DiscoverOptions = {}): Promise<DiscoveredEndpoint[]> {
  const bonjour = new Bonjour();
  const found = new Map<string, DiscoveredEndpoint>();
  const browser = bonjour.find({ type: 'http' });
  browser.on('up', service => {
    const host = service.referer?.address ?? service.addresses?.[0] ?? service.host;
    if (!host) return;
    const txt = (service.txt ?? {}) as Record<string, string>;
    const name = `${service.name ?? ''} ${service.host ?? ''}`.toLowerCase();
    const isShelly = name.includes('shelly') || (typeof txt.id === 'string' && txt.id.toLowerCase().startsWith('shelly'));
    if (!isShelly) return;
    const mac = normalizeMac(txt.mac ?? macFromName(service.name ?? service.host ?? ''));
    const gen = parseGen(txt.gen);
    const existing = found.get(host);
    found.set(host, {
      host,
      name: existing?.name ?? (typeof service.name === 'string' ? service.name : undefined),
      mac: existing?.mac ?? mac,
      generation: existing?.generation ?? gen,
    });
  });

  try {
    await waitWithAbort(timeoutMs, options.signal);
  } finally {
    browser.stop();
    bonjour.destroy();
  }
  return [...found.values()];
}

function waitWithAbort(timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function normalizeMac(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  return hex.length === 12 ? hex : undefined;
}

function macFromName(value: string): string | undefined {
  const match = /([0-9A-Fa-f]{12})/.exec(value);
  return match ? match[1].toUpperCase() : undefined;
}

function parseGen(value: string | undefined): DeviceEndpoint['generation'] | undefined {
  if (value === '1') return 'gen1';
  if (value === '2' || value === '3' || value === '4') return 'gen2';
  return undefined;
}
