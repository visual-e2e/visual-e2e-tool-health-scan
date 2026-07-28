import type { ToolRpcClientOptions } from "./client-core";
import { createToolRpcClientCore } from "./client-core";
import { createToolRpcClientMethods } from "./client-methods/index";
import { isRpcMessage, type RpcFailure } from "./protocol";

/**
 * Tool-iframe side RPC client. Talks to the Host via window.parent postMessage.
 *
 * This file keeps the public API stable and composes:
 * - `client-core` (transport + pending queue)
 * - `client-methods/*` (one wrapper per rpc method)
 */
export function createToolRpcClient(options: ToolRpcClientOptions = {}) {
  const core = createToolRpcClientCore(options);
  const methods = createToolRpcClientMethods(core.call);
  return {
    call: core.call,
    ...methods,
    onNotify: core.onNotify,
    dispose: core.dispose,
  };
}

export type ToolRpcClient = ReturnType<typeof createToolRpcClient>;

export function isRpcFailure(msg: unknown): msg is RpcFailure {
  return isRpcMessage(msg) && msg.kind === "response" && "error" in msg;
}
