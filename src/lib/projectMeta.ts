import type { Project } from './types'

/**
 * 客户端项目列表的派生数据工具：
 * - 真实展示状态（有已发布梳理报告即视为「已梳理」，不依赖人工流转的项目主状态）
 * - 项目更新时间（梳理报告发布 / 提问回复发布）
 * - 本地「已读」标记（localStorage），用于列表更新红点
 */

export interface ClientProjectExtra {
  analyses?: { id: number; status?: string; created_at?: string }[] | null
  questions?:
    | {
        id: number
        status?: string
        replies?: { id: number; status?: string; created_at?: string }[] | null
      }[]
    | null
}

export type ClientProjectMeta = Project & ClientProjectExtra

function tsOf(iso?: string | null): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

/** 是否已有已发布的梳理报告 */
export function hasPublishedAnalysis(p: ClientProjectExtra): boolean {
  return (p.analyses ?? []).some((a) => a.status === 'published')
}

/**
 * 客户端真实展示状态：
 * 有「当前版本」指针时——指针所指版本已发布才显示「已梳理」（在审版本客户不可见）；
 * 无指针时回退旧逻辑——有已发布报告即视为「已梳理」（项目主状态靠人工流转，可能滞后）。
 */
export function clientDisplayStatus(p: ClientProjectMeta): string {
  const currentId = p.current_analysis_id ?? null
  if (currentId) {
    const cur = (p.analyses ?? []).find((a) => a.id === currentId)
    return cur && cur.status === 'published' ? 'published' : p.status
  }
  if (p.status !== 'published' && hasPublishedAnalysis(p)) return 'published'
  return p.status
}

/** 项目最近一次对客户可见的更新时间：梳理报告发布 / 提问回复发布；无则返回 null */
export function projectUpdatedAt(p: ClientProjectExtra): string | null {
  let latest = 0
  for (const a of p.analyses ?? []) {
    if (a.status === 'published') latest = Math.max(latest, tsOf(a.created_at))
  }
  for (const q of p.questions ?? []) {
    for (const r of q.replies ?? []) {
      if (r.status === 'published') latest = Math.max(latest, tsOf(r.created_at))
    }
  }
  return latest > 0 ? new Date(latest).toISOString() : null
}

/** 排序用时间戳：优先更新时间，兜底创建时间 */
export function projectSortTs(p: ClientProjectMeta): number {
  return tsOf(projectUpdatedAt(p)) || tsOf(p.created_at)
}

/** 后台视角的项目动态：资料提交 / 报告新版本 / 客户提问，取三者最新时间 */
export interface ServerProjectExtra {
  submissions?: { id: number; created_at?: string }[] | null
  analyses?: { id: number; status?: string; created_at?: string }[] | null
  questions?: { id: number; status?: string; created_at?: string }[] | null
}

export function serverActivityAt(p: ServerProjectExtra): string | null {
  let latest = 0
  for (const s of p.submissions ?? []) latest = Math.max(latest, tsOf(s.created_at))
  for (const a of p.analyses ?? []) latest = Math.max(latest, tsOf(a.created_at))
  for (const q of p.questions ?? []) latest = Math.max(latest, tsOf(q.created_at))
  return latest > 0 ? new Date(latest).toISOString() : null
}

/** 项目状态分组顺序（「分类-更新时间」排序共用：先按此分类，组内按时间倒序） */
export const PROJECT_STATUS_GROUP_ORDER = [
  'created',
  'collecting',
  'pending_confirm',
  'supplementing',
  'submitted',
  'analyzing',
  'in_review',
  'published',
]

/** 审核/回复状态分组顺序（'none' 表示尚未起草，排最前需要优先处理） */
export const REVIEW_STATUS_GROUP_ORDER = [
  'none',
  'pending_setup',
  'pending_l3',
  'pending_l2',
  'pending_l1',
  'published',
  'superseded',
]

/** 状态在分组顺序中的位置，未知状态排最后 */
export function groupIndex(order: string[], status: string): number {
  const i = order.indexOf(status)
  return i === -1 ? order.length : i
}

/* ---------------- 已读标记（更新红点） ---------------- */

/**
 * 已读标记按作用域（scope）隔离存储：
 * - 客户端默认 'client'
 * - 后台建议用 `server:${username}`，避免同一浏览器不同账号互相清除红点
 */
const VIEWED_KEY_PREFIX = 'projectViewedAt:'

function viewedKey(scope: string): string {
  return VIEWED_KEY_PREFIX + scope
}

function getViewedMap(scope: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(viewedKey(scope))
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? (obj as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** 查看项目内容时调用：记录查看时间，清除列表更新红点 */
export function markProjectViewed(id: number | string, scope = 'client'): void {
  try {
    const map = getViewedMap(scope)
    map[String(id)] = Date.now()
    // 控制体积，最多保留 500 条
    const keys = Object.keys(map)
    if (keys.length > 500) {
      keys
        .sort((a, b) => map[a] - map[b])
        .slice(0, keys.length - 500)
        .forEach((k) => delete map[k])
    }
    localStorage.setItem(viewedKey(scope), JSON.stringify(map))
  } catch {
    /* localStorage 不可用时静默忽略 */
  }
}

/** 通用：某时间相对已读标记是否为未读更新（红点判断的底层实现） */
export function isUnseen(ts: string | null | undefined, id: number | string, scope: string): boolean {
  const t = tsOf(ts)
  if (!t) return false
  return t > (getViewedMap(scope)[String(id)] ?? 0)
}

/** 客户端：是否有未查看的更新（梳理完成 / 提问回复后，用户尚未进入项目查看） */
export function hasUnseenUpdate(p: ClientProjectMeta, scope = 'client'): boolean {
  return isUnseen(projectUpdatedAt(p), p.id, scope)
}

/** 后台：是否有未查看的项目动态（新提交 / 新报告版本 / 新提问） */
export function hasUnseenServerActivity(p: ServerProjectExtra & { id: number | string }, scope: string): boolean {
  return isUnseen(serverActivityAt(p), p.id, scope)
}
