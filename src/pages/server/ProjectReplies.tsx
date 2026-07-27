import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import ReactMarkdown from 'react-markdown'
import { gql, logOperation, createActionFlowTask, waitActionFlowResult, REPLY_DRAFT_FLOW_ID } from '@/lib/graphql'
import { AttachmentPicker, AttachmentView, type AttachmentItem } from '@/lib/attachments'
import { useAuth, myReviewLevel, pendingStatusForLevel } from '@/lib/auth'
import { nextReviewStage, initialReviewStage, formatTime } from '@/lib/labels'
import { markProjectViewed } from '@/lib/projectMeta'
import { projectDisplayName, type Analysis, type Project, type Question, type Submission } from '@/lib/types'
import { QuestionStatusBadge, ReviewStatusBadge, ProjectStatusBadge } from '@/components/StatusBadge'
import CopyTextButton from '@/components/CopyTextButton'
import AnswersView from '@/components/AnswersView'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'sonner'
import { ArrowLeft, Check, Loader2, Save, Send, Sparkles, RefreshCw } from 'lucide-react'

interface ProjectFull extends Project {
  owner?: { username: string } | null
  submissions: Submission[]
  analyses: Analysis[]
  questions: Question[]
}

export default function ProjectReplies() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { auth } = useAuth()
  const [project, setProject] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [contents, setContents] = useState<Record<number, string>>({})
  const [comments, setComments] = useState<Record<number, string>>({})
  const [filesMap, setFilesMap] = useState<Record<number, AttachmentItem[]>>({})
  const [acting, setActing] = useState<string | null>(null)
  // AI 智能体起草：按提问记录生成中的状态
  const [aiDrafting, setAiDrafting] = useState<Record<number, boolean>>({})

  // 调用「生成回复草稿」行为流：综合企业基本信息、梳理方案、历史问答与提问附件起草回复
  const generateDraft = async (q: Question) => {
    setAiDrafting((p) => ({ ...p, [q.id]: true }))
    try {
      const taskId = await createActionFlowTask(REPLY_DRAFT_FLOW_ID, { 提问ID: q.id })
      const output = await waitActionFlowResult(taskId)
      const text = typeof output['回复文本'] === 'string' ? (output['回复文本'] as string) : ''
      if (!text.trim()) throw new Error('智能体未返回内容，请重试')
      setContents((p) => ({ ...p, [q.id]: text.trim() }))
      toast.success('AI 草稿已生成，请审核修改后再提交')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 起草失败，请重试')
    } finally {
      setAiDrafting((p) => ({ ...p, [q.id]: false }))
    }
  }

  const myLevel = myReviewLevel(auth?.account)
  const myName = auth?.account.username ?? ''
  // 超管与一级审核员：任意审核节点都可处理回复
  const isPrivileged = auth?.account.account_type === 'super_admin' || auth?.account.reviewer_level === 1

  const load = async () => {
    setLoading(true)
    try {
      const data = await gql<{ project_by_pk: ProjectFull | null }>(
        `query($id: bigint!) {
          project_by_pk(id: $id) {
            id name remark status review_level current_analysis_id created_at
            owner { username }
            submissions(order_by: { id: desc }) { id form_type filler_name filler_contact answers is_supplement project_id created_at }
            analyses(order_by: { id: desc }) { id version content internal_ref status current_stage project_id created_at }
            questions(order_by: { id: desc }) {
              id content status attachments project_id created_at
              replies(order_by: { id: desc }, limit: 1) { id content status attachments current_stage question_id created_at }
            }
          }
        }`,
        { id: projectId },
      )
      setProject(data.project_by_pk)
      // 进入项目回复页即视为已读，清除项目总览的更新红点
      if (data.project_by_pk) markProjectViewed(data.project_by_pk.id, `server:${myName}`)
      // 初始化各问题的回复编辑内容
      const init: Record<number, string> = {}
      const initFiles: Record<number, AttachmentItem[]> = {}
      for (const q of data.project_by_pk?.questions ?? []) {
        const r = q.replies?.[0]
        init[q.id] = r && r.status !== 'published' ? r.content : ''
        initFiles[q.id] = (r && r.status !== 'published' ? (r.attachments as AttachmentItem[] | null) : null) ?? []
      }
      setContents(init)
      setFilesMap(initFiles)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // 服务端展示以「当前版本」指针为准；无指针回退到最新已发布/最新版本
  const latestAnalysis = useMemo(() => {
    const list = project?.analyses ?? []
    const curId = project?.current_analysis_id ?? null
    if (curId) {
      const cur = list.find((a) => a.id === curId)
      if (cur) return cur
    }
    return list.find((a) => a.status === 'published') ?? list[0] ?? null
  }, [project])

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
      </div>
    )
  }
  if (!project) {
    return <div className="py-24 text-center text-slate-400">项目不存在</div>
  }

  const reviewLevel = project.review_level ?? 3

  /** 起草回复并进入审核链 */
  const createReply = async (q: Question) => {
    const content = (contents[q.id] ?? '').trim()
    if (!content) {
      toast.error('请输入回复内容')
      return
    }
    setActing(`create-${q.id}`)
    try {
      const init = initialReviewStage(reviewLevel)
      await gql(
        `mutation($obj: reply_insert_input!, $qid: bigint!) {
          insert_reply_one(object: $obj) { id }
          update_question_by_pk(pk_columns: { id: $qid }, _set: { status: "in_review" }) { id }
        }`,
        {
          obj: {
            question_id: q.id,
            content,
            status: init.status,
            current_stage: init.current_stage,
            attachments: (filesMap[q.id] ?? []).length > 0 ? filesMap[q.id] : null,
          },
          qid: q.id,
        },
      )
      await logOperation({
        projectId: project.id,
        operator: myName,
        action: '起草回复并提交审核',
        targetType: 'question',
        targetId: q.id,
      })
      toast.success('回复已提交，进入审核流程')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败')
    } finally {
      setActing(null)
    }
  }

  /** 仅保存当前级补充内容 */
  const saveOnly = async (q: Question, replyId: number) => {
    setActing(`save-${q.id}`)
    try {
      await gql(
        `mutation($rid: bigint!, $c: String!, $att: jsonb) {
          update_reply_by_pk(pk_columns: { id: $rid }, _set: { content: $c, attachments: $att }) { id }
        }`,
        { rid: replyId, c: (contents[q.id] ?? '').trim(), att: (filesMap[q.id] ?? []).length > 0 ? filesMap[q.id] : null },
      )
      toast.success('已保存')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setActing(null)
    }
  }

  /** 当前级审核通过：保存补充内容并流转 */
  const approve = async (q: Question, replyId: number, currentStage: number) => {
    setActing(`approve-${q.id}`)
    try {
      const next = nextReviewStage(currentStage)
      const done = next.status === 'published'
      await gql(
        `mutation($rid: bigint!, $c: String!, $st: String!, $stage: bigint!, $qid: bigint!, $qstatus: String!, $rec: review_record_insert_input!, $att: jsonb) {
          update_reply_by_pk(pk_columns: { id: $rid }, _set: { content: $c, status: $st, current_stage: $stage, attachments: $att }) { id }
          update_question_by_pk(pk_columns: { id: $qid }, _set: { status: $qstatus }) { id }
          insert_review_record_one(object: $rec) { id }
        }`,
        {
          rid: replyId,
          c: (contents[q.id] ?? '').trim(),
          st: next.status,
          stage: next.current_stage,
          qid: q.id,
          qstatus: done ? 'replied' : 'in_review',
          rec: {
            project_id: project.id,
            target_type: 'reply',
            target_id: String(replyId),
            level: myLevel,
            reviewer: myName,
            decision: 'approved',
            comment: (comments[q.id] ?? '').trim() || null,
          },
          att: (filesMap[q.id] ?? []).length > 0 ? filesMap[q.id] : null,
        },
      )
      await logOperation({
        projectId: project.id,
        operator: myName,
        action: done ? '回复终审通过，已发送客户' : `回复 ${myLevel} 级审核通过，流转下一级`,
        targetType: 'reply',
        targetId: replyId,
      })
      toast.success(done ? '回复已通过终审并发送给客户' : '已通过，流转至下一级')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/server/replies')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回
        </Button>
        <Button variant="ghost" size="sm" onClick={load} title="刷新">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <h1 className="text-xl font-bold text-slate-900">{projectDisplayName(project)}</h1>
        <ProjectStatusBadge status={project.status} />
      </div>

      {/* 项目基本信息 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">项目基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>所属客户：{project.owner?.username ?? '—'}</span>
            <span>审核等级：{reviewLevel} 级</span>
            <span>创建时间：{formatTime(project.created_at)}</span>
            {project.remark && <span>客户备注：{project.remark}</span>}
          </div>
          <Accordion type="single" collapsible>
            <AccordionItem value="subs" className="border-0">
              <AccordionTrigger className="py-2 text-sm text-slate-700">
                收集表提交原文（{project.submissions.length}）
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {project.submissions.length === 0 ? (
                    <p className="text-sm text-slate-400">暂无提交</p>
                  ) : (
                    project.submissions.map((s) => <AnswersView key={s.id} submission={s} />)
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* 项目梳理报告 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            项目梳理
            {latestAnalysis && (
              <span className="text-sm font-normal text-slate-500">
                v{latestAnalysis.version} · <ReviewStatusBadge status={latestAnalysis.status} />
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!latestAnalysis ? (
            <p className="py-4 text-center text-sm text-slate-400">尚未生成梳理报告</p>
          ) : (
            <>
              <div className="markdown-body max-h-96 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-5">
                <ReactMarkdown>{latestAnalysis.content}</ReactMarkdown>
              </div>
              {latestAnalysis.internal_ref && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <p className="mb-2 text-xs font-normal text-slate-400">指导核心（仅审核人员可见）</p>
                  <div className="markdown-body text-sm text-slate-500">
                    <ReactMarkdown>{latestAnalysis.internal_ref}</ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 提问与回复 */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">提问与回复（{project.questions.length}）</h2>
        {project.questions.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-400">
            该项目暂无提问
          </p>
        )}
        {[...project.questions].reverse().map((q, idx) => {
          const reply = q.replies?.[0] ?? null
          const isPendingReply = q.status !== 'replied' && (!reply || ['pending_l3', 'pending_l2', 'pending_l1'].includes(reply.status))
          const myTurn = isPrivileged
            ? isPendingReply
            : q.status !== 'replied' && (!reply || reply.status === pendingStatusForLevel(myLevel))
          const isFinal = reply?.current_stage === 1
          return (
            <Card key={q.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  提问 {idx + 1}
                  <QuestionStatusBadge status={q.status} />
                  {reply && <ReviewStatusBadge status={reply.status} />}
                  <span className="ml-auto text-xs font-normal text-slate-400">{formatTime(q.created_at)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-800">{q.content}</p>
                <AttachmentView items={q.attachments} />

                {q.status === 'replied' && reply ? (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-500">老师回复（已发送）</p>
                      <CopyTextButton text={reply.content} />
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{reply.content}</p>
                    <AttachmentView items={reply.attachments} />
                  </div>
                ) : !reply ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-sm">起草回复（提交后按 {reviewLevel} 级审核链流转，每级可补充）</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-violet-200 text-violet-600 hover:bg-violet-50"
                        disabled={acting !== null || !!aiDrafting[q.id]}
                        onClick={() => generateDraft(q)}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" /> 智能体起草
                      </Button>
                    </div>
                    {aiDrafting[q.id] ? (
                      <AiDraftingPanel />
                    ) : (
                      <Textarea
                        rows={4}
                        value={contents[q.id] ?? ''}
                        onChange={(e) => setContents((p) => ({ ...p, [q.id]: e.target.value }))}
                        placeholder="输入回复内容…"
                      />
                    )}
                    <AttachmentPicker
                      value={filesMap[q.id] ?? []}
                      onChange={(v) => setFilesMap((p) => ({ ...p, [q.id]: v }))}
                      disabled={acting !== null}
                    />
                    <Button
                      className="bg-slate-900 hover:bg-slate-800"
                      disabled={acting !== null}
                      onClick={() => createReply(q)}
                    >
                      {acting === `create-${q.id}` ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-1.5 h-4 w-4" />
                      )}
                      提交回复进入审核
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-sm">
                        回复内容（当前 {reply.current_stage} 级节点{myTurn ? ' · 待我处理，可补充修改' : ' · 非我的节点，只读'}）
                      </Label>
                      {myTurn && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-violet-200 text-violet-600 hover:bg-violet-50"
                          disabled={acting !== null || !!aiDrafting[q.id]}
                          onClick={() => generateDraft(q)}
                          title="用 AI 重新起草，将覆盖当前回复内容"
                        >
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> 智能体重写
                        </Button>
                      )}
                    </div>
                    {aiDrafting[q.id] ? (
                      <AiDraftingPanel />
                    ) : (
                      <Textarea
                        rows={5}
                        value={contents[q.id] ?? ''}
                        onChange={(e) => setContents((p) => ({ ...p, [q.id]: e.target.value }))}
                        disabled={!myTurn}
                      />
                    )}
                    {myTurn ? (
                      <AttachmentPicker
                        value={filesMap[q.id] ?? []}
                        onChange={(v) => setFilesMap((p) => ({ ...p, [q.id]: v }))}
                        disabled={acting !== null}
                      />
                    ) : (
                      <AttachmentView items={reply.attachments} />
                    )}
                    {myTurn && (
                      <>
                        <Textarea
                          rows={2}
                          value={comments[q.id] ?? ''}
                          onChange={(e) => setComments((p) => ({ ...p, [q.id]: e.target.value }))}
                          placeholder="本级审核备注（可选）…"
                        />
                        <div className="flex flex-wrap gap-3">
                          <Button variant="outline" disabled={acting !== null} onClick={() => saveOnly(q, reply.id)}>
                            {acting === `save-${q.id}` ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="mr-1.5 h-4 w-4" />
                            )}
                            仅保存
                          </Button>
                          <Button
                            className="bg-green-600 hover:bg-green-700"
                            disabled={acting !== null}
                            onClick={() => approve(q, reply.id, reply.current_stage)}
                          >
                            {acting === `approve-${q.id}` ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-1.5 h-4 w-4" />
                            )}
                            {isFinal ? '终审通过并发送' : '通过，流转下一级'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- AI 智能体起草等待动画 ---------------- */

const AI_PHASES = ['正在阅读企业基本信息…', '正在回顾梳理方案…', '正在翻阅历史问答…', '正在起草回复…']

function AiDraftingPanel() {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPhase((n) => (n + 1) % AI_PHASES.length), 2800)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="relative overflow-hidden rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 px-5 py-10">
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
        <p className="text-sm font-medium text-violet-700">{AI_PHASES[phase]}</p>
        <p className="max-w-sm text-center text-xs leading-5 text-slate-400">
          AI 正在综合「企业基本信息 + 梳理方案 + 历史问答」起草回复，通常需要 20-60 秒，请勿关闭页面
        </p>
      </div>
    </div>
  )
}
