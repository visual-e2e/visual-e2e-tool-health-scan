export enum ClickPolicy {
  Open = "open",
  WhitelistBoost = "whitelist_boost",
  WhitelistOnly = "whitelist_only",
}

export enum TextMatchMode {
  Exact = "exact",
  Contains = "contains",
  Regex = "regex",
  StartsWith = "startsWith",
}

export enum MatchField {
  Label = "label",
  AriaLabel = "aria-label",
  Title = "title",
  Placeholder = "placeholder",
  ScopeLabel = "scopeLabel",
  NavigationPath = "navigationPath",
  ElementId = "elementId",
}
