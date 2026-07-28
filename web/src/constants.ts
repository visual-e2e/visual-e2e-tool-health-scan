import type { IssueCategory, ScanStatus } from "./types";
import { IssueCategory as Cat, ScanStatus as Status } from "./types";

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
