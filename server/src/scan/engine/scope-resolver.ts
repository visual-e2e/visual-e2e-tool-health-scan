import type { Page } from "playwright";
import type { EventEntry } from "../../../../core/types/event-entry.js";
import { RegistryStatus } from "../../../../core/enums/registry.js";
import {
  ClickPolicy,
  getDefaultProbeSelectors,
  resolveProbeSelectors,
  type ResolvedProbeSelectors,
} from "../../types.js";
import { detectOverlayStack, type OverlayInfo } from "../probes/click/overlay.js";
import { isSchedulableEntry } from "./registry-scorer.js";
import { isNavigationEntry } from "./nav-utils.js";

export type EntryScopeType = "overlay" | "page";

export interface ScheduleContext {
  clickPolicy: ClickPolicy;
  defaultWeight: number;
  /** 单页点击已达上限时，仅调度导航类 */
  navOnly?: boolean;
}

export interface PickContext {
  globalExecuted: Set<string>;
  applySemanticDedup: boolean;
  schedule: ScheduleContext;
}

export interface ScopedEntryMeta {
  scopeType: EntryScopeType;
  scopeId: string;
  overlaySelector?: string;
  initialStatus: RegistryStatus.Pending | RegistryStatus.Deferred;
}

export function buildOverlayScopeId(overlay: OverlayInfo): string {
  const r = overlay.rect;
  return `overlay:${overlay.selector}:${Math.round(r.top)}:${Math.round(r.left)}:${overlay.layer}`;
}

function centerOf(rect: EventEntry["rect"]): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function pointInRect(
  point: { x: number; y: number },
  rect: { top: number; left: number; width: number; height: number },
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

export function classifyEntryScope(
  entry: Pick<EventEntry, "rect">,
  topOverlay: OverlayInfo | undefined,
): ScopedEntryMeta {
  if (!topOverlay) {
    return {
      scopeType: "page",
      scopeId: "page-root",
      initialStatus: RegistryStatus.Pending,
    };
  }

  const inOverlay = pointInRect(centerOf(entry.rect), topOverlay.rect);
  if (inOverlay) {
    return {
      scopeType: "overlay",
      scopeId: buildOverlayScopeId(topOverlay),
      overlaySelector: topOverlay.selector,
      initialStatus: RegistryStatus.Pending,
    };
  }

  return {
    scopeType: "page",
    scopeId: "page-root",
    initialStatus: RegistryStatus.Deferred,
  };
}

export async function getTopOverlay(
  page: Page,
  probe: ResolvedProbeSelectors = resolveProbeSelectors(getDefaultProbeSelectors()),
): Promise<OverlayInfo | undefined> {
  const stack = await detectOverlayStack(page, probe.overlay, probe.overlayTitle);
  return stack[0];
}

export function pickNextByScope(
  entries: EventEntry[],
  topOverlay: OverlayInfo | undefined,
  pickCtx: PickContext,
): EventEntry | undefined {
  const { globalExecuted, applySemanticDedup, schedule } = pickCtx;
  const executable = entries.filter((e) => {
    if (e.status === RegistryStatus.Deferred) return false;
    if (!isSchedulableEntry(e, schedule)) return false;
    if (applySemanticDedup && globalExecuted.has(e.semanticId)) return false;
    if (schedule.navOnly && !isNavigationEntry(e)) return false;
    return e.status === RegistryStatus.Pending;
  });

  const overlayPending = executable.filter((e) => e.scopeType === "overlay");
  if (topOverlay && overlayPending.length > 0) {
    return pickBestEntry(overlayPending, schedule.defaultWeight);
  }

  if (topOverlay) {
    return undefined;
  }

  const pagePending = executable.filter((e) => e.scopeType === "page");
  if (pagePending.length > 0) {
    return pickBestEntry(pagePending, schedule.defaultWeight);
  }

  return undefined;
}

function pickBestEntry(entries: EventEntry[], defaultWeight: number): EventEntry | undefined {
  if (entries.length === 0) return undefined;
  return [...entries].sort((a, b) => compareEntryPriority(a, b, defaultWeight))[0];
}

function compareEntryPriority(a: EventEntry, b: EventEntry, defaultWeight: number): number {
  if (b.layer !== a.layer) return b.layer - a.layer;
  const scoreA = a.score ?? defaultWeight;
  const scoreB = b.score ?? defaultWeight;
  if (scoreB !== scoreA) return scoreB - scoreA;
  if (a.rect.top !== b.rect.top) return a.rect.top - b.rect.top;
  return a.rect.left - b.rect.left;
}

export function reconcileDeferredEntries(
  entries: EventEntry[],
  topOverlay: OverlayInfo | undefined,
): EventEntry[] {
  const changed: EventEntry[] = [];
  for (const entry of entries) {
    if (topOverlay) {
      const meta = classifyEntryScope(entry, topOverlay);
      if (meta.scopeType === "overlay") {
        const needsUpdate =
          entry.status === RegistryStatus.Deferred ||
          entry.scopeType !== "overlay" ||
          entry.scopeId !== meta.scopeId;
        if (
          needsUpdate &&
          (entry.status === RegistryStatus.Pending || entry.status === RegistryStatus.Deferred)
        ) {
          entry.status = RegistryStatus.Pending;
          entry.scopeType = "overlay";
          entry.scopeId = meta.scopeId;
          entry.overlaySelector = meta.overlaySelector;
          changed.push(entry);
        }
      } else if (meta.scopeType === "page" && entry.status === RegistryStatus.Pending) {
        entry.status = RegistryStatus.Deferred;
        entry.scopeType = "page";
        entry.scopeId = "page-root";
        entry.overlaySelector = undefined;
        changed.push(entry);
      }
      continue;
    }

    if (entry.status === RegistryStatus.Deferred && entry.scopeType === "page") {
      entry.status = RegistryStatus.Pending;
      changed.push(entry);
    }
  }
  return changed;
}
