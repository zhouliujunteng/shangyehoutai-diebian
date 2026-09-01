import { useCallback, useEffect, useRef, useState } from 'react'
import { gql, logOperation, createActionFlowTask, QA_DRAFT_FLOW_ID } from '@/lib/graphql'
import { formatTime } from '@/lib/labels'
import type { PlanQa } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Check, Loader2, MessageCircleQuestion, RefreshCw, Send, Trash2 } from 'lucide-react'

/**
 * 方案问答三端共用组件：
 * - customer（客户）：就方案/执行提问，AI 起草、老师审核后在此看到回答
 * - consultant（顾问）：只读查看问答记录
 * - server（服务老师）：审核 AI 草稿（可修改错别字/措辞）后发出；失败可重新起草；可删除
 */
export default function PlanQaCard({
  projectId,
  mode,
  username,
}: {
  projectId: number
  mode: 'server' | 'consultant' | 'customer'
  username: string
}) {
  const [items, setItems] = useState<PlanQa[]>([])
  const [loading, setLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [acting, setActing] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      // 客户/顾问只读已发出+处理中状态；服务端可见草稿与错误信息
      const fields =
        mode === 'server'
          ? 'id question draft answer status asked_by answered_by error_message answered_at created_at'
          : 'id question answer status asked_by answered_at created_at'
      const data = await gql<{ plan_qa: PlanQa[] }>(
        `query($pid: bigint!) {
          plan_qa(where: { project_id: { _eq: $pid } }, order_by: { id: desc }) { ${fields} }
        }`,
        { pid: projectId },
      )
      setItems(data.plan_qa)
      return data.plan_qa
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

  // 有起草中/待起草的记录时自动轮询
  const busy = items.some((r) => r.status === 'submitted' || r.status === 'drafting')
  useEffect(() => {
    if (!busy) return
    const t = setTimeout(() => load(true), 6000)
    return () => clearTimeout(t)
  }, [busy, items, load])

  // 客户提问：落库 + 触发 AI 起草（老师审核后发出）
  const ask = async () => {
    const q = question.trim()
    if (!q) {
      toast.error('请输入你的问题')
      return
    }
    setAsking(true)
    try {
      const ins = await gql<{ insert_plan_qa_one: { id: number } }>(
        `mutation($obj: plan_qa_insert_input!) { insert_plan_qa_one(object: $obj) { id } }`,
        { obj: { project_id: projectId, question: q, status: 'submitted', asked_by: username } },
      )
      const qid = ins.insert_plan_qa_one.id
      await createActionFlowTask(QA_DRAFT_FLOW_ID, { 问答ID: qid })
      await logOperation({ projectId, operator: username, action: '提交方案问答', targetType: 'plan_qa', targetId: qid, detail: { question: q.slice(0, 100) } })
      setQuestion('')
      toast.success('问题已提交，回答审核通过后会展示在这里', { duration: 6000 })
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败，请重试')
    } finally {
      setAsking(false)
    }
  }

  // 老师：审核发出（answer = 审定稿）
  const publish = async (r: PlanQa, text: string) => {
    const v = text.trim()
    if (!v) {
      toast.error('回答内容不能为空')
      return
    }
    setActing(r.id)
    try {
      await gql(
        `mutation($id: bigint!, $a: String!, $by: String!, $at: timestamptz!) {
          update_plan_qa_by_pk(pk_columns: { id: $id }, _set: { answer: $a, status: "published", answered_by: $by, answered_at: $at }) { id }
        }`,
        { id: r.id, a: v, by: username, at: new Date().toISOString() },
      )
      await logOperation({ projectId, operator: username, action: '审核发出问答回答', targetType: 'plan_qa', targetId: r.id })
      toast.success('已发出，客户可见')
      setEditId(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发出失败')
    } finally {
      setActing(null)
    }
  }

  // 老师：起草失败重新触发
  const redraft = async (r: PlanQa) => {
    setActing(r.id)
    try {
      await createActionFlowTask(QA_DRAFT_FLOW_ID, { 问答ID: r.id })
      toast.success('已重新起草，请稍候')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '触发失败')
    } finally {
      setActing(null)
    }
  }

  // 老师：删除问答
  const remove = async (r: PlanQa) => {
    setActing(r.id)
    try {
      await gql(`mutation($id: bigint!) { delete_plan_qa_by_pk(id: $id) { id } }`, { id: r.id })
      await logOperation({ projectId, operator: username, action: '删除方案问答', targetType: 'plan_qa', targetId: r.id })
      toast.success('已删除')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setActing(null)
    }
  }

  const qaStatusBadge = (st: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      submitted: { label: mode === 'customer' ? '整理中' : '待起草', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
      drafting: { label: mode === 'customer' ? '整理中' : '起草中', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
      pending: { label: mode === 'customer' ? '整理中' : '待审核发出', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
      published: { label: '已发出', cls: 'bg-green-50 text-green-700 border-green-200' },
      failed: { label: '起草失败', cls: 'bg-red-50 text-red-600 border-red-200' },
    }
    const m = map[st] ?? { label: st, cls: 'bg-slate-100 text-slate-600 border-slate-200' }
    return <span className={`rounded-full border px-2 py-0.5 text-xs ${m.cls}`}>{m.label}</span>
  }

  // 客户只见已发出的回答；其余状态显示"整理中"
  const visibleItems = mode === 'server' ? items : items.filter((r) => r.status !== 'failed')

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircleQuestion className="h-4 w-4" /> 方案问答
          {mode === 'server' && items.filter((r) => r.status === 'pending').length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              {items.filter((r) => r.status === 'pending').length} 条待审核
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'customer' && (
          <>
            <p className="text-sm text-slate-500">对方案或正在做的事有不明白的地方，直接问；回答会经过老师核对后展示给你。</p>
            <div className="space-y-2">
              <Textarea
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="例如：当前这一步具体先从哪里下手？…"
              />
              <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={asking} onClick={ask}>
                {asking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                提问
              </Button>
            </div>
          </>
        )}
        {mode !== 'customer' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {mode === 'server' ? '客户的问题和 AI 起草的回答在此审核，核对修改后再发出给客户。' : '客户的问答记录（只读）。'}
            </p>
            <Button variant="ghost" size="sm" onClick={() => load()} title="刷新">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}

        {loading ? (
          <p className="flex items-center text-sm text-slate-400"><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 加载中…</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-sm text-slate-400">{mode === 'customer' ? '还没有提问记录。' : '暂无问答。'}</p>
        ) : (
          <div className="space-y-3">
            {visibleItems.map((r) => (
              <div key={r.id} className="space-y-2 rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{r.question}</span>
                  {qaStatusBadge(r.status)}
                  <span className="text-xs text-slate-400">{formatTime(r.created_at)}</span>
                  {mode === 'server' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-red-600" disabled={acting === r.id}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除这条问答？</AlertDialogTitle>
                          <AlertDialogDescription>删除后客户那边也会消失，不可恢复。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => remove(r)}>确认删除</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>

                {/* 已发出：所有人可见回答 */}
                {r.status === 'published' && r.answer && (
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">{r.answer}</p>
                )}

                {/* 客户：处理中的提示 */}
                {mode === 'customer' && r.status !== 'published' && (
                  <p className="flex items-center text-xs text-blue-500">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 回答整理核对中，好了会展示在这里
                  </p>
                )}

                {/* 老师：待审核的草稿（可改） */}
                {mode === 'server' && r.status === 'pending' && (
                  editId === r.id ? (
                    <div className="space-y-2">
                      <Textarea rows={6} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={acting === r.id} onClick={() => publish(r, editDraft)}>
                          {acting === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} 审核发出
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>取消</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{r.draft}</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7" onClick={() => { setEditDraft(r.draft ?? ''); setEditId(r.id) }}>
                          核对 / 修改
                        </Button>
                        <Button size="sm" className="h-7 bg-slate-900 hover:bg-slate-800" disabled={acting === r.id} onClick={() => publish(r, r.draft ?? '')}>
                          {acting === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} 直接发出
                        </Button>
                      </div>
                    </div>
                  )
                )}

                {/* 老师：起草失败 */}
                {mode === 'server' && r.status === 'failed' && (
                  <div className="flex items-center gap-3">
                    <p className="flex-1 text-xs text-red-500">{r.error_message ?? '起草失败'}</p>
                    <Button variant="outline" size="sm" className="h-7" disabled={acting === r.id} onClick={() => redraft(r)}>
                      {acting === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} 重新起草
                    </Button>
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
