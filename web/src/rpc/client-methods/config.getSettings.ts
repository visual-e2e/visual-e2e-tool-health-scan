import type { HostSettingsResult } from "../protocol";
import type { RpcCall } from "./types";

export function configGetSettings(call: RpcCall): () => Promise<HostSettingsResult> {
  return () => call<HostSettingsResult>("config.getSettings");
}

