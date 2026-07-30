import { Badge } from '@/components/ui/badge'
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_COLOR,
  CLIENT_PROJECT_STATUS_LABEL,
  LINK_STATUS_LABEL,
  LINK_STATUS_COLOR,
  REVIEW_STATUS_LABEL,
  QUESTION_STATUS_LABEL,
  FEEDBACK_LINK_STATUS_LABEL,
  FEEDBACK_SUBMISSION_STATUS_LABEL,
} from '@/lib/labels'
import type { FeedbackLinkStatus, FeedbackSubmissionStatus, ProjectStatus, ReviewStatus } from '@/lib/types'

export function ProjectStatusBadge({ status }: { status: string }) {
  const color = PROJECT_STATUS_COLOR[status as ProjectStatus] ?? 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <Badge variant="outline" className={color}>
      {PROJECT_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

/** 客户端专用：in_review 显示「梳理中」，不出现「审核」字眼 */
export function ClientProjectStatusBadge({ status }: { status: string }) {
  const color = PROJECT_STATUS_COLOR[status as ProjectStatus] ?? 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <Badge variant="outline" className={color}>
      {CLIENT_PROJECT_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

export function LinkStatusBadge({ status }: { status: string }) {
  const color = LINK_STATUS_COLOR[status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <Badge variant="outline" className={color}>
      {LINK_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

export function ReviewStatusBadge({ status }: { status: string }) {
  const label = REVIEW_STATUS_LABEL[status as ReviewStatus] ?? status
  const color =
    status === 'published'
      ? 'bg-green-50 text-green-700 border-green-200'
      : status === 'superseded'
        ? 'bg-slate-100 text-slate-500 border-slate-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <Badge variant="outline" className={color}>
      {label}
    </Badge>
  )
}

export function QuestionStatusBadge({ status }: { status: string }) {
  const color =
    status === 'replied'
      ? 'bg-green-50 text-green-700 border-green-200'
      : status === 'in_review'
        ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <Badge variant="outline" className={color}>
      {QUESTION_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

/* ---------- 方案反馈 ---------- */

export function FeedbackLinkStatusBadge({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-green-50 text-green-700 border-green-200'
      : status === 'submitted'
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : status === 'done'
          ? 'bg-slate-100 text-slate-500 border-slate-200'
          : 'bg-slate-100 text-slate-400 border-slate-200'
  return (
    <Badge variant="outline" className={color}>
      {FEEDBACK_LINK_STATUS_LABEL[status as FeedbackLinkStatus] ?? status}
    </Badge>
  )
}

export function FeedbackSubmissionStatusBadge({ status }: { status: string }) {
  const color =
    status === 'replied'
      ? 'bg-green-50 text-green-700 border-green-200'
      : status === 'confirmed'
        ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <Badge variant="outline" className={color}>
      {FEEDBACK_SUBMISSION_STATUS_LABEL[status as FeedbackSubmissionStatus] ?? status}
    </Badge>
  )
}
