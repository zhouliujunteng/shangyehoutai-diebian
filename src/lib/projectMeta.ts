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
 * 项目主状态靠人工流转，可能滞后（报告已发布但主状态仍停在 analyzing/in_review），
 * 因此有已发布报告时统一按 published（已梳理）展示。
 */
export function clientDisplayStatus(p: ClientProjectMeta): string {
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

/* ---------------- 已读标记（更新红点） ---------------- */

const VIEWED_KEY = 'clientProjectViewedAt'

function getViewedMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VIEWED_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? (obj as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** 进入项目详情时调用：记录查看时间，清除列表更新红点 */
export function markProjectViewed(id: number | string): void {
  try {
    const map = getViewedMap()
    map[String(id)] = Date.now()
    // 控制体积，最多保留 500 条
    const keys = Object.keys(map)
    if (keys.length > 500) {
      keys
        .sort((a, b) => map[a] - map[b])
        .slice(0, keys.length - 500)
        .forEach((k) => delete map[k])
    }
    localStorage.setItem(VIEWED_KEY, JSON.stringify(map))
  } catch {
    /* localStorage 不可用时静默忽略 */
  }
}

/** 是否有未查看的更新（梳理完成 / 提问回复后，用户尚未进入项目查看） */
export function hasUnseenUpdate(p: ClientProjectMeta): boolean {
  const updated = tsOf(projectUpdatedAt(p))
  if (!updated) return false
  return updated > (getViewedMap()[String(p.id)] ?? 0)
}
