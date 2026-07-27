import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import ReactMarkdown from 'react-markdown'
import MDEditor from '@uiw/react-md-editor'
import { gql, logOperation, ANALYZE_FLOW_ID, PARTIAL_EDIT_FLOW_ID, createActionFlowTask, waitActionFlowResult } from '@/lib/graphql'
import { useAuth, myReviewLevel, pendingStatusForLevel } from '@/lib/auth'
import { nextReviewStage, formatTime } from '@/lib/labels'
import { markProjectViewed } from '@/lib/projectMeta'
import type { Analysis, Submission } from '@/lib/types'
import AnswersView from '@/components/AnswersView'
import { ReviewStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { ArrowLeft, Check, RotateCcw, Loader2, History, Wand2 } from 'lucide-react'

interface AnalysisFull extends Analysis {
  project?: { id: number; name: string; review_level: number | null; status: string } | null
}

interface VersionItem {
  id: number
  version: number
  status: string
}

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { auth } = useAuth()
  const [analysis, setAnalysis] = useState<AnalysisFull | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [editContent, setEditContent] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  // 局部修改
  const [fragment, setFragment] = useState('')
  const [requirement, setRequirement] = useState('')
  const [partialLoading, setPartialLoading] = useState(false)

  const myLevel = myReviewLevel(auth?.account)
  // 超管与一级审核员：任意审核节点都可修改内容、重新梳理、通过、直接发布
  const isPrivileged = auth?.account.account_type === 'super_admin' || auth?.account.reviewer_level === 1

  const load = async () => {
    setLoading(true)
    try {
      const data = await gql<{ analysis_by_pk: AnalysisFull | null }>(
        `query($id: bigint!) {
          analysis_by_pk(id: $id) {
            id version content internal_ref status current_stage project_id created_at
            project { id name review_level status }
          }
        }`,
        { id },
      )
      setAnalysis(data.analysis_by_pk)
      if (data.analysis_by_pk) {
        // 进入审核详情即视为已读，清除项目总览的更新红点
        markProjectViewed(data.analysis_by_pk.project_id, `server:${auth?.account.username ?? ''}`)
        setEditContent(data.analysis_by_pk.content)
        const sub = await gql<{ submission: Submission[]; analysis: VersionItem[] }>(
          `query($pid: bigint!) {
            submission(where: { project_id: { _eq: $pid } }, order_by: { id: desc }) {
              id form_type filler_name filler_contact answers is_supplement project_id created_at
            }
            analysis(where: { project_id: { _eq: $pid } }, order_by: { version: desc }) {
              id version status
            }
          }`,
          { pid: data.analysis_by_pk.project_id },
        )
        setSubmissions(sub.submission)
        setVersions(sub.analysis)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
      </div>
    )
  }
  if (!analysis) {
    return <div className="py-24 text-center text-slate-400">审核任务不存在</div>
  }

  const isPending = ['pending_l3', 'pending_l2', 'pending_l1'].includes(analysis.status)
  const isPendingSetup = analysis.status === 'pending_setup'
  const myTurn = isPrivileged ? isPending : analysis.status === pendingStatusForLevel(myLevel)
  const isFinal = analysis.current_stage === 1

  /** 超管/一级：直接修改报告内容 */
  const saveContent = async () => {
    setActing('save')
    try {
      await gql(
        `mutation($aid: bigint!, $c: String!) {
          update_analysis_by_pk(pk_columns: { id: $aid }, _set: { content: $c }) { id }
        }`,
        { aid: analysis.id, c: editContent },
      )
      await logOperation({
        projectId: analysis.project_id,
        operator: auth!.account.username,
        action: `修改梳理报告内容（v${analysis.version}）`,
        targetType: 'analysis',
        targetId: analysis.id,
      })
      toast.success('报告内容已保存')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setActing(null)
    }
  }

  /** 超管/一级：越过当前节点直接发布 */
  const publishDirect = async () => {
    setActing('publish')
    try {
      // 若内容有改动则一并保存
      await gql(
        `mutation($aid: bigint!, $c: String!, $pid: bigint!, $rec: review_record_insert_input!) {
          update_analysis_by_pk(pk_columns: { id: $aid }, _set: { content: $c, status: "published", current_stage: 1 }) { id }
          update_project_by_pk(pk_columns: { id: $pid }, _set: { status: "published" }) { id }
          insert_review_record_one(object: $rec) { id }
        }`,
        {
          aid: analysis.id,
          c: editContent,
          pid: analysis.project_id,
          rec: {
            project_id: analysis.project_id,
            target_type: 'analysis',
            target_id: String(analysis.id),
            level: 1,
            reviewer: auth!.account.username,
            decision: 'approved',
            comment: comment.trim() || '（越级直接发布）',
          },
        },
      )
      await logOperation({
        projectId: analysis.project_id,
        operator: auth!.account.username,
        action: `终审直接发布（v${analysis.version}）`,
        targetType: 'analysis',
        targetId: analysis.id,
        detail: { comment: comment.trim() || undefined },
      })
      toast.success('已直接发布，客户端可见')
      navigate('/server/review')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  const approve = async () => {
    setActing('approve')
    try {
      const next = nextReviewStage(analysis.current_stage)
      await gql(
        `mutation($aid: bigint!, $st: String!, $stage: bigint!, $pid: bigint!, $pstatus: String!, $rec: review_record_insert_input!) {
          update_analysis_by_pk(pk_columns: { id: $aid }, _set: { status: $st, current_stage: $stage }) { id }
          update_project_by_pk(pk_columns: { id: $pid }, _set: { status: $pstatus }) { id }
          insert_review_record_one(object: $rec) { id }
        }`,
        {
          aid: analysis.id,
          st: next.status,
          stage: next.current_stage,
          pid: analysis.project_id,
          pstatus: next.status === 'published' ? 'published' : 'in_review',
          rec: {
            project_id: analysis.project_id,
            target_type: 'analysis',
            target_id: String(analysis.id),
            level: myLevel,
            reviewer: auth!.account.username,
            decision: 'approved',
            comment: comment.trim() || null,
          },
        },
      )
      await logOperation({
        projectId: analysis.project_id,
        operator: auth!.account.username,
        action: isFinal ? '终审通过，梳理报告已发布' : `${myLevel} 级审核通过，流转下一级`,
        targetType: 'analysis',
        targetId: analysis.id,
        detail: { version: analysis.version, comment: comment.trim() || undefined },
      })
      toast.success(isFinal ? '已通过终审，报告已发布' : '已通过，流转至下一级审核')
      navigate('/server/review')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  const reanalyze = async () => {
    if (!comment.trim()) {
      toast.error('退回时请填写审核意见')
      return
    }
    setActing('reanalyze')
    try {
      // 保留历史版本（标记「已重梳替代」），触发「项目梳理」ActionFlow 生成新版本
      await gql(
        `mutation($aid: bigint!, $pid: bigint!, $rec: review_record_insert_input!, $fid: String!, $args: Json!) {
          update_analysis_by_pk(pk_columns: { id: $aid }, _set: { status: "superseded" }) { id }
          update_project_by_pk(pk_columns: { id: $pid }, _set: { status: "analyzing" }) { id }
          insert_review_record_one(object: $rec) { id }
          fz_create_action_flow_task(actionFlowId: $fid, args: $args)
        }`,
        {
          aid: analysis.id,
          pid: analysis.project_id,
          rec: {
            project_id: analysis.project_id,
            target_type: 'analysis',
            target_id: String(analysis.id),
            level: myLevel,
            reviewer: auth!.account.username,
            decision: 'reanalyze',
            comment: comment.trim(),
          },
          fid: ANALYZE_FLOW_ID,
          args: { 项目ID: analysis.project_id },
        },
      )
      await logOperation({
        projectId: analysis.project_id,
        operator: auth!.account.username,
        action: `触发 AI 重新梳理（v${analysis.version} 已留痕）`,
        targetType: 'analysis',
        targetId: analysis.id,
        detail: { comment: comment.trim() },
      })
      toast.success('已触发 AI 重新梳理，新版本生成后将重新进入审核流程')
      navigate('/server/review')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  /** 设为当前展示版本：本版本置为已发布，其余已发布版本置为已更新 */
  const setCurrent = async () => {
    setActing('setCurrent')
    try {
      await gql(
        `mutation($aid: bigint!, $pid: bigint!) {
          update_analysis_by_pk(pk_columns: { id: $aid }, _set: { status: "published", current_stage: 1 }) { id }
          update_analysis(where: { project_id: { _eq: $pid }, status: { _eq: "published" }, id: { _neq: $aid } }, _set: { status: "superseded" }) { affected_rows }
        }`,
        { aid: analysis.id, pid: analysis.project_id },
      )
      await logOperation({
        projectId: analysis.project_id,
        operator: auth!.account.username,
        action: `切换展示版本为 v${analysis.version}`,
        targetType: 'analysis',
        targetId: analysis.id,
      })
      toast.success(`已切换为 v${analysis.version}，服务端与客户端均展示该版本`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  /** 局部修改：AI 只改写指定片段并生成新版本 */
  const partialEdit = async () => {
    if (!fragment.trim() || !requirement.trim()) {
      toast.error('请贴入原文片段并填写修改要求')
      return
    }
    setPartialLoading(true)
    try {
      const taskId = await createActionFlowTask(PARTIAL_EDIT_FLOW_ID, {
        报告ID: analysis.id,
        片段: fragment.trim(),
        要求: requirement.trim(),
      })
      const output = await waitActionFlowResult(taskId, { timeoutMs: 300000 })
      const newId = Number(output['新版本ID'])
      await logOperation({
        projectId: analysis.project_id,
        operator: auth!.account.username,
        action: `局部修改 v${analysis.version}，生成新版本`,
        targetType: 'analysis',
        targetId: analysis.id,
        detail: { 修改要求: requirement.trim().slice(0, 100) },
      })
      toast.success('局部修改完成，已生成新版本')
      if (newId) navigate(`/server/review/${newId}`)
      else load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '局部修改失败，请重试')
    } finally {
      setPartialLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/server/review')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回
        </Button>
        <h1 className="text-xl font-bold text-slate-900">{analysis.project?.name ?? `项目 #${analysis.project_id}`}</h1>
        {/* 版本切换：随时查看/切换到任意版本 */}
        {versions.length > 1 && (
          <Select value={String(analysis.id)} onValueChange={(v) => navigate(`/server/review/${v}`)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  v{v.version}{v.status === 'published' ? ' · 当前' : v.status === 'superseded' ? ' · 历史' : ' · 在审'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {versions.length <= 1 && <span className="text-sm text-slate-500">v{analysis.version}</span>}
        <ReviewStatusBadge status={analysis.status} />
        {isPrivileged && analysis.status === 'superseded' && (
          <Button size="sm" variant="outline" disabled={acting !== null} onClick={setCurrent}>
            {acting === 'setCurrent' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <History className="mr-1 h-4 w-4" />}
            设为当前版本
          </Button>
        )}
        {!myTurn && <span className="text-sm text-amber-600">（当前不在您的审核节点，仅可查看）</span>}
      </div>

      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis">梳理报告</TabsTrigger>
          <TabsTrigger value="submissions">提交原文（{submissions.length}）</TabsTrigger>
        </TabsList>
        <TabsContent value="analysis" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">梳理内容 · v{analysis.version}</CardTitle>
              <p className="text-xs text-slate-400">梳理时间 {formatTime(analysis.created_at)}</p>
            </CardHeader>
            <CardContent>
              <div className="markdown-body rounded-lg border border-slate-100 bg-slate-50/50 p-5">
                <ReactMarkdown>{analysis.content}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
          {analysis.internal_ref && (
            <Card className="mt-4 border-slate-200 bg-slate-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-normal text-slate-400">指导核心（仅审核人员可见）</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="markdown-body p-1 text-sm text-slate-500">
                  <ReactMarkdown>{analysis.internal_ref}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="submissions" className="space-y-4 pt-4">
          {submissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">该项目暂无提交信息</p>
          ) : (
            submissions.map((s) => <AnswersView key={s.id} submission={s} />)
          )}
        </TabsContent>
      </Tabs>

      {isPendingSetup && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-5 text-sm text-amber-800">
            该项目尚未设置审核等级，暂不能审核。请先到「项目总览 → 审核设置」为项目设置审核等级，设置后本报告会自动进入对应节点。
          </CardContent>
        </Card>
      )}

      {myTurn && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4" /> 局部修改（智能体只改写指定片段，其余内容不动）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {partialLoading ? (
              <PartialEditPanel />
            ) : (
              <>
                <div className="space-y-2">
                  <Label>需要修改的原文片段（从上方报告中复制粘贴，需精确一致）</Label>
                  <Textarea
                    rows={4}
                    value={fragment}
                    onChange={(e) => setFragment(e.target.value)}
                    placeholder="粘贴报告中要修改的那段原文…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>修改要求</Label>
                  <Textarea
                    rows={2}
                    value={requirement}
                    onChange={(e) => setRequirement(e.target.value)}
                    placeholder="如：把方向三改成先做社群老客裂变，不写投放；如：语气再直接一些…"
                  />
                </div>
                <Button
                  variant="outline"
                  className="border-violet-200 text-violet-600 hover:bg-violet-50"
                  onClick={partialEdit}
                >
                  <Wand2 className="mr-1.5 h-4 w-4" /> 智能体局部修改
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {myTurn && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              审核操作（{myLevel} 级{isFinal ? ' · 终审' : ''}{isPrivileged ? ' · 高级权限' : ''}）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPrivileged && (
              <div className="space-y-2">
                <Label>报告内容（可视化编辑：工具栏可加粗/标题/列表，右侧实时预览）</Label>
                <div data-color-mode="light">
                  <MDEditor
                    value={editContent}
                    onChange={(v) => setEditContent(v ?? '')}
                    height={420}
                    preview="live"
                    visibleDragbar={false}
                    textareaProps={{ placeholder: '编辑报告内容…' }}
                  />
                </div>
                <div>
                  <Button variant="outline" disabled={acting !== null} onClick={saveContent}>
                    {acting === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                    保存修改
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>审核意见{isFinal || isPrivileged ? '' : '（退回时必填）'}</Label>
              <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="填写审核意见…" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="bg-green-600 hover:bg-green-700" disabled={acting !== null} onClick={approve}>
                {acting === 'approve' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                {isFinal ? '通过并发布' : '通过，流转下一级'}
              </Button>
              {isPrivileged && !isFinal && (
                <Button className="bg-emerald-700 hover:bg-emerald-800" disabled={acting !== null} onClick={publishDirect}>
                  {acting === 'publish' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                  直接发布（越级）
                </Button>
              )}
              <Button variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50" disabled={acting !== null} onClick={reanalyze}>
                {acting === 'reanalyze' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                退回，重新梳理
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ---------------- 局部修改等待动画 ---------------- */

function PartialEditPanel() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 px-5 py-8">
      <style>{`@keyframes ai-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-violet-100/70 to-transparent"
        style={{ animation: 'ai-shimmer 2.4s ease-in-out infinite' }}
      />
      <div className="relative flex flex-col items-center gap-4">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((n) => (
            <span
              key={n}
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-400"
              style={{ animationDelay: `${n * 0.18}s` }}
            />
          ))}
        </div>
        <p className="text-sm font-medium text-violet-700">智能体正在改写指定片段…</p>
        <p className="max-w-sm text-center text-xs leading-5 text-slate-400">
          仅改写你指定的片段，其余内容保持不变，完成后自动生成新版本
        </p>
      </div>
    </div>
  )
}
