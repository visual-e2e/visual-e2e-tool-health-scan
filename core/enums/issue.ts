export enum IssueCategory {
  Network = "network",
  Layout = "layout",
  Click = "click",
  Runtime = "runtime",
}

export enum IssueSeverity {
  Error = "error",
  Warning = "warning",
}

export enum ClickOutcome {
  Success = "success",
  Failed = "failed",
  Skipped = "skipped",
}

export enum SkipReason {
  Blacklist = "blacklist",
  NotInWhitelist = "not_in_whitelist",
  Obscured = "obscured",
  Disabled = "disabled",
}

export enum FailureCode {
  UnresolvedTarget = "unresolved_target",
  PointerIntercepted = "pointer_intercepted",
  OutOfScope = "out_of_scope",
  ClickTimeout = "click_timeout",
  OverlayCloseFailed = "overlay_close_failed",
  /** Click executed but page showed no visible change */
  NoVisibleEffect = "no_visible_effect",
}

/** How to decide click success after the action. */
export enum ClickSuccessMode {
  /** Playwright click() succeeded */
  ActionOk = "action_ok",
  /** URL / overlay / DOM fingerprint changed after click */
  DomChange = "dom_change",
}
