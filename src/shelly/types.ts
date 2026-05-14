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

export interface SwitchState { on: boolean; power?: number; voltage?: number; current?: number; energy?: number }
export interface LightState extends SwitchState { brightness?: number; hue?: number; saturation?: number; colorTemperature?: number }
export interface CoverState { currentPosition?: number; targetPosition?: number; moving: 'opening' | 'closing' | 'stopped'; closed?: boolean }
export interface InputState { active?: boolean; event?: string; eventCount?: number }
export interface SensorState { value: boolean | number | string | null; unit?: string }

export type ShellyComponent =
  | { key: string; type: 'switch'; id: number; name?: string; state: SwitchState }
  | { key: string; type: 'light'; id: number; name?: string; state: LightState }
  | { key: string; type: 'cover'; id: number; name?: string; state: CoverState }
  | { key: string; type: 'input'; id: number; name?: string; state: InputState }
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
