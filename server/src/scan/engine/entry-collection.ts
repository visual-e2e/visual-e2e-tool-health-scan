import type { Page } from "playwright";
import type { EventEntryDraft, Framework } from "../../../../core/types/event-entry.js";
import {
  getDefaultProbeSelectors,
  resolveProbeSelectors,
  type ProbeSelectorsConfig,
} from "../../types.js";
import { collectEventEntries } from "./event-collector.js";
import { collectProbeEntries } from "./probe-collector.js";
import { markNavigationEntries } from "./nav-utils.js";

/** 事件采集优先；probe 仅补全未覆盖的 targetId。导航标记取 OR。 */
export function mergeEventEntries(
  events: EventEntryDraft[],
  probes: EventEntryDraft[],
): EventEntryDraft[] {
  const merged = new Map<string, EventEntryDraft>();
  for (const entry of events) {
    merged.set(entry.targetId, entry);
  }
  for (const entry of probes) {
    const existing = merged.get(entry.targetId);
    if (!existing) {
      merged.set(entry.targetId, entry);
      continue;
    }
    if (entry.isNavigation) {
      existing.isNavigation = true;
    }
  }
  return [...merged.values()];
}

export async function collectAllEventEntries(
  page: Page,
  framework: Framework,
  probeConfig: ProbeSelectorsConfig = getDefaultProbeSelectors(),
): Promise<EventEntryDraft[]> {
  const resolved = resolveProbeSelectors(probeConfig);
  const [events, probes] = await Promise.all([
    collectEventEntries(page, framework).catch(() => []),
    collectProbeEntries(page, resolved.clickable, resolved.nav).catch(() => []),
  ]);
  const merged = mergeEventEntries(events, probes);
  return markNavigationEntries(page, merged, resolved.nav);
}
