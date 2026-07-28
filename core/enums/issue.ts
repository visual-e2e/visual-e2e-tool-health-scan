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
