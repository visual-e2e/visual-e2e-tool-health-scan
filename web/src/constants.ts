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
