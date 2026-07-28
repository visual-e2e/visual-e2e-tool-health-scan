import type { LoginProfile, LoginSelectors, ScanOptions } from "./options.js";

/** Scan options persisted per profile (rules stored separately). */
export type PersistedScanConfig = Omit<
  ScanOptions,
  "blacklistRules" | "whitelistRules" | "whitelistDefaultWeight" | "clickExclude"
> & {
  projectId?: string;
};

export interface LoginDefaults {
  startUrl?: string;
  projectId?: string;
  loginProfile?: LoginProfile;
  loginSelectors?: LoginSelectors;
}
