import type { NormalizedShellyDevice, ShellyComponent } from './shelly/types.js';

/** Case-insensitive substring filters. `include` empty means "include everything". */
export interface FilterTerms {
  include: readonly string[];
  exclude: readonly string[];
}

function matches(fields: (string | undefined)[], { include, exclude }: FilterTerms, haystackOf: (fields: string[]) => string[]): boolean {
  const haystack = haystackOf(fields.filter((f): f is string => !!f).map(f => f.toLowerCase()));
  const hit = (term: string) => haystack.some(h => h.includes(term.toLowerCase()));
  if (include.length > 0 && !include.some(hit)) return false;
  return !exclude.some(hit);
}

/**
 * Platform-wide `include` / `exclude`: matched against host, MAC, device
 * id/model/name and, when a component is given, its key/name/type. The fields
 * are joined into one string, as they always have been.
 */
export function matchesGlobalFilters(
  terms: FilterTerms,
  device: NormalizedShellyDevice,
  endpoint: { host: string; name?: string },
  component?: ShellyComponent,
): boolean {
  const fields = [endpoint.host, device.host, device.id, device.mac, device.model, device.name, endpoint.name, component?.key, component?.name, component?.type];
  return matches(fields, terms, f => [f.join(' ')]);
}

/**
 * Per-device `devices[].include` / `exclude`: matched against one component's
 * key, name, and type only, each field on its own. Blank terms are ignored.
 * The generation-neutral `<type>:<id>` alias is matched too, so `switch:0`
 * also selects a Gen1 relay, whose key is `relay:0`.
 */
export function matchesDeviceFilters(terms: Partial<FilterTerms>, component: ShellyComponent): boolean {
  const clean = (list: readonly string[] = []) => list.map(t => t.trim()).filter(Boolean);
  const fields = [component.key, `${component.type}:${component.id}`, component.name, component.type];
  return matches(fields, { include: clean(terms.include), exclude: clean(terms.exclude) }, f => f);
}
