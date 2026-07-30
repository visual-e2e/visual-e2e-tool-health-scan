import type { ClickActionLog, IssueCategory, RegistryStatus, ScanStatus } from "./types";
import {
  ClickOutcome,
  FAILURE_CODE_LABEL,
  IssueCategory as Cat,
  RegistryStatus as Reg,
  ScanStatus as Status,
  SkipReason,
} from "./types";

export const LIVE_STATUSES = new Set<ScanStatus>([
  Status.Starting,
  Status.Ready,
  Status.Running,
  Status.Paused,
  Status.Stopping,
]);

export const CONFIG_LOCKED = new Set<ScanStatus>([
  Status.Starting,
  Status.Ready,
  Status.Running,
  Status.Paused,
  Status.Stopping,
]);

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  [Cat.Network]: "网络",
  [Cat.Layout]: "布局",
  [Cat.Click]: "交互",
  [Cat.Runtime]: "运行时",
};

export const STATUS_LABEL: Record<ScanStatus, string> = {
  [Status.Starting]: "启动中",
  [Status.Ready]: "等待就绪",
  [Status.Running]: "扫描中",
  [Status.Paused]: "已暂停",
  [Status.Stopping]: "停止中",
  [Status.Done]: "已完成",
  [Status.Cancelled]: "已取消",
  [Status.Error]: "出错",
};

export const STATUS_COLOR: Record<ScanStatus, string> = {
  [Status.Starting]: "processing",
  [Status.Ready]: "warning",
  [Status.Running]: "processing",
  [Status.Paused]: "default",
  [Status.Stopping]: "processing",
  [Status.Done]: "success",
  [Status.Cancelled]: "default",
  [Status.Error]: "error",
};

export const REGISTRY_STATUS_LABEL: Record<RegistryStatus, string> = {
  [Reg.Pending]: "待执行",
  [Reg.Executed]: "已执行",
  [Reg.Deferred]: "延后(弹框优先)",
  [Reg.Stale]: "已失效",
  [Reg.Skipped]: "已跳过",
};

export const REGISTRY_STATUS_COLOR: Record<RegistryStatus, string> = {
  [Reg.Pending]: "processing",
  [Reg.Executed]: "success",
  [Reg.Deferred]: "gold",
  [Reg.Stale]: "default",
  [Reg.Skipped]: "warning",
};

/** 活跃队列：待执行 / 延后 / 已执行 */
export const REGISTRY_ACTIVE_STATUSES = new Set<RegistryStatus>([
  Reg.Pending,
  Reg.Deferred,
  Reg.Executed,
]);

/** 归档：跳过 / 失效 */
export const REGISTRY_ARCHIVE_STATUSES = new Set<RegistryStatus>([
  Reg.Skipped,
  Reg.Stale,
]);

const REGISTRY_LAST_RESULT_LABEL: Record<string, string> = {
  pending: "待执行",
  deferred: "延后",
  executed: "已执行",
  stale: "DOM 已消失",
  skipped: "已跳过",
  success: "成功",
  failed: "失败",
  "semantic-dedup": "语义重复",
  "page-budget": "单页预算",
  blacklist: "黑名单",
};

export function formatRegistryLastResult(value?: string): string {
  if (!value) return "—";
  return REGISTRY_LAST_RESULT_LABEL[value] ?? value;
}

export function compareRegistryItems(
  a: { status: RegistryStatus; layer: number; lastUpdatedAt: string },
  b: { status: RegistryStatus; layer: number; lastUpdatedAt: string },
): number {
  const rank: Record<RegistryStatus, number> = {
    [Reg.Pending]: 0,
    [Reg.Deferred]: 1,
    [Reg.Executed]: 2,
    [Reg.Skipped]: 3,
    [Reg.Stale]: 4,
  };
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  if (b.layer !== a.layer) return b.layer - a.layer;
  return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt);
}

export const CLICK_OUTCOME_COLOR: Record<ClickOutcome, string> = {
  [ClickOutcome.Success]: "success",
  [ClickOutcome.Skipped]: "default",
  [ClickOutcome.Failed]: "error",
};

export function formatClickOutcomeLabel(row: ClickActionLog): string {
  if (row.outcome === ClickOutcome.Success) return "成功";
  if (row.outcome === ClickOutcome.Skipped) {
    return row.skipReason === SkipReason.Blacklist ? "跳过(黑)" : "跳过";
  }
  return row.failureCode ? FAILURE_CODE_LABEL[row.failureCode] : "失败";
}
