import type { RpcMethod } from "../protocol";

export type RpcCall = <T = unknown>(method: RpcMethod, params?: unknown) => Promise<T>;

