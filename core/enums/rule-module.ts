/** Rule config module — matches Rules drawer tabs; lives on the file envelope only. */
export enum RuleModuleType {
  Whitelist = "whitelist",
  Blacklist = "blacklist",
  Probe = "probe",
  IgnoreRequest = "ignore-request",
}

export const RULE_MODULE_LABEL: Record<RuleModuleType, string> = {
  [RuleModuleType.Whitelist]: "白名单",
  [RuleModuleType.Blacklist]: "黑名单",
  [RuleModuleType.Probe]: "探测选择器",
  [RuleModuleType.IgnoreRequest]: "忽略请求",
};

export const RULE_MODULE_SET = new Set<string>(Object.values(RuleModuleType));
