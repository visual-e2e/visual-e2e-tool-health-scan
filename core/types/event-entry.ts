export type EventSource =
  | "inline" // onclick / onmouseenter 等内联属性
  | "angular" // __zone_symbol__clickfalse / __ngContext__
  | "react" // __reactFiber props.onClick
  | "vue" // __vue__ / __vueParentComponent
  | "hover"; // CSS :hover 规则

import type { RegistryStatus } from "../enums/registry.js";

export type EventEntryStatus = Exclude<
  RegistryStatus,
  RegistryStatus.Skipped
>;

export type Framework = "auto" | "native" | "angular" | "react" | "vue";

export interface EventEntry {
  /** hash(tagName+text+rect) 页面内唯一定位 */
  targetId: string;
  /** hash(eventType+tagName+text) 跨路由语义去重 */
  semanticId: string;
  /** 最优定位符：id > data-testid > class+tag > nth */
  selector: string;
  tagName: string;
  /** 可见文字，trim 后取前 40 字符 */
  text: string;
  eventTypes: string[];
  sources: EventSource[];
  rect: { top: number; left: number; width: number; height: number };
  /** 1=inline > 2=framework > 3=hover */
  priority: number;
  /** 相同父容器+相同结构 → 同组，用于 list 采样 */
  listGroupKey?: string;
  isVisible: boolean;
  /** 由 EventTable 填写 */
  layer: number;
  status: EventEntryStatus;
  scopeType?: "overlay" | "page";
  scopeId?: string;
  /** overlay 内执行时的根选择器 */
  overlaySelector?: string;
}
