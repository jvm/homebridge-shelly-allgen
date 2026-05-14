import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __test, fetchJson, url, validateHost } from '../src/util/http.js';

describe('HTTP host validation', () => {
  it('rejects URL-shaped hosts to avoid malformed outbound requests', () => {
    expect(() => validateHost('http://192.168.1.2')).toThrow(/hostname\/IP/);
    expect(() => validateHost('192.168.1.2/path')).toThrow(/hostname\/IP/);
    expect(() => validateHost('user@example.com')).toThrow(/hostname\/IP/);
  });

  it('accepts plain hostnames, IPs, and ports', () => {
    expect(url('shellyplusplugs.local:80', '/shelly')).toBe('http://shellyplusplugs.local:80/shelly');
    expect(url('192.168.1.2', 'status')).toBe('http://192.168.1.2/status');
    expect(url('192.168.1.2', 'status', 'https')).toBe('https://192.168.1.2/status');
  });
});

describe('Digest auth', () => {
  it('parses an RFC 7616 challenge with quoted and unquoted params', () => {
    const parsed = __test.parseDigestChallenge('Digest realm="shelly", nonce="abc123", qop="auth", algorithm=SHA-256, opaque="o1"');
    expect(parsed).toMatchObject({ realm: 'shelly', nonce: 'abc123', qop: 'auth', algorithm: 'SHA-256', opaque: 'o1' });
  });

  it('produces an Authorization header with SHA-256 response and qop=auth fields', () => {
    const header = __test.buildDigestHeader(
      'http://192.168.1.2/rpc/Switch.Set?id=0&on=true',
      'GET',
      'Digest realm="shelly", nonce="abc123", qop="auth", algorithm=SHA-256',
      'admin',
      'pw',
    );
    expect(header).toMatch(/^Digest /);
    expect(header).toContain('username="admin"');
    expect(header).toContain('realm="shelly"');
    expect(header).toContain('algorithm=SHA-256');
    expect(header).toContain('qop=auth');
    expect(header).toMatch(/nc=00000001/);
    expect(header).toMatch(/cnonce="[a-f0-9]{16}"/);
    expect(header).toMatch(/response="[a-f0-9]{64}"/);
  });
});

describe('fetchJson auth challenge flow', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('refuses Basic challenge over cleartext HTTP', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="shelly"' },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchJson('http://192.168.1.2/status', {
      timeoutMs: 100,
      credentials: { username: 'admin', password: 'secret' },
    })).rejects.toThrow(/Refusing to send Basic credentials/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries with Digest auth when challenged', async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Response('', {
          status: 401,
          headers: { 'www-authenticate': 'Digest realm="shelly", nonce="n1", qop="auth", algorithm=SHA-256' },
        });
      }
      expect(String(init.headers && (init.headers as Record<string, string>).Authorization)).toMatch(/^Digest /);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchJson<{ ok: boolean }>('http://192.168.1.2/rpc/Shelly.GetStatus', {
      timeoutMs: 100,
      credentials: { username: 'admin', password: 'pw' },
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not send any auth on a successful first request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ gen: 2 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchJson('http://192.168.1.2/shelly', {
      timeoutMs: 100,
      credentials: { username: 'admin', password: 'pw' },
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
