export enum ScanStatus {
  Starting = "starting",
  Ready = "ready",
  Running = "running",
  Paused = "paused",
  Stopping = "stopping",
  Done = "done",
  Cancelled = "cancelled",
  Error = "error",
}

export enum PhaseName {
  Navigate = "navigate",
  Awaiting = "awaiting",
  Network = "network",
  NetworkSnapshot = "network_snapshot",
  Layout = "layout",
  Navigation = "navigation",
  Click = "click",
}
