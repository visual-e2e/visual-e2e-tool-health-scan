import {
  ClickPolicy,
  RuleListType,
  SkipReason,
  compileFromConfig,
  buildRuleMatchContext,
  type ClickTargetIdentity,
  type CompiledClickRule,
  type MatchedRuleInfo,
  type ScanOptions,
} from "../../../types.js";

export interface ScoredTarget {
  target: ClickTargetIdentity;
  clickable: boolean;
  score: number;
  matchedRules: MatchedRuleInfo[];
  skipReason?: SkipReason;
}

export function scoreCandidate(
  identity: ClickTargetIdentity,
  rules: CompiledClickRule[],
  defaultWeight: number,
): ScoredTarget {
  const ctx = buildRuleMatchContext(identity);
  let maxWhitelistWeight = defaultWeight;
  const matchedRules: MatchedRuleInfo[] = [];

  for (const rule of rules) {
    if (!rule.test(ctx)) continue;

    matchedRules.push({
      id: rule.id,
      type: rule.list,
      weight: rule.weight,
      matchedText: rule.describe,
    });

    if (rule.list === RuleListType.Blacklist) {
      return {
        target: identity,
        clickable: false,
        score: -Infinity,
        matchedRules,
        skipReason: SkipReason.Blacklist,
      };
    }

    maxWhitelistWeight = Math.max(maxWhitelistWeight, rule.weight);
  }

  return {
    target: identity,
    clickable: true,
    score: maxWhitelistWeight,
    matchedRules,
  };
}

export function sortClickTargets(
  candidates: ClickTargetIdentity[],
  options: Pick<
    ScanOptions,
    | "blacklistRules"
    | "whitelistRules"
    | "whitelistDefaultWeight"
    | "clickPolicy"
    | "defaultWeight"
    | "clickSortTolerancePx"
  >,
): ScoredTarget[] {
  const compiled = compileFromConfig(
    options.blacklistRules,
    options.whitelistRules,
    options.whitelistDefaultWeight,
  );

  const scored = candidates.map((c) => scoreCandidate(c, compiled, options.defaultWeight));

  let pool = scored.filter((x) => x.clickable);

  if (options.clickPolicy === ClickPolicy.WhitelistOnly) {
    pool = pool.filter((x) => x.score > options.defaultWeight);
  }

  const tol = options.clickSortTolerancePx;

  return pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.target.scope.layer !== a.target.scope.layer) {
      return b.target.scope.layer - a.target.scope.layer;
    }
    const rowA = Math.floor(a.target.position.top / tol);
    const rowB = Math.floor(b.target.position.top / tol);
    if (rowA !== rowB) return rowA - rowB;
    return a.target.position.left - b.target.position.left;
  });
}
