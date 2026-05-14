export type ShellyGeneration = 1 | 2 | 3 | 4;

export interface Credentials { username?: string; password?: string }

export interface DeviceEndpoint extends Credentials {
  host: string;
  protocol?: 'http' | 'https';
  name?: string;
  generation?: 'auto' | 'gen1' | 'gen2';
}

export interface ShellyDeviceInfo {
  id: string;
  mac: string;
  host: string;
  generation: ShellyGeneration;
  model: string;
  name?: string;
  firmware?: string;
  authEnabled: boolean;
}

// Energy/power units are normalized across generations: `power` is watts,
// `voltage` volts, `current` amps, and `energy` / `energyReturned` are
// watt-hours. Gen1 `/status` meters report lifetime energy in watt-minutes and
// are converted on the way in; Gen1 `emeters` and Gen2 `aenergy` already use Wh.
export interface SwitchState { on: boolean; power?: number; voltage?: number; current?: number; energy?: number; energyReturned?: number }
export interface LightState extends SwitchState { brightness?: number; hue?: number; saturation?: number; colorTemperature?: number }
export interface CoverState { currentPosition?: number; targetPosition?: number; moving: 'opening' | 'closing' | 'stopped'; closed?: boolean }
export interface InputState { active?: boolean; event?: string; eventCount?: number }
export interface SensorState { value: boolean | number | string | null; unit?: string }
/** A standalone energy-metering channel with no associated relay/light (e.g. a Shelly EM/3EM CT clamp). */
export interface MeterState { power?: number; voltage?: number; current?: number; powerFactor?: number; energy?: number; energyReturned?: number }

export type ShellyComponent =
  | { key: string; type: 'switch'; id: number; name?: string; state: SwitchState }
  | { key: string; type: 'light'; id: number; name?: string; state: LightState }
  | { key: string; type: 'cover'; id: number; name?: string; state: CoverState }
  | { key: string; type: 'input'; id: number; name?: string; state: InputState }
  | { key: string; type: 'meter'; id: number; name?: string; state: MeterState }
  | { key: string; type: 'sensor'; id: number; name?: string; sensorKind: string; state: SensorState };

export interface NormalizedShellyDevice extends ShellyDeviceInfo {
  components: ShellyComponent[];
}

export interface LightCommand { on?: boolean; brightness?: number }
export interface CoverCommand { action: 'open' | 'close' | 'stop' | 'position'; position?: number }

export interface ShellyUpdate { componentKey: string; state: unknown; event?: string }

export interface ShellyClient {
  getDeviceInfo(): Promise<ShellyDeviceInfo>;
  getStatus(): Promise<unknown>;
  getConfig(): Promise<unknown>;
  discoverComponents(): Promise<ShellyComponent[]>;
  setSwitch(id: number, on: boolean): Promise<void>;
  setLight(id: number, command: LightCommand): Promise<void>;
  setCover(id: number, command: CoverCommand): Promise<void>;
  subscribe?(handler: (update: ShellyUpdate) => void, onClose?: () => void): Promise<() => void>;
}
