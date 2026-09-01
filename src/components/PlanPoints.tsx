import { useCallback, useEffect, useRef, useState } from 'react'
import { gql, logOperation, createActionFlowTask, PLAN_SPLIT_FLOW_ID } from '@/lib/graphql'
import { formatTime } from '@/lib/labels'
import type { PlanPoint, PlanPointStatus } from '@/lib/types'
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
import { Check, Loader2, Lock, Pencil, RefreshCw, Sparkles, Target, Trash2, Send } from 'lucide-react'

/**
 * 方案小点（任务式推进）三端共用组件：
 * - server（服务老师）：触发 AI 拆点、编辑/删除草稿、确认草稿
 * - consultant（顾问）：把老师确认的小点发布到客户手上、查看客户进度与总结
 * - customer（客户）：一次只看当前主攻点，完成写总结后解锁下一点
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
  /** server 模式：当前方案（已发布报告）ID，用于触发 AI 拆点 */
  analysisId?: number | null
  /** customer 模式：客户账号 id 与认领顾问 id（报卡点用） */
  customerId?: number | string | null
  consultantId?: number | null
}) {
  const [points, setPoints] = useState<PlanPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [splitting, setSplitting] = useState(false)
  const [acting, setActing] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [summary, setSummary] = useState('')
  const [stuckOpen, setStuckOpen] = useState(false)
  const [stuckDesc, setStuckDesc] = useState('')
  const [stuckSending, setStuckSending] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await gql<{ plan_point: PlanPoint[] }>(
        `query($pid: bigint!) {
          plan_point(where: { project_id: { _eq: $pid } }, order_by: { seq: asc }) {
            id seq title content status customer_summary published_by published_at finished_at analysis_id project_id
          }
        }`,
        { pid: projectId },
      )
      setPoints(data.plan_point)
      return data.plan_point
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : '加载失败')
      return null
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // 触发 AI 拆点（异步，约 1 分钟）；触发后轮询直到产出新草稿
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
          if (now !== before) toast.success(`拆点完成，请逐条核对后确认`)
          else toast.warning('拆点超时，请稍后手动刷新查看')
          load()
        }
      }, 8000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '触发失败')
      setSplitting(false)
    }
  }

  // 老师：保存草稿编辑
  const saveDraft = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!, $t: String!, $c: String!) {
          update_plan_point_by_pk(pk_columns: { id: $id }, _set: { title: $t, content: $c }) { id }
        }`,
        { id: p.id, t: draftTitle.trim(), c: draftContent.trim() },
      )
      toast.success('已保存')
      setEditingId(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setActing(null)
    }
  }

  // 老师：删除草稿点
  const removeDraft = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(`mutation($id: bigint!) { delete_plan_point_by_pk(id: $id) { id } }`, { id: p.id })
      await logOperation({ projectId, operator: username, action: '删除方案小点草稿', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      toast.success('已删除')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setActing(null)
    }
  }

  // 老师：确认草稿（draft → confirmed）
  const confirm = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!) { update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "confirmed" }) { id } }`,
        { id: p.id },
      )
      await logOperation({ projectId, operator: username, action: '确认方案小点', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  // 顾问：发布到客户（confirmed → published）
  const publish = async (p: PlanPoint) => {
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!, $by: String!, $at: timestamptz!) {
          update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "published", published_by: $by, published_at: $at }) { id }
        }`,
        { id: p.id, by: username, at: new Date().toISOString() },
      )
      await logOperation({ projectId, operator: username, action: '发布方案小点到客户', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      toast.success('已发布到客户手上')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败')
    } finally {
      setActing(null)
    }
  }

  // 客户：完成当前点并提交总结（published → done）
  const finish = async (p: PlanPoint) => {
    if (!summary.trim()) {
      toast.error('请先写下你的总结：做了什么、结果如何、认识到了什么')
      return
    }
    setActing(p.id)
    try {
      await gql(
        `mutation($id: bigint!, $s: String!, $at: timestamptz!) {
          update_plan_point_by_pk(pk_columns: { id: $id }, _set: { status: "done", customer_summary: $s, finished_at: $at }) { id }
        }`,
        { id: p.id, s: summary.trim(), at: new Date().toISOString() },
      )
      await logOperation({ projectId, operator: username, action: '完成方案小点并提交总结', targetType: 'plan_point', targetId: p.id, detail: { title: p.title } })
      toast.success('已完成！总结已提交，下一个点已解锁')
      setSummary('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败')
    } finally {
      setActing(null)
    }
  }

  // 客户：报卡点，自动匹配认领顾问（无认领顾问时也能提交，由平台兜底分配）
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
        detail: { title: p.title, description: stuckDesc.trim() || null, consultant_id: consultantId ?? null },
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

  const statusBadge = (st: PlanPointStatus) => {
    const map: Record<PlanPointStatus, { label: string; cls: string }> = {
      draft: { label: '草稿待确认', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
      confirmed: { label: mode === 'consultant' ? '待发布' : '已确认待发布', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
      published: { label: '进行中', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
      done: { label: '已完成', cls: 'bg-green-50 text-green-700 border-green-200' },
    }
    const m = map[st]
    return <span className={`rounded-full border px-2 py-0.5 text-xs ${m.cls}`}>{m.label}</span>
  }

  /* ---------- 客户视图：当前主攻点 + 已完成 + 待解锁 ---------- */
  if (mode === 'customer') {
    const visible = points.filter((p) => p.status === 'published' || p.status === 'done')
    const doneCount = visible.filter((p) => p.status === 'done').length
    const active = visible.filter((p) => p.status === 'published').sort((a, b) => a.seq - b.seq)[0] ?? null
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" /> 方案推进
            {visible.length > 0 && (
              <span className="text-xs font-normal text-slate-400">已完成 {doneCount} / {visible.length} 项</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">方案会拆成一个个小点逐步给你：一次只盯当前这一项，做完写个总结，再解锁下一项。</p>
          {loading ? (
            <p className="flex items-center text-sm text-slate-400"><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 加载中…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-400">方案正在准备中，准备好了会逐项推给你。</p>
          ) : (
            <div className="space-y-3">
              {visible.map((p) => {
                const isActive = active && p.id === active.id
                const isDone = p.status === 'done'
                const isLocked = !isActive && !isDone
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border px-4 py-3 ${
                      isActive ? 'border-blue-300 bg-blue-50/50' : isDone ? 'border-green-200 bg-green-50/40' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isLocked && <Lock className="h-3.5 w-3.5 text-slate-300" />}
                      <span className={`flex-1 text-sm font-medium ${isLocked ? 'text-slate-400' : 'text-slate-800'}`}>
                        第 {p.seq} 项 · {p.title}
                      </span>
                      {isDone && <span className="text-xs text-green-600">✓ 已完成</span>}
                      {isActive && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">当前主攻</span>}
                    </div>
                    {isActive && (
                      <div className="mt-3 space-y-3">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{p.content}</p>
                        <div className="space-y-2 border-t border-blue-200 pt-3">
                          <p className="text-xs font-medium text-slate-500">做完了？写下你的总结（做了什么、结果如何、认识到了什么）：</p>
                          <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="一点成绩一点总结，总结的过程就是你自己的成长…" />
                          <div className="flex flex-wrap items-center gap-3">
                            <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={acting === p.id} onClick={() => finish(p)}>
                              {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                              完成并提交总结
                            </Button>
                            <button
                              type="button"
                              className="text-xs text-slate-400 underline decoration-dotted hover:text-amber-600"
                              onClick={() => setStuckOpen(true)}
                            >
                              卡住了？找顾问帮忙
                            </button>
                          </div>
                          <AlertDialog open={stuckOpen} onOpenChange={setStuckOpen}>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>告诉顾问你卡在哪了</AlertDialogTitle>
                                <AlertDialogDescription>
                                  提交后系统会自动对接给你的认领顾问，TA 会尽快联系你。可以简单写一句卡住的地方（也可不填）。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <Textarea
                                rows={3}
                                value={stuckDesc}
                                onChange={(e) => setStuckDesc(e.target.value)}
                                placeholder="例如：店长不愿意开早会，说了两次都没推下去…"
                              />
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction className="bg-slate-900 hover:bg-slate-800" disabled={stuckSending} onClick={() => reportStuck(p)}>
                                  {stuckSending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                  提交给顾问
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    )}
                    {isDone && p.customer_summary && (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-slate-500">
                        我的总结：{p.customer_summary}
                      </p>
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

  /* ---------- 老师 / 顾问视图 ---------- */
  const drafts = points.filter((p) => p.status === 'draft')
  const confirmed = points.filter((p) => p.status === 'confirmed')
  const released = points.filter((p) => p.status === 'published' || p.status === 'done')

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" /> 方案小点（任务式推进）
          <span className="text-xs font-normal text-slate-400">
            草稿 {drafts.length} · 待发布 {confirmed.length} · 已到客户 {released.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'server' && (
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="bg-slate-900 hover:bg-slate-800"
              disabled={splitting || !analysisId}
              onClick={split}
              title={analysisId ? '把当前方案拆成客户可逐步执行的小点' : '暂无已发布的方案'}
            >
              {splitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {splitting ? 'AI 拆点中…' : drafts.length > 0 ? '重新 AI 拆点' : 'AI 拆点'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => load()} title="刷新">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {drafts.length > 0 && <span className="text-xs text-amber-600">草稿需逐条核对（错别字、可执行性）后确认，确认后顾问才能发布给客户</span>}
          </div>
        )}

        {loading ? (
          <p className="flex items-center text-sm text-slate-400"><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 加载中…</p>
        ) : points.length === 0 ? (
          <p className="text-sm text-slate-400">
            {mode === 'server' ? '还没有拆点。点击「AI 拆点」把当前方案拆成小点。' : '方案正在拆点确认中，确认后你可以发布给客户。'}
          </p>
        ) : (
          <div className="space-y-3">
            {points.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    第 {p.seq} 项 · {p.title}
                  </span>
                  {statusBadge(p.status)}
                  {p.finished_at && <span className="text-xs text-slate-400">完成于 {formatTime(p.finished_at)}</span>}
                </div>

                {/* 老师：草稿可编辑 */}
                {mode === 'server' && p.status === 'draft' && (
                  editingId === p.id ? (
                    <div className="mt-2 space-y-2">
                      <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="标题" />
                      <Textarea rows={5} value={draftContent} onChange={(e) => setDraftContent(e.target.value)} placeholder="内容" />
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={acting === p.id} onClick={() => saveDraft(p)}>
                          {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} 保存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>取消</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{p.content}</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7" onClick={() => { setDraftTitle(p.title ?? ''); setDraftContent(p.content ?? ''); setEditingId(p.id) }}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> 编辑
                        </Button>
                        <Button size="sm" className="h-7 bg-slate-900 hover:bg-slate-800" disabled={acting === p.id} onClick={() => confirm(p)}>
                          {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} 确认无误
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-red-600" disabled={acting === p.id}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除这个小点？</AlertDialogTitle>
                              <AlertDialogDescription>「{p.title}」删除后不可恢复。</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => removeDraft(p)}>确认删除</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )
                )}

                {/* 顾问：已确认的可发布 */}
                {mode === 'consultant' && (
                  <div className="mt-2 space-y-2">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{p.content}</p>
                    {p.status === 'confirmed' && (
                      <Button size="sm" className="h-7 bg-slate-900 hover:bg-slate-800" disabled={acting === p.id} onClick={() => publish(p)}>
                        {acting === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />} 审核通过，发布到客户
                      </Button>
                    )}
                    {p.status === 'done' && p.customer_summary && (
                      <p className="whitespace-pre-wrap rounded-lg bg-green-50 px-3 py-2 text-xs leading-5 text-green-700">
                        客户总结：{p.customer_summary}
                      </p>
                    )}
                  </div>
                )}

                {/* 老师：非草稿只读 + 客户总结 */}
                {mode === 'server' && p.status !== 'draft' && (
                  <div className="mt-2 space-y-2">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{p.content}</p>
                    {p.status === 'done' && p.customer_summary && (
                      <p className="whitespace-pre-wrap rounded-lg bg-green-50 px-3 py-2 text-xs leading-5 text-green-700">
                        客户总结：{p.customer_summary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
