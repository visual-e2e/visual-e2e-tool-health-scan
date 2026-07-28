import type { RpcCall } from "./types";
import type { NavigateScenarioParams } from "../protocol";

export function scenarioNavigate(
  call: RpcCall,
): (module: string, scenario: string) => Promise<void> {
  return (module: string, scenario: string) =>
    call<void>("scenario.navigate", { module, scenario } satisfies NavigateScenarioParams);
}

