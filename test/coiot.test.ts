import { describe, expect, it } from 'vitest';
import { parseCoIoTDevid } from '../src/discovery/coiot.js';

// Builds a minimal CoAP NON POST with the given options. Options must be
// supplied in ascending number order, matching the encoded delta sequence.
function coapPacket(options: Array<{ number: number; value: Buffer }>, payload?: Buffer): Buffer {
  const header = Buffer.from([0x50, 0x02, 0x00, 0x00]); // ver=1 NON tkl=0, POST, msgId=0
  const parts: Buffer[] = [header];
  let prev = 0;
  for (const opt of options) {
    const delta = opt.number - prev;
    prev = opt.number;
    const length = opt.value.length;
    const encode = (raw: number): { nibble: number; ext: Buffer } => {
      if (raw < 13) return { nibble: raw, ext: Buffer.alloc(0) };
      if (raw < 269) return { nibble: 13, ext: Buffer.from([raw - 13]) };
      const ext = Buffer.alloc(2); ext.writeUInt16BE(raw - 269, 0);
      return { nibble: 14, ext };
    };
    const d = encode(delta);
    const l = encode(length);
    parts.push(Buffer.from([(d.nibble << 4) | l.nibble]), d.ext, l.ext, opt.value);
  }
  if (payload && payload.length > 0) {
    parts.push(Buffer.from([0xff]), payload);
  }
  return Buffer.concat(parts);
}

describe('parseCoIoTDevid', () => {
  it('extracts option 3332 (global_devid) from a valid CoAP packet', () => {
    const value = Buffer.from('SHSW-1#AABBCCDDEEFF#2', 'utf8');
    const packet = coapPacket([{ number: 3332, value }]);
    expect(parseCoIoTDevid(packet)).toBe('SHSW-1#AABBCCDDEEFF#2');
  });

  it('walks past earlier options to reach 3332', () => {
    const packet = coapPacket([
      { number: 11, value: Buffer.from('cit') },
      { number: 11, value: Buffer.from('s') },
      { number: 3332, value: Buffer.from('SHPLG-S#112233445566#2') },
    ]);
    expect(parseCoIoTDevid(packet)).toBe('SHPLG-S#112233445566#2');
  });

  it('returns undefined when the global_devid option is absent', () => {
    const packet = coapPacket([{ number: 11, value: Buffer.from('cit') }]);
    expect(parseCoIoTDevid(packet)).toBeUndefined();
  });

  it('returns undefined for malformed (too-short) input', () => {
    expect(parseCoIoTDevid(Buffer.from([0x50]))).toBeUndefined();
    expect(parseCoIoTDevid(Buffer.alloc(0))).toBeUndefined();
  });

  it('rejects non-CoAP-v1 packets', () => {
    const bad = Buffer.from([0x90, 0x02, 0x00, 0x00]); // version=2
    expect(parseCoIoTDevid(bad)).toBeUndefined();
  });
});
