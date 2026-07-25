import type { ProjectStatus, ReviewStatus } from './types'

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  created: '待填写',
  collecting: '填写中',
  pending_confirm: '待确认',
  supplementing: '补充中',
  submitted: '已提交待梳理',
  analyzing: '梳理中',
  in_review: '审核中',
  published: '已发布',
}

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  created: 'bg-slate-100 text-slate-700 border-slate-200',
  collecting: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_confirm: 'bg-amber-50 text-amber-700 border-amber-200',
  supplementing: 'bg-orange-50 text-orange-700 border-orange-200',
  submitted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  analyzing: 'bg-purple-50 text-purple-700 border-purple-200',
  in_review: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  published: 'bg-green-50 text-green-700 border-green-200',
}

/** 客户端状态文案：客户端不出现「审核」字眼，审核中统一显示「梳理中」，已发布显示「已梳理」 */
export const CLIENT_PROJECT_STATUS_LABEL: Record<string, string> = {
  ...PROJECT_STATUS_LABEL,
  in_review: '梳理中',
  published: '已梳理',
}

export const LINK_STATUS_LABEL: Record<string, string> = {
  active: '有效',
  submitted: '已提交',
  supplementing: '补充中',
  expired: '已过期',
}

export const LINK_STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  supplementing: 'bg-orange-50 text-orange-700 border-orange-200',
  expired: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending_setup: '待设置审核等级',
  pending_l3: '待三级审核',
  pending_l2: '待二级审核',
  pending_l1: '待一级审核',
  published: '已发布',
  superseded: '已更新',
}

export const QUESTION_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  in_review: '回复审核中',
  replied: '已回复',
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  client: '客户',
  reviewer: '审核员',
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

/** 审核链：当前阶段通过后的下一状态（3→pending_l2，2→pending_l1，1→published） */
export function nextReviewStage(currentStage: number): { status: ReviewStatus; current_stage: number } {
  if (currentStage === 3) return { status: 'pending_l2', current_stage: 2 }
  if (currentStage === 2) return { status: 'pending_l1', current_stage: 1 }
  return { status: 'published', current_stage: 1 }
}

/** 项目审核起点（按 review_level） */
export function initialReviewStage(reviewLevel: number | null | undefined): { status: ReviewStatus; current_stage: number } {
  const lv = reviewLevel === 1 || reviewLevel === 2 ? reviewLevel : 3
  return { status: `pending_l${lv}` as ReviewStatus, current_stage: lv }
}

export function randomToken(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function plusDaysISO(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()
}
