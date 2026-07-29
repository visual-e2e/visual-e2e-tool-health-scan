import { FailureCode } from "../types.js";

export function classifyClickFailure(error?: string): FailureCode {
  if (!error) return FailureCode.UnresolvedTarget;
  const lower = error.toLowerCase();
  if (error.includes("无明显变化") || error.includes("无页面变化")) {
    return FailureCode.NoVisibleEffect;
  }
  if (error.includes("无法定位")) return FailureCode.UnresolvedTarget;
  if (lower.includes("intercepts pointer")) return FailureCode.PointerIntercepted;
  if (lower.includes("timeout")) return FailureCode.ClickTimeout;
  if (error.includes("浮层") || error.includes("overlay")) return FailureCode.OverlayCloseFailed;
  if (lower.includes("out of scope") || error.includes("不在当前")) {
    return FailureCode.OutOfScope;
  }
  return FailureCode.UnresolvedTarget;
}

export const FAILURE_CODE_LABEL: Record<FailureCode, string> = {
  [FailureCode.UnresolvedTarget]: "无法定位元素",
  [FailureCode.PointerIntercepted]: "被遮罩拦截",
  [FailureCode.OutOfScope]: "不在当前作用域",
  [FailureCode.ClickTimeout]: "点击超时",
  [FailureCode.OverlayCloseFailed]: "浮层关闭失败",
  [FailureCode.NoVisibleEffect]: "点击无页面变化",
};
