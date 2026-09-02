import { useCallback, useEffect, useRef, useState } from 'react'
import { gql, logOperation, createActionFlowTask, PLAN_SPLIT_FLOW_ID } from '@/lib/graphql'
import { formatTime } from '@/lib/labels'
import type { PlanPoint, PlanPointHistory, PlanPointStatus, PlanQa } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Check, CheckCheck, History, Loader2, Lock, Pencil, RefreshCw, Sparkles, Target, Trash2, Send, Undo2 } from 'lucide-react'

/**
 * 方案节点（任务式推进 · 验收制）三端共用组件：
 * 状态机：draft(后台草稿) → confirmed(后台审核过，顾问可见可改) → published(进行中，客户可见，同时只能一个)
 *        → finishing(顾问点完成，待客户验收) → done(客户确认=已验收，才能开下一个)
 * - server（服务老师）：AI 拆点、编辑/删除草稿、确认草稿；查看节点修改历史（仅服务端可见）
 * - consultant（顾问）：修改节点（每次留痕）、发布、点完成、查看客户进度
 * - customer（客户）：看当前节点、确认验收
 */
export default function PlanPointsCard({
  projectId,
  mode,
  username,
  analysisId,
  customerId,
  consultantId,
}: {
  projectId: number
  mode: 'server' | 'consultant' | 'customer'
  username: string
  analysisId?: number | null
  customerId?: number | string | null
  consultantId?: number | null
}) {
  const [points, setPoints] = useState<PlanPoint[]>([])
  const [histories, setHistories] = useState<PlanPointHistory[]>([])
  const [qas, setQas] = useState<PlanQa[]>([])
  const [loading, setLoading] = useState(true)
  const [splitting, setSplitting] = useState(false)
  const [acting, setActing] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [historyOpen, setHistoryOpen] = useState<number | null>(null)
  const [stuckOpen, setStuckOpen] = useState(false)
  const [stuckDesc, setStuckDesc] = useState('')
  const [stuckSending, setStuckSending] = useState(false)
  // 节点问答：提问输入 / 顾问回复输入
  const [qaQuestion, setQaQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answerFor, setAnswerFor] = useState<number | null>(null)
  const [answerText, setAnswerText] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await gql<{ plan_point: PlanPoint[] }>(
        `query($pid: bigint!) {
          plan_point(where: { project_id: { _eq: $pid } }, order_by: { seq: asc }) {
            id seq title content status customer_summary published_by published_at finish_requested_at finished_at analysis_id project_id
          }
        }`,
        { pid: projectId },
      )
      setPoints(data.plan_point)
      // 节点问答（客户问 → 顾问答，一来一回）
      const qd = await gql<{ plan_qa: PlanQa[] }>(
        `query($pid: bigint!) {
          plan_qa(where: { project_id: { _eq: $pid } }, order_by: { id: asc }) {
            id question answer status asked_by answered_by answered_at plan_point_id created_at
          }
        }`,
        { pid: projectId },
      )
      setQas(qd.plan_qa)
      // 修改历史仅服务端可读
      if (mode === 'server') {
        const hd = await gql<{ plan_point_history: PlanPointHistory[] }>(
          `query($pid: bigint!) {
            plan_point_history(where: { project_id: { _eq: $pid } }, order_by: { id: desc }) {
              id plan_point_id editor old_title old_content new_title new_content created_at
            }
          }`,
          { pid: projectId },
        )
        setHistories(hd.plan_point_history)
      }
      return data.plan_point
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : '加载失败')
      return null
    } finally {
      if (!silent) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, mode])

  useEffect(() => {
    load()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  /** 当前进行中/待验收的节点（同时只能有一个） */
  const activePoint = points.find((p) => p.status === 'published' || p.status === 'finishing') ?? null

  /** 某节点下的问答 */
  const qasOf = (pointId: number) => qas.filter((q) => q.plan_point_id === pointId)
  /** 该节点是否有待回复的提问（一来一回：未回复不能再问） */
  const hasPendingQa = (pointId: number) => qas.some((q) => q.plan_point_id === pointId && q.status === 'submitted')

  // 有待回复提问时自动刷新（客户等顾问回复）
  const qaBusy = qas.some((q) => q.status === 'submitted')
  useEffect(() => {
    if (!qaBusy || mode !== 'customer') return
    const t = setTimeout(() => load(true), 6000)
    return () => clearTimeout(t)
  }, [qaBusy, qas, load, mode])

  // 客户：在当前节点下提问
  const ask = async (p: PlanPoint) => {
    const q = qaQuestion.trim()
    if (!q) {
      toast.error('请输入你的问题')
      return
    }
    if (hasPendingQa(p.id)) {
      toast.error('上一条问题顾问还没回复，回复后才能继续提问')
      return
    }
    setAsking(true)
    try {
      const ins = await gql<{ insert_plan_qa_one: { id: number } }>(
        `mutation($obj: plan_qa_insert_input!) { insert_plan_qa_one(object: $obj) { id } }`,
        { obj: { project_id: projectId, plan_point_id: p.id, question: q, status: 'submitted', asked_by: username } },
      )
      await logOperation({ projectId, operator: username, action: '节点提问', targetType: 'plan_qa', targetId: ins.insert_plan_qa_one.id, detail: { point: p.title, question: q.slice(0, 100) } })
      setQaQuestion('')
      toast.success('问题已提交给顾问，回复后会显示在这里')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败，请重试')
    } finally {
      setAsking(false)
    }
  }

  // 顾问：回复节点下的提问
  const answer = async (qa: PlanQa) => {
    const v = answerText.trim()
    if (!v) {
      toast.error('请输入回复内容')
      return
    }
    setActing(qa.id)
    try {
      await gql(
        `mutation($id: bigint!, $a: String!, $by: String!, $at: timestamptz!) {
          update_plan_qa_by_pk(pk_columns: { id: $id }, _set: { answer: $a, status: "published", answered_by: $by, answered_at: $at }) { id }
        }`,
        { id: qa.id, a: v, by: username, at: new Date().toISOString() },
      )
      await logOperation({ projectId, operator: username, action: '回复节点提问', targetType: 'plan_qa', targetId: qa.id })
      toast.success('已回复，客户可见')
      setAnswerFor(null)
      setAnswerText('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '回复失败')
    } finally {
      setActing(null)
    }
  }

  /** 客户超 7 天未反馈：节点进行中超过 7 天 */
  const isStale = (p: PlanPoint) =>
    p.status === 'published' &&
    !!p.published_at &&
    Date.now() - new Date(p.published_at).getTime() > 7 * 24 * 3600 * 1000

  // ---------- 服务端：AI 拆点 ----------
  const split = async () => {
    if (!analysisId) return
    setSplitting(true)
    try {
      await createActionFlowTask(PLAN_SPLIT_FLOW_ID, { 报告ID: analysisId })
      await logOperation({ projectId, operator: username, action: '触发 AI 方案拆点', targetType: 'analysis', targetId: analysisId })
      toast.success('AI 拆点已开始，约 1 分钟出结果，页面会自动刷新')
      const before = points.filter((p) => p.analysis_id === analysisId && p.status === 'draft').length
      let waited = 0
      pollRef.current = setInterval(async () => {
        waited += 8
        const rows = await load(true)
        const now = (rows ?? []).filter((p) => p.analysis_id === analysisId && p.status === 'draft').length
        if (now !== before || waited >= 180) {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setSplitting(false)
          if (now !== before) toast.success('拆点完成，请逐条核对后确认')
          else toast.warning('拆点超时，请稍后手动刷新查看')
          load()
        }
      }, 8000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '触发失败')
      setSplitting(false)
    }
  }

  /** 编辑节点内容（老师改草稿 / 顾问改已确认节点），顾问修改写历史留痕 */
  const saveEdit = async (p: PlanPoint) => {
    const t = draftTitle.trim()
    const c = draftContent.trim()
    if (!t || !c) {
      toast.error('标题和内容不能为空')
      return
    }
    setActing(p.id)
    try {
      if (mode === 'consultant' && (t !== (p.title ?? '') || c !== (p.content ?? ''))) {
        await gql(
          `mutation($obj: plan_point_history_insert_input!) { insert_plan_point_history_one(object: $obj) { id } }`,
          {
            obj: {
              project_id: projectId,
              plan_point_id: p.id,
              editor: username,
              old_title: p.title,
              old_content: p.content,
              new_title: t,
              new_content: c,
            },
          },
        )
      }
      await gql(
        `mutation($id: bigint!, $t: String!, $c: String!) {
          update_plan_point_by_pk(pk_columns: { id: $id }, _set: { title: $t, content: $c }) { id }
        }`,
        { id: p.id, t, c },
      )
      await logOperation({ projectId, operator: username, action: mode === 'consultant' ? '顾问修改节点内容' : '编辑节点草稿', targetType: 'plan_point', targetId: p.id, detail: { title: t } })
      toast.success('已保存')
      setEditingId(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setActing(null)
    }
  }

  const removeDraft = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(`mutation($id: bigint!) { delete_plan_point_by_pk(id: $id) { id } }`, { id: p.id })
      await logOperation({ projectId, operator: username, action: '删除节点草稿', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      toast.success('已删除')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setActing(null)
    }
  }

  // 老师：确认草稿（draft → confirmed，此后顾问可见）
  const confirm = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!) { update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "confirmed" }) { id } }`,
        { id: p.id },
      )
      await logOperation({ projectId, operator: username, action: '确认节点（顾问可见）', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  // 顾问：发布节点给客户（confirmed → published；同时只能一个进行中）
  const publish = async (p: PlanPoint) => {
    if (activePoint) {
      toast.error(`第 ${activePoint.seq} 项「${activePoint.title}」还在进行中，验收完成后才能发布新节点`)
      return
    }
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!, $by: String!, $at: timestamptz!) {
          update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "published", published_by: $by, published_at: $at }) { id }
        }`,
        { id: p.id, by: username, at: new Date().toISOString() },
      )
      await logOperation({ projectId, operator: username, action: '发布节点给客户', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      toast.success('已发布，客户现在能看到这个节点了')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败')
    } finally {
      setActing(null)
    }
  }

  // 顾问：完成节点（published → finishing，待客户验收）
  const requestFinish = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!, $at: timestamptz!) {
          update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "finishing", finish_requested_at: $at }) { id }
        }`,
        { id: p.id, at: new Date().toISOString() },
      )
      await logOperation({ projectId, operator: username, action: '标记节点完成（待客户验收）', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      toast.success('已提交完成，等客户确认验收')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  // 顾问：撤销完成申请（finishing → published）
  const undoFinish = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!) { update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "published", finish_requested_at: null }) { id } }`,
        { id: p.id },
      )
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  // 客户：确认验收（finishing → done）
  const accept = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!, $at: timestamptz!) {
          update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "done", finished_at: $at }) { id }
        }`,
        { id: p.id, at: new Date().toISOString() },
      )
      await logOperation({ projectId, operator: username, action: '确认验收节点', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      toast.success('已验收！顾问会为你安排下一个节点')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  // 客户：验收不通过，继续推进（finishing → published）
  const reject = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!) { update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "published", finish_requested_at: null }) { id } }`,
        { id: p.id },
      )
      await logOperation({ projectId, operator: username, action: '验收不通过，继续推进', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      toast.success('已退回继续推进，顾问会看到')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  // 客户：报卡点，自动匹配认领顾问
  const reportStuck = async (p: PlanPoint) => {
    setStuckSending(true)
    try {
      await gql(
        `mutation($obj: blockage_insert_input!) { insert_blockage_one(object: $obj) { id } }`,
        {
          obj: {
            project_id: projectId,
            plan_point_id: p.id,
            description: stuckDesc.trim() || null,
            status: 'open',
            consultant_id: consultantId ?? null,
            customer_id: customerId != null ? Number(customerId) : null,
            customer_name: username,
          },
        },
      )
      await logOperation({
        projectId,
        operator: username,
        action: '报卡点（自动匹配顾问）',
        targetType: 'plan_point',
        targetId: p.id,
        detail: { title: p.title, description: stuckDesc.trim() || null },
      })
      toast.success('已告诉你的顾问，TA 会尽快跟你对接', { duration: 6000 })
      setStuckOpen(false)
      setStuckDesc('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败，请重试')
    } finally {
      setStuckSending(false)
    }
  }

  const statusBadge = (p: PlanPoint) => {
    const map: Record<PlanPointStatus, { label: string; cls: string }> = {
      draft: { label: '草稿待确认', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
      confirmed: { label: mode === 'consultant' ? '待发布' : '已确认待发布', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
      published: { label: '进行中', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
      finishing: { label: mode === 'customer' ? '待你验收' : '待客户验收', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
      done: { label: '已验收', cls: 'bg-green-50 text-green-700 border-green-200' },
    }
    const m = map[p.status]
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${m.cls}`}>{m.label}</span>
        {mode === 'consultant' && isStale(p) && (
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-600">超 7 天未反馈</span>
        )}
      </span>
    )
  }

  /* ---------- 节点问答区块（一来一回） ---------- */
  const qaSection = (p: PlanPoint) => {
    const list = qasOf(p.id)
    if (mode === 'customer') {
      if (p.status !== 'published' && p.status !== 'finishing') return null
      return (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {list.map((q) => (
            <div key={q.id} className="space-y-1 rounded-lg bg-white/70 px-3 py-2">
              <p className="text-xs font-medium text-slate-600">你问：{q.question}</p>
              {q.status === 'published' && q.answer ? (
                <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">顾问回复：{q.answer}</p>
              ) : (
                <p className="flex items-center text-xs text-blue-500">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 顾问回复中…
                </p>
              )}
            </div>
          ))}
          {hasPendingQa(p.id) ? (
            <p className="text-xs text-slate-400">上一条问题顾问还没回复，回复后可以接着问</p>
          ) : (
            <div className="space-y-2">
              <Textarea rows={2} value={qaQuestion} onChange={(e) => setQaQuestion(e.target.value)} placeholder="这个节点有不明白的地方？直接问顾问…" />
              <Button size="sm" variant="outline" disabled={asking} onClick={() => ask(p)}>
                {asking ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                问顾问
              </Button>
            </div>
          )}
        </div>
      )
    }
    // 顾问 / 服务端
    if (list.length === 0) return null
    return (
      <div className="mt-2 space-y-2 rounded-lg bg-slate-50/70 p-3">
        <p className="text-xs font-medium text-slate-500">节点问答（{list.length}）</p>
        {list.map((q) => (
          <div key={q.id} className="space-y-1.5 border-b border-slate-200 pb-2 last:border-0 last:pb-0">
            <p className="text-xs text-slate-600">
              <span className="font-medium">{q.asked_by ?? '客户'}问：</span>{q.question}
              <span className="ml-2 text-slate-400">{formatTime(q.created_at)}</span>
            </p>
            {q.status === 'published' && q.answer ? (
              <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">
                <span className="font-medium">{q.answered_by ?? '顾问'}回复：</span>{q.answer}
              </p>
            ) : mode === 'consultant' ? (
              answerFor === q.id ? (
                <div className="space-y-2 pt-1">
                  <Textarea rows={3} value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="回复客户的问题…" />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 bg-slate-900 hover:bg-slate-800" disabled={acting === q.id} onClick={() => answer(q)}>
                      {acting === q.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />} 回复
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setAnswerFor(null)}>取消</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" className="h-7 bg-amber-500 hover:bg-amber-600" onClick={() => { setAnswerFor(q.id); setAnswerText('') }}>
                  回复（客户等着呢）
                </Button>
              )
            ) : (
              <p className="text-xs text-amber-600">待顾问回复</p>
            )}
          </div>
        ))}
      </div>
    )
  }

  /* ================= 客户视图 ================= */
  if (mode === 'customer') {
    const visible = points.filter((p) => p.status === 'published' || p.status === 'finishing' || p.status === 'done')
    const doneCount = visible.filter((p) => p.status === 'done').length
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" /> 方案推进
            {visible.length > 0 && <span className="text-xs font-normal text-slate-400">已验收 {doneCount} / {visible.length} 项</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">方案拆成一个个节点逐步推进：一次只做当前这一项，做完顾问会标记完成，你确认验收后解锁下一项。</p>
          {loading ? (
            <p className="flex items-center text-sm text-slate-400"><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 加载中…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-400">方案正在准备中，准备好了顾问会逐项发给你。</p>
          ) : (
            <div className="space-y-3">
              {visible.map((p) => {
                const isActive = p.status === 'published'
                const isFinishing = p.status === 'finishing'
                const isDone = p.status === 'done'
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border px-4 py-3 ${
                      isFinishing
                        ? 'border-purple-300 bg-purple-50/50'
                        : isActive
                          ? 'border-blue-300 bg-blue-50/50'
                          : 'border-green-200 bg-green-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-medium text-slate-800">第 {p.seq} 项 · {p.title}</span>
                      {statusBadge(p)}
                    </div>
                    {(isActive || isFinishing) && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{p.content}</p>
                    )}
                    {qaSection(p)}
                    {isFinishing && (
                      <div className="mt-3 space-y-2 border-t border-purple-200 pt-3">
                        <p className="text-xs font-medium text-purple-700">顾问已标记这个节点完成，请你验收：</p>
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={acting === p.id} onClick={() => accept(p)}>
                            {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="mr-1 h-3.5 w-3.5" />}
                            确认完成验收
                          </Button>
                          <Button size="sm" variant="outline" disabled={acting === p.id} onClick={() => reject(p)}>
                            还没完成，继续推进
                          </Button>
                        </div>
                      </div>
                    )}
                    {isActive && (
                      <div className="mt-3 border-t border-blue-200 pt-3">
                        <button
                          type="button"
                          className="text-xs text-slate-400 underline decoration-dotted hover:text-amber-600"
                          onClick={() => setStuckOpen(true)}
                        >
                          卡住了？找顾问帮忙
                        </button>
                      </div>
                    )}
                    {isDone && p.finished_at && (
                      <p className="mt-2 text-xs text-green-600">✓ 已于 {formatTime(p.finished_at)} 验收</p>
                    )}
                    {isDone && p.customer_summary && (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-slate-500">总结：{p.customer_summary}</p>
                    )}
                  </div>
                )
              })}
              {/* 未解锁提示 */}
              {points.some((p) => p.status === 'confirmed') && (
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Lock className="h-3 w-3" /> 后续节点已备好，验收当前项后由顾问发布
                </p>
              )}
            </div>
          )}
        </CardContent>
        <AlertDialog open={stuckOpen} onOpenChange={setStuckOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>告诉顾问你卡在哪了</AlertDialogTitle>
              <AlertDialogDescription>提交后系统会自动对接给你的顾问，TA 会尽快联系你。可以简单写一句卡住的地方（也可不填）。</AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea rows={3} value={stuckDesc} onChange={(e) => setStuckDesc(e.target.value)} placeholder="例如：店长不愿意开早会，说了两次都没推下去…" />
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction className="bg-slate-900 hover:bg-slate-800" disabled={stuckSending || !activePoint} onClick={() => activePoint && reportStuck(activePoint)}>
                {stuckSending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                提交给顾问
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    )
  }

  /* ================= 老师 / 顾问视图 ================= */
  const drafts = points.filter((p) => p.status === 'draft')
  const confirmed = points.filter((p) => p.status === 'confirmed')
  const released = points.filter((p) => p.status === 'published' || p.status === 'finishing' || p.status === 'done')

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" /> 方案节点（任务式推进 · 验收制）
          <span className="text-xs font-normal text-slate-400">
            草稿 {drafts.length} · 待发布 {confirmed.length} · 已到客户 {released.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'server' && (
          <div className="flex items-center gap-3">
            <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={splitting || !analysisId} onClick={split}
              title={analysisId ? '把当前方案拆成客户可逐步执行的节点' : '暂无已发布的方案'}>
              {splitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {splitting ? 'AI 拆点中…' : drafts.length > 0 ? '重新 AI 拆点' : 'AI 拆点'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => load()} title="刷新">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {drafts.length > 0 && <span className="text-xs text-amber-600">草稿需逐条核对后确认，确认后顾问才能看到并发布给客户</span>}
          </div>
        )}
        {mode === 'consultant' && activePoint && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            当前进行中：第 {activePoint.seq} 项「{activePoint.title}」{activePoint.status === 'finishing' ? '（待客户验收）' : ''}——验收完成后才能发布下一项
          </p>
        )}

        {loading ? (
          <p className="flex items-center text-sm text-slate-400"><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 加载中…</p>
        ) : points.length === 0 ? (
          <p className="text-sm text-slate-400">
            {mode === 'server' ? '还没有拆点。点击「AI 拆点」把当前方案拆成节点。' : '节点正在后台确认中，确认后你可以修改并发布给客户。'}
          </p>
        ) : (
          <div className="space-y-3">
            {points
              .filter((p) => mode === 'server' || p.status !== 'draft')
              .map((p) => {
                const editable = (mode === 'server' && p.status === 'draft') || (mode === 'consultant' && (p.status === 'confirmed' || p.status === 'published'))
                const ph = histories.filter((h) => h.plan_point_id === p.id)
                return (
                  <div key={p.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">第 {p.seq} 项 · {p.title}</span>
                      {statusBadge(p)}
                      {p.published_at && <span className="text-xs text-slate-400">发布于 {formatTime(p.published_at)}</span>}
                      {p.finished_at && <span className="text-xs text-slate-400">验收于 {formatTime(p.finished_at)}</span>}
                    </div>

                    {editingId === p.id ? (
                      <div className="mt-2 space-y-2">
                        <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="标题" />
                        <Textarea rows={5} value={draftContent} onChange={(e) => setDraftContent(e.target.value)} placeholder="内容" />
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={acting === p.id} onClick={() => saveEdit(p)}>
                            {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} 保存
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>取消</Button>
                        </div>
                        {mode === 'consultant' && <p className="text-xs text-slate-400">顾问修改会记录修改历史（仅管理端可见）</p>}
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{p.content}</p>
                    )}

                    {/* 操作区 */}
                    {editingId !== p.id && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {editable && (
                          <Button variant="outline" size="sm" className="h-7" onClick={() => { setDraftTitle(p.title ?? ''); setDraftContent(p.content ?? ''); setEditingId(p.id) }}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> 编辑
                          </Button>
                        )}
                        {mode === 'server' && p.status === 'draft' && (
                          <Button size="sm" className="h-7 bg-slate-900 hover:bg-slate-800" disabled={acting === p.id} onClick={() => confirm(p)}>
                            {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} 确认无误
                          </Button>
                        )}
                        {mode === 'consultant' && p.status === 'confirmed' && (
                          <Button size="sm" className="h-7 bg-slate-900 hover:bg-slate-800" disabled={acting === p.id || !!activePoint}
                            title={activePoint ? '有节点进行中，验收后才能发布新的' : undefined} onClick={() => publish(p)}>
                            {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />} 发布给客户
                          </Button>
                        )}
                        {mode === 'consultant' && p.status === 'published' && (
                          <Button size="sm" className="h-7 bg-slate-900 hover:bg-slate-800" disabled={acting === p.id} onClick={() => requestFinish(p)}>
                            {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="mr-1 h-3.5 w-3.5" />} 完成节点（待客户验收）
                          </Button>
                        )}
                        {mode === 'consultant' && p.status === 'finishing' && (
                          <Button variant="outline" size="sm" className="h-7" disabled={acting === p.id} onClick={() => undoFinish(p)}>
                            <Undo2 className="mr-1 h-3.5 w-3.5" /> 撤销完成申请
                          </Button>
                        )}
                        {mode === 'server' && p.status === 'draft' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-red-600" disabled={acting === p.id}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除这个节点？</AlertDialogTitle>
                                <AlertDialogDescription>「{p.title}」删除后不可恢复。</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => removeDraft(p)}>确认删除</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {mode === 'server' && ph.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-7 text-slate-400" onClick={() => setHistoryOpen(historyOpen === p.id ? null : p.id)}>
                            <History className="mr-1 h-3.5 w-3.5" /> 修改历史（{ph.length}）
                          </Button>
                        )}
                      </div>
                    )}

                    {/* 节点问答（一来一回） */}
                    {qaSection(p)}

                    {/* 服务端：修改历史 */}
                    {mode === 'server' && historyOpen === p.id && ph.length > 0 && (
                      <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                        {ph.map((h) => (
                          <div key={h.id} className="border-b border-slate-200 pb-2 text-xs last:border-0">
                            <p className="text-slate-500">{formatTime(h.created_at)} · {h.editor} 修改</p>
                            <p className="mt-1 text-slate-400">原标题：{h.old_title}</p>
                            <p className="text-slate-700">新标题：{h.new_title}</p>
                            {h.old_content !== h.new_content && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-slate-400 underline decoration-dotted">内容变化</summary>
                                <p className="mt-1 whitespace-pre-wrap text-slate-400">旧：{h.old_content}</p>
                                <p className="mt-1 whitespace-pre-wrap text-slate-700">新：{h.new_content}</p>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {p.status === 'done' && p.customer_summary && (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-green-50 px-3 py-2 text-xs leading-5 text-green-700">客户总结：{p.customer_summary}</p>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
