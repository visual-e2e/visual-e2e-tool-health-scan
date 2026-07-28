import type { BrowserRuntimeResult } from "../protocol";
import type { RpcCall } from "./types";

export function configGetBrowserRuntime(call: RpcCall): () => Promise<BrowserRuntimeResult> {
  return () => call<BrowserRuntimeResult>("config.getBrowserRuntime");
}

