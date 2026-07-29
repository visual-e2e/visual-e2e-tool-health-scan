import type { Page } from "playwright";
import type { EventEntry } from "../../../../core/types/event-entry.js";
import { RegistryStatus } from "../../../../core/enums/registry.js";
import { BROWSER_EVAL_SHIM } from "../utils/browser-shim.js";
import {
  classifyEntryScope,
  pickNextByScope,
  reconcileDeferredEntries,
  type PickContext,
} from "./scope-resolver.js";
import type { OverlayInfo } from "../probes/click/overlay.js";

// ---------------------------------------------------------------------------
// EventTable — 分层事件表（含 overlay / page 作用域）
// ---------------------------------------------------------------------------

export interface LayerStats {
  pending: number;
  executed: number;
  stale: number;
  deferred: number;
}

export class EventTable {
  private entries = new Map<string, EventEntry>();
  private activeLayer = 0;
  private readonly listSampleSize: number;

  constructor(listSampleSize = 2) {
    this.listSampleSize = listSampleSize;
  }

  get currentLayer(): number {
    return this.activeLayer;
  }

  nextLayer(): void {
    this.activeLayer += 1;
  }

  allValues(): EventEntry[] {
    return [...this.entries.values()];
  }

  /**
   * 追加新采集的元素；按当前 overlay 状态写入 scope 与初始 status。
   */
  add(
    entries: Omit<EventEntry, "layer" | "status">[],
    topOverlay?: OverlayInfo,
  ): EventEntry[] {
    const added: EventEntry[] = [];
    const layerGroupCount = new Map<string, number>();
    for (const e of this.entries.values()) {
      if (e.layer !== this.activeLayer || !e.listGroupKey) continue;
      const key = `${e.layer}:${e.listGroupKey}`;
      layerGroupCount.set(key, (layerGroupCount.get(key) ?? 0) + 1);
    }

    for (const entry of entries) {
      if (this.entries.has(entry.targetId)) continue;

      if (entry.listGroupKey) {
        const key = `${this.activeLayer}:${entry.listGroupKey}`;
        const count = layerGroupCount.get(key) ?? 0;
        if (count >= this.listSampleSize) continue;
        layerGroupCount.set(key, count + 1);
      }

      const scope = classifyEntryScope(entry, topOverlay);
      const stored: EventEntry = {
        ...entry,
        layer: this.activeLayer,
        status: scope.initialStatus,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        overlaySelector: scope.overlaySelector,
      };
      this.entries.set(entry.targetId, stored);
      added.push(stored);
    }
    return added;
  }

  /** 弹框开关变化时同步 page deferred ↔ pending */
  reconcileScope(topOverlay?: OverlayInfo): EventEntry[] {
    return reconcileDeferredEntries(this.allValues(), topOverlay);
  }

  nextPending(
    topOverlay: OverlayInfo | undefined,
    pickCtx: PickContext,
  ): EventEntry | undefined {
    return pickNextByScope(this.allValues(), topOverlay, pickCtx);
  }

  hasPending(topOverlay: OverlayInfo | undefined, pickCtx: PickContext): boolean {
    return this.nextPending(topOverlay, pickCtx) !== undefined;
  }

  pendingEntries(): EventEntry[] {
    return this.allValues().filter((e) => e.status === RegistryStatus.Pending);
  }

  deferredEntries(): EventEntry[] {
    return this.allValues().filter((e) => e.status === RegistryStatus.Deferred);
  }

  /** 仍待处理的条目（pending + deferred） */
  remainingCount(): number {
    return this.allValues().filter(
      (e) => e.status === RegistryStatus.Pending || e.status === RegistryStatus.Deferred,
    ).length;
  }

  pendingCount(): number {
    return this.pendingEntries().length;
  }

  hasOverlayPending(): boolean {
    return this.allValues().some(
      (e) => e.scopeType === "overlay" && e.status === RegistryStatus.Pending,
    );
  }

  markExecuted(targetId: string): void {
    const entry = this.entries.get(targetId);
    if (entry) entry.status = RegistryStatus.Executed;
  }

  markStale(targetId: string): void {
    const entry = this.entries.get(targetId);
    if (entry) entry.status = RegistryStatus.Stale;
  }

  clear(): void {
    this.entries.clear();
  }

  async prune(page: Page): Promise<EventEntry[]> {
    const checkable = this.allValues().filter(
      (e) => e.status === RegistryStatus.Pending || e.status === RegistryStatus.Deferred,
    );
    if (checkable.length === 0) return [];

    const selectors = checkable.map((e) => e.selector);
    const aliveFlags = await page.evaluate(
      (payload: { shim: string; selectors: string[] }): boolean[] => {
        eval(payload.shim);
        return payload.selectors.map((sel) => {
          try {
            return document.querySelector(sel) !== null;
          } catch {
            return false;
          }
        });
      },
      { shim: BROWSER_EVAL_SHIM, selectors },
    );

    const staled: EventEntry[] = [];
    for (let i = 0; i < checkable.length; i++) {
      if (!aliveFlags[i]) {
        checkable[i].status = RegistryStatus.Stale;
        staled.push(checkable[i]);
      }
    }
    return staled;
  }

  isLayerDone(layer: number, globalExecuted: Set<string>, topOverlay?: OverlayInfo): boolean {
    for (const entry of this.entries.values()) {
      if (entry.layer !== layer) continue;
      if (entry.status !== RegistryStatus.Pending) continue;
      if (globalExecuted.has(entry.semanticId)) continue;
      if (topOverlay && entry.scopeType === "page") continue;
      return false;
    }
    return true;
  }

  isCurrentLayerDone(globalExecuted: Set<string>, topOverlay?: OverlayInfo): boolean {
    return this.isLayerDone(this.activeLayer, globalExecuted, topOverlay);
  }

  stats(): Record<number, LayerStats> {
    const result: Record<number, LayerStats> = {};
    for (const entry of this.entries.values()) {
      const s = (result[entry.layer] ??= {
        pending: 0,
        executed: 0,
        stale: 0,
        deferred: 0,
      });
      if (entry.status in s) {
        s[entry.status as keyof LayerStats] += 1;
      }
    }
    return result;
  }

  get size(): number {
    return this.entries.size;
  }
}
