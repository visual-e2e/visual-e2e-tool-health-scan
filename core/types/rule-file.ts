import type { RuleModuleType } from "../enums/rule-module.js";
import type { RuleOp } from "../enums/rule.js";

/** Shared fields across whitelist / blacklist / probe / ignore-request rules. */
export interface BaseRule {
  id: number;
  title: string;
  description?: string;
  /** Match kind within the module (text/selector/domain/…). Not the module type. */
  type: string;
  op: RuleOp;
  values: string[];
}

/** File envelope — module identity is here, never on each rule. */
export interface RuleFileEnvelope {
  version: number;
  type: RuleModuleType;
  rules: BaseRule[];
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ValidateRuleFileResult =
  | {
      ok: true;
      module: RuleModuleType;
      /** Normalized file object ready to persist */
      file: unknown;
      warnings: ValidationIssue[];
    }
  | {
      ok: false;
      errors: ValidationIssue[];
      warnings: ValidationIssue[];
    };
