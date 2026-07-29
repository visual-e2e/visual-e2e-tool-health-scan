import { RuleOp } from "../enums/rule.js";
import { RuleModuleType } from "../enums/rule-module.js";

/** Ignore-request rule kinds — map to Playwright resourceType (+ domain = any). */
export enum IgnoreRequestType {
  Domain = "domain",
  Script = "script",
  Stylesheet = "stylesheet",
  Image = "image",
  Document = "document",
  Font = "font",
  Api = "api",
  Media = "media",
}

export interface IgnoreRequestRule {
  id: number;
  title: string;
  description?: string;
  type: IgnoreRequestType;
  op: RuleOp;
  values: string[];
}

export interface IgnoreRequestRuleFile {
  version: 1;
  type: RuleModuleType.IgnoreRequest;
  rules: IgnoreRequestRule[];
}

/** Playwright resourceType values covered by each ignore type. */
export const IGNORE_REQUEST_RESOURCE_TYPES: Record<IgnoreRequestType, string[] | null> = {
  [IgnoreRequestType.Domain]: null,
  [IgnoreRequestType.Script]: ["script"],
  [IgnoreRequestType.Stylesheet]: ["stylesheet"],
  [IgnoreRequestType.Image]: ["image"],
  [IgnoreRequestType.Document]: ["document"],
  [IgnoreRequestType.Font]: ["font"],
  [IgnoreRequestType.Api]: ["xhr", "fetch"],
  [IgnoreRequestType.Media]: ["media"],
};

export const IGNORE_REQUEST_TYPE_LABEL: Record<IgnoreRequestType, string> = {
  [IgnoreRequestType.Domain]: "域名/URL",
  [IgnoreRequestType.Script]: "脚本",
  [IgnoreRequestType.Stylesheet]: "样式",
  [IgnoreRequestType.Image]: "图片",
  [IgnoreRequestType.Document]: "文档",
  [IgnoreRequestType.Font]: "字体",
  [IgnoreRequestType.Api]: "接口",
  [IgnoreRequestType.Media]: "媒体",
};
