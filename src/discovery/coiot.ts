import dgram from 'node:dgram';

const COIOT_MULTICAST_ADDR = '224.0.1.187';
const COIOT_PORT = 5683;
const OPT_GLOBAL_DEVID = 3332;

export interface CoIoTNotification {
  mac: string;
  model: string;
  address: string;
}

export type CoIoTHandler = (notification: CoIoTNotification) => void;
type LogFn = (level: 'warn' | 'debug', message: string) => void;

export class CoIoTListener {
  private socket?: dgram.Socket;
  private readonly handlers = new Map<string, CoIoTHandler>();

  constructor(private readonly log: LogFn) {}

  async start(): Promise<boolean> {
    return new Promise(resolve => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const failOpen = (error: Error) => {
        this.log('warn', `CoIoT listener failed to bind UDP ${COIOT_PORT}: ${error.message}. Gen1 devices will fall back to polling.`);
        socket.removeAllListeners();
        try { socket.close(); } catch { /* ignore */ }
        resolve(false);
      };
      socket.once('error', failOpen);
      socket.once('listening', () => {
        socket.off('error', failOpen);
        try {
          socket.addMembership(COIOT_MULTICAST_ADDR);
        } catch (error) {
          this.log('debug', `CoIoT multicast join failed: ${String(error)}. Unicast will still work.`);
        }
        socket.on('error', error => this.log('debug', `CoIoT socket error: ${error.message}`));
        socket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo));
        this.socket = socket;
        resolve(true);
      });
      try {
        socket.bind(COIOT_PORT);
      } catch (error) {
        failOpen(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  stop(): void {
    if (!this.socket) return;
    try { this.socket.close(); } catch { /* ignore */ }
    this.socket = undefined;
    this.handlers.clear();
  }

  register(mac: string, handler: CoIoTHandler): void {
    const key = normalizeMac(mac);
    if (!key) return;
    this.handlers.set(key, handler);
  }

  unregister(mac: string): void {
    const key = normalizeMac(mac);
    if (!key) return;
    this.handlers.delete(key);
  }

  private handleMessage(buffer: Buffer, rinfo: dgram.RemoteInfo): void {
    const devid = parseCoIoTDevid(buffer);
    if (!devid) return;
    const [model, rawMac] = devid.split('#');
    const mac = normalizeMac(rawMac);
    if (!mac) return;
    const handler = this.handlers.get(mac);
    if (!handler) return;
    handler({ mac, model: model ?? '', address: rinfo.address });
  }
}

function normalizeMac(mac: string | undefined): string {
  if (!mac) return '';
  return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

// Minimal CoAP parser that walks options to extract the Shelly global_devid
// (option 3332, format "MODEL#MAC#PROTOCOL_VERSION"). Returns undefined for
// malformed packets or messages that don't carry this option.
export function parseCoIoTDevid(buffer: Buffer): string | undefined {
  if (buffer.length < 4) return undefined;
  const version = (buffer[0] >> 6) & 0x3;
  if (version !== 1) return undefined;
  const tkl = buffer[0] & 0x0f;
  if (tkl > 8) return undefined;
  let offset = 4 + tkl;
  if (offset > buffer.length) return undefined;
  let optionNumber = 0;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    if (byte === 0xff) return undefined;
    let delta = byte >> 4;
    let length = byte & 0x0f;
    if (delta === 13) {
      if (offset >= buffer.length) return undefined;
      delta = buffer[offset++] + 13;
    } else if (delta === 14) {
      if (offset + 1 >= buffer.length) return undefined;
      delta = buffer.readUInt16BE(offset) + 269;
      offset += 2;
    } else if (delta === 15) {
      return undefined;
    }
    if (length === 13) {
      if (offset >= buffer.length) return undefined;
      length = buffer[offset++] + 13;
    } else if (length === 14) {
      if (offset + 1 >= buffer.length) return undefined;
      length = buffer.readUInt16BE(offset) + 269;
      offset += 2;
    } else if (length === 15) {
      return undefined;
    }
    optionNumber += delta;
    if (offset + length > buffer.length) return undefined;
    if (optionNumber === OPT_GLOBAL_DEVID) {
      return buffer.subarray(offset, offset + length).toString('utf8');
    }
    offset += length;
  }
  return undefined;
}
