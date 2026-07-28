import type { RpcCall } from "./types";
import { cacheClear } from "./cache.clear";
import { configGetBrowserRuntime } from "./config.getBrowserRuntime";
import { configGetSettings } from "./config.getSettings";
import { fsPickFolder } from "./fs.pickFolder";
import { projectGetContext } from "./project.getContext";
import { projectGetVariables } from "./project.getVariables";
import { projectList } from "./project.list";
import { scenarioNavigate } from "./scenario.navigate";

export function createToolRpcClientMethods(call: RpcCall) {
  return {
    getProjectContext: projectGetContext(call),
    listProjects: projectList(call),
    getProjectVariables: projectGetVariables(call),
    getSettings: configGetSettings(call),
    getBrowserRuntime: configGetBrowserRuntime(call),
    pickFolder: fsPickFolder(call),
    navigateScenario: scenarioNavigate(call),
    cacheClear: cacheClear(call),
  };
}

