import { RuleOp } from "../enums/rule.js";

export function normalizeValues(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

export function matchOp(text: string, values: string[], op: RuleOp): boolean {
  if (!text) return false;
  return values.some((value) => (op === RuleOp.Equals ? text === value : text.includes(value)));
}
