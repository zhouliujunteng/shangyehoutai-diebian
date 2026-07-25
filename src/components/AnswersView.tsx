import type { Submission } from '@/lib/types'
import { formatTime } from '@/lib/labels'
import { Badge } from '@/components/ui/badge'

/** 友好渲染 submission 的 answers JSON（{中文字段名: 答案}） */
export default function AnswersView({ submission }: { submission: Submission }) {
  const answers = submission.answers ?? {}
  const entries = Object.entries(answers)
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          {submission.form_type === 'basic' ? '基础版' : '详细版'}
        </Badge>
        {submission.is_supplement && (
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
            补充提交
          </Badge>
        )}
        <span className="text-sm text-slate-500">
          {submission.filler_name || '匿名'}
          {submission.filler_contact ? ` · ${submission.filler_contact}` : ''}
        </span>
        <span className="ml-auto text-xs text-slate-400">{formatTime(submission.created_at)}</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">暂无填写内容</p>
      ) : (
        <dl className="divide-y divide-slate-50">
          {entries.map(([k, v]) => (
            <div key={k} className="px-4 py-2.5 sm:grid sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-sm font-medium text-slate-600">{k}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800 sm:mt-0">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
