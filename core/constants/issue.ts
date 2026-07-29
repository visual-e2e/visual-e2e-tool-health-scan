export { IssueCategory, IssueSeverity, FailureCode, ClickSuccessMode } from "../enums/issue.js";

export const FAILURE_CODE_LABEL: Record<
  import("../enums/issue.js").FailureCode,
  string
> = {
  unresolved_target: "无法定位元素",
  pointer_intercepted: "被遮罩拦截",
  out_of_scope: "不在当前作用域",
  click_timeout: "点击超时",
  overlay_close_failed: "浮层关闭失败",
  no_visible_effect: "点击无页面变化",
};
