import type { SwitchServiceType } from '../config.js';
import type { ShellyComponent } from '../shelly/types.js';

/**
 * Model prefixes of Shelly smart plugs: Gen1 Plug / Plug S / Plug US / Plug 2
 * (`SHPLG-1`, `SHPLG-S`, `SHPLG-U1`, `SHPLG2-1`) and the Gen2 Plus Plug family
 * (`SNPL-00112EU` Plus Plug S, `SNPL-00110IT`, `SNPL-00112UK`, `SNPL-00116US`).
 */
const PLUG_MODEL_PREFIXES = ['SHPLG', 'SNPL-'];

export function isPlugModel(model: string): boolean {
  const upper = model.toUpperCase();
  return PLUG_MODEL_PREFIXES.some(prefix => upper.startsWith(prefix));
}

/**
 * Pick the HomeKit service for a relay/switch component: an explicit
 * `serviceType` override wins, then the Gen1 relay `appliance_type`
 * (`outlet` → Outlet, `lights` → Lightbulb), then the plug model class.
 * Everything else stays a Switch.
 */
export function switchServiceType(
  component: Extract<ShellyComponent, { type: 'switch' }>,
  model: string,
  override?: SwitchServiceType,
): SwitchServiceType {
  if (override) return override;
  const appliance = component.applianceType?.toLowerCase();
  if (appliance === 'outlet') return 'outlet';
  if (appliance === 'lights') return 'light';
  return isPlugModel(model) ? 'outlet' : 'switch';
}
