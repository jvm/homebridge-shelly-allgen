#!/usr/bin/env node
import { discoverMdns } from '../discovery/mdns.js';
import { readNormalizedDevice } from '../shelly/client.js';
import type { DeviceEndpoint } from '../shelly/types.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const host = arg('host');
const username = arg('username');
const password = arg('password');
const protocol = arg('protocol') === 'https' ? 'https' : 'http';
const timeout = Number(arg('timeout') ?? 5) * 1000;
const endpoints: DeviceEndpoint[] = host ? [{ host, username, password, protocol }] : await discoverMdns(5000);
const results = await Promise.all(endpoints.map(async endpoint => {
  try {
    const { device } = await readNormalizedDevice(endpoint, timeout);
    return { ok: true, device };
  } catch (error) {
    return { ok: false, host: endpoint.host, error: error instanceof Error ? error.message : String(error) };
  }
}));
console.log(JSON.stringify({ scannedAt: new Date().toISOString(), count: results.length, results }, null, 2));
