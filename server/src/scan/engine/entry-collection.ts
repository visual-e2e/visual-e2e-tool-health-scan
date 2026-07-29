import type { Page } from "playwright";
import type { EventEntryDraft, Framework } from "../../../../core/types/event-entry.js";
import {
  getDefaultProbeSelectors,
  resolveProbeSelectors,
  type ProbeSelectorsConfig,
} from "../../types.js";
import { collectEventEntries } from "./event-collector.js";
import { collectProbeEntries } from "./probe-collector.js";

/** 事件采集优先；probe 仅补全未覆盖的 targetId。 */
export function mergeEventEntries(
  events: EventEntryDraft[],
  probes: EventEntryDraft[],
): EventEntryDraft[] {
  const merged = new Map<string, EventEntryDraft>();
  for (const entry of events) {
    merged.set(entry.targetId, entry);
  }
  for (const entry of probes) {
    if (!merged.has(entry.targetId)) {
      merged.set(entry.targetId, entry);
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
    collectProbeEntries(page, resolved.clickable).catch(() => []),
  ]);
  return mergeEventEntries(events, probes);
}
