import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import ReactMarkdown from 'react-markdown'
import { gql, logOperation, createActionFlowTask, waitActionFlowResult, FEEDBACK_REPLY_FLOW_ID } from '@/lib/graphql'
import { useAuth, myReviewLevel, pendingStatusForLevel } from '@/lib/auth'
import { nextReviewStage, initialReviewStage, formatTime, FEEDBACK_OPTION_LABEL, AUDIO_STATUS_LABEL } from '@/lib/labels'
import { markProjectViewed } from '@/lib/projectMeta'
import { projectDisplayName, type Analysis, type AudioRecord, type FeedbackLink, type FeedbackOption, type FeedbackReply, type FeedbackSubmission, type Project, type Submission } from '@/lib/types'
import { ReviewStatusBadge, ProjectStatusBadge, FeedbackSubmissionStatusBadge, FeedbackLinkStatusBadge } from '@/components/StatusBadge'
import CopyTextButton from '@/components/CopyTextButton'
import AnswersView from '@/components/AnswersView'
import TranscriptView from '@/components/TranscriptView'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'sonner'
import { ArrowLeft, Check, Loader2, Save, Send, Sparkles, RefreshCw, Mic } from 'lucide-react'

interface ProjectFull extends Project {
  owner?: { username: string } | null
  submissions: Submission[]
  analyses: Analysis[]
  feedback_links: (FeedbackLink & { feedback_submissions: FeedbackSubmission[] })[]
  audio_records: AudioRecord[]
}

export default function ProjectReplies() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { auth } = useAuth()
  const [project, setProject] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  // 回复编辑内容 / 审核备注 / AI 起草中状态（按反馈提交 ID）
  const [fbContents, setFbContents] = useState<Record<number, string>>({})
  const [fbComments, setFbComments] = useState<Record<number, string>>({})
  const [fbDrafting, setFbDrafting] = useState<Record<number, boolean>>({})
  const [acting, setActing] = useState<string | null>(null)

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
            audio_records(order_by: { id: desc }) { id file_name audio_url audio_file { url name sizeBytes } transcript recognized_text raw_response status error_message processing_seconds created_at }
            feedback_links(order_by: { id: desc }) {
              id token options status expires_at project_id created_at
              feedback_submissions(order_by: { id: desc }) {
                id form_supplement info_supplement execution_issues detail_request result_feedback
                filler_name filler_contact status link_id created_at
                feedback_replies(order_by: { id: desc }) { id version content status current_stage internal_ref feedback_submission_id project_id created_at }
              }
            }
          }
        }`,
        { id: projectId },
      )
      setProject(data.project_by_pk)
      // 进入项目反馈页即视为已读，清除列表的更新红点
      if (data.project_by_pk) markProjectViewed(data.project_by_pk.id, `server:${myName}`)
      // 初始化各反馈的回复编辑内容（取最新一份未发布草稿）
      const fbInit: Record<number, string> = {}
      for (const l of data.project_by_pk?.feedback_links ?? []) {
        for (const s of l.feedback_submissions ?? []) {
          const r = (s.feedback_replies ?? []).find((x) => x.status !== 'published' && x.status !== 'superseded')
          fbInit[s.id] = r ? r.content : ''
        }
      }
      setFbContents(fbInit)
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

  // 展平所有反馈链接下的反馈提交（新的在前），附带所属链接信息
  const feedbackItems = (project?.feedback_links ?? []).flatMap((l) =>
    (l.feedback_submissions ?? []).map((s) => ({ link: l, sub: s })),
  )

  /** 调用「反馈回复起草」行为流：综合企业信息+梳理方案+反馈内容起草回复，草稿自动写回审核链（旧草稿作废留痕） */
  const generateFbDraft = async (sub: FeedbackSubmission) => {
    setFbDrafting((p) => ({ ...p, [sub.id]: true }))
    try {
      const taskId = await createActionFlowTask(FEEDBACK_REPLY_FLOW_ID, { 反馈提交ID: sub.id })
      await waitActionFlowResult(taskId)
      toast.success('智能体草稿已生成并进入审核链，请审核修改')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '智能体起草失败，请重试')
    } finally {
      setFbDrafting((p) => ({ ...p, [sub.id]: false }))
    }
  }

  /** 手工起草反馈回复并进入审核链（智能体草稿不存在时的兜底）；反馈提交状态置为「回复中」 */
  const createFbReply = async (sub: FeedbackSubmission) => {
    const content = (fbContents[sub.id] ?? '').trim()
    if (!content) {
      toast.error('请输入回复内容')
      return
    }
    setActing(`fb-create-${sub.id}`)
    try {
      const init = initialReviewStage(reviewLevel)
      await gql(
        `mutation($obj: feedback_reply_insert_input!, $sid: bigint!) {
          insert_feedback_reply_one(object: $obj) { id }
          update_feedback_submission_by_pk(pk_columns: { id: $sid }, _set: { status: "confirmed" }) { id }
        }`,
        {
          obj: {
            feedback_submission_id: sub.id,
            project_id: project!.id,
            version: 1,
            content,
            status: init.status,
            current_stage: init.current_stage,
          },
          sid: sub.id,
        },
      )
      await logOperation({
        projectId: project!.id,
        operator: myName,
        action: '起草反馈回复并提交审核',
        targetType: 'feedback_submission',
        targetId: sub.id,
      })
      toast.success('反馈回复已提交，进入审核流程')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败')
    } finally {
      setActing(null)
    }
  }

  /** 仅保存反馈回复当前级补充内容 */
  const saveFbOnly = async (sub: FeedbackSubmission, replyId: number) => {
    setActing(`fb-save-${sub.id}`)
    try {
      await gql(
        `mutation($rid: bigint!, $c: String!) {
          update_feedback_reply_by_pk(pk_columns: { id: $rid }, _set: { content: $c }) { id }
        }`,
        { rid: replyId, c: (fbContents[sub.id] ?? '').trim() },
      )
      toast.success('已保存')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setActing(null)
    }
  }

  /** 反馈回复当前级审核通过：保存内容并流转；终审通过后反馈提交置「已回复」、链接置「已完成」 */
  const approveFb = async (sub: FeedbackSubmission, linkId: number, reply: FeedbackReply) => {
    setActing(`fb-approve-${sub.id}`)
    try {
      const next = nextReviewStage(reply.current_stage)
      const done = next.status === 'published'
      await gql(
        `mutation($rid: bigint!, $c: String!, $st: String!, $stage: bigint!, $sid: bigint!, $sstatus: String!, $lid: bigint!, $lstatus: String!, $rec: review_record_insert_input!) {
          update_feedback_reply_by_pk(pk_columns: { id: $rid }, _set: { content: $c, status: $st, current_stage: $stage }) { id }
          update_feedback_submission_by_pk(pk_columns: { id: $sid }, _set: { status: $sstatus }) { id }
          update_feedback_link_by_pk(pk_columns: { id: $lid }, _set: { status: $lstatus }) { id }
          insert_review_record_one(object: $rec) { id }
        }`,
        {
          rid: reply.id,
          c: (fbContents[sub.id] ?? '').trim(),
          st: next.status,
          stage: next.current_stage,
          sid: sub.id,
          sstatus: done ? 'replied' : 'confirmed',
          lid: linkId,
          lstatus: done ? 'done' : 'submitted',
          rec: {
            project_id: project!.id,
            target_type: 'feedback_reply',
            target_id: String(reply.id),
            level: myLevel,
            reviewer: myName,
            decision: 'approved',
            comment: (fbComments[sub.id] ?? '').trim() || null,
          },
        },
      )
      await logOperation({
        projectId: project!.id,
        operator: myName,
        action: done ? '反馈回复终审通过，已发送客户' : `反馈回复 ${myLevel} 级审核通过，流转下一级`,
        targetType: 'feedback_reply',
        targetId: reply.id,
      })
      toast.success(done ? '反馈回复已通过终审并发送给客户' : '已通过，流转至下一级')
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

      {/* 音频记录（面谈音频 + 转写文本 + 处理结果，可在线播放） */}
      {project.audio_records.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="h-4 w-4" /> 音频记录（{project.audio_records.length}）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.audio_records.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{r.file_name ?? '音频文件'}</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                    {AUDIO_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.processing_seconds != null && (
                    <span className="text-xs text-slate-400">
                      耗时 {r.processing_seconds < 90 ? `${r.processing_seconds} 秒` : `${Math.floor(r.processing_seconds / 60)} 分 ${r.processing_seconds % 60} 秒`}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{formatTime(r.created_at)}</span>
                </div>
                {r.status === 'failed' && r.error_message && (
                  <p className="mt-1.5 text-xs text-red-500">{r.error_message}</p>
                )}
                {(r.audio_file?.url || r.audio_url) && (
                  <audio controls preload="none" src={r.audio_file?.url ?? r.audio_url ?? ''} className="mt-2 h-9 w-full" />
                )}
                {r.transcript && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-400">对话内容（按说话人区分）</p>
                    <TranscriptView transcript={r.transcript} className="max-h-96" />
                  </div>
                )}
                {r.recognized_text && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-slate-400 underline decoration-dotted hover:text-slate-600">
                      语音识别原文（未分角色）
                    </summary>
                    <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                      {r.recognized_text}
                    </p>
                  </details>
                )}
                {r.raw_response != null && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-slate-400 underline decoration-dotted hover:text-slate-600">
                      API 原始返回
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">
                      {JSON.stringify(r.raw_response, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 方案反馈 */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">方案反馈（{feedbackItems.length}）</h2>
        {feedbackItems.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-400">
            该项目暂无方案反馈
          </p>
        )}
        {[...feedbackItems].reverse().map(({ link, sub }, idx) => {
          // 最新一份有效回复（排除已发布与已作废；已发布单独展示）
          const publishedReply = (sub.feedback_replies ?? []).find((r) => r.status === 'published') ?? null
          const reply = (sub.feedback_replies ?? []).find((r) => r.status !== 'published' && r.status !== 'superseded') ?? null
          const isPendingReply =
            sub.status !== 'replied' && (!reply || ['pending_l3', 'pending_l2', 'pending_l1'].includes(reply.status))
          const myTurn = isPrivileged
            ? isPendingReply
            : sub.status !== 'replied' && (!reply || reply.status === pendingStatusForLevel(myLevel))
          const isFinal = reply?.current_stage === 1
          const textSections: { key: FeedbackOption; text: string | null }[] = [
            { key: 'info_supplement', text: sub.info_supplement },
            { key: 'execution_issues', text: sub.execution_issues },
            { key: 'detail_request', text: sub.detail_request },
            { key: 'result_feedback', text: sub.result_feedback },
          ]
          const supplement = sub.form_supplement ?? {}
          return (
            <Card key={sub.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  反馈 {idx + 1}
                  <FeedbackSubmissionStatusBadge status={sub.status} />
                  {reply && <ReviewStatusBadge status={reply.status} />}
                  <span className="text-xs font-normal text-slate-400">
                    {((link.options ?? []) as FeedbackOption[]).map((o) => FEEDBACK_OPTION_LABEL[o] ?? o).join('、')}
                  </span>
                  <span className="ml-auto text-xs font-normal text-slate-400">{formatTime(sub.created_at)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 反馈内容 */}
                <div className="space-y-3 rounded-lg bg-slate-50 px-4 py-3">
                  {Object.keys(supplement).length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500">收集表补充信息</p>
                      {Object.entries(supplement).map(([ft, fields]) =>
                        Object.entries(fields ?? {}).map(([field, v]) => (
                          <p key={`${ft}-${field}`} className="text-sm text-slate-700">
                            <span className="text-slate-400">
                              {ft === 'detailed' ? '详细版' : '基础版'} · {field} 补充：
                            </span>
                            {v}
                          </p>
                        )),
                      )}
                    </div>
                  )}
                  {textSections
                    .filter((s) => s.text?.trim())
                    .map((s) => (
                      <div key={s.key} className="space-y-1">
                        <p className="text-xs font-medium text-slate-500">{FEEDBACK_OPTION_LABEL[s.key]}</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-800">{s.text}</p>
                      </div>
                    ))}
                  <p className="border-t border-slate-200 pt-2 text-xs text-slate-400">
                    填写人：{sub.filler_name ?? '—'}
                    {sub.filler_contact ? ` · ${sub.filler_contact}` : ''} · 链接状态：
                    <FeedbackLinkStatusBadge status={link.status} />
                  </p>
                </div>

                {/* 回复区 */}
                {sub.status === 'replied' && publishedReply ? (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-500">老师回复（已发送）</p>
                      <CopyTextButton text={publishedReply.content} />
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{publishedReply.content}</p>
                  </div>
                ) : !reply ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-sm">起草回复（提交后按 {reviewLevel} 级审核链流转，每级可补充）</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-violet-200 text-violet-600 hover:bg-violet-50"
                        disabled={acting !== null || !!fbDrafting[sub.id]}
                        onClick={() => generateFbDraft(sub)}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" /> 智能体起草
                      </Button>
                    </div>
                    {fbDrafting[sub.id] ? (
                      <AiDraftingPanel />
                    ) : (
                      <Textarea
                        rows={4}
                        value={fbContents[sub.id] ?? ''}
                        onChange={(e) => setFbContents((p) => ({ ...p, [sub.id]: e.target.value }))}
                        placeholder="输入回复内容…"
                      />
                    )}
                    <Button
                      className="bg-slate-900 hover:bg-slate-800"
                      disabled={acting !== null}
                      onClick={() => createFbReply(sub)}
                    >
                      {acting === `fb-create-${sub.id}` ? (
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
                        回复内容 v{reply.version}（当前 {reply.current_stage} 级节点{myTurn ? ' · 待我处理，可补充修改' : ' · 非我的节点，只读'}）
                      </Label>
                      {myTurn && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-violet-200 text-violet-600 hover:bg-violet-50"
                          disabled={acting !== null || !!fbDrafting[sub.id]}
                          onClick={() => generateFbDraft(sub)}
                          title="用智能体重新起草，当前草稿将作废留痕"
                        >
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> 智能体重写
                        </Button>
                      )}
                    </div>
                    {fbDrafting[sub.id] ? (
                      <AiDraftingPanel />
                    ) : (
                      <Textarea
                        rows={5}
                        value={fbContents[sub.id] ?? ''}
                        onChange={(e) => setFbContents((p) => ({ ...p, [sub.id]: e.target.value }))}
                        disabled={!myTurn}
                      />
                    )}
                    {myTurn && (
                      <>
                        <Textarea
                          rows={2}
                          value={fbComments[sub.id] ?? ''}
                          onChange={(e) => setFbComments((p) => ({ ...p, [sub.id]: e.target.value }))}
                          placeholder="本级审核备注（可选）…"
                        />
                        <div className="flex flex-wrap gap-3">
                          <Button variant="outline" disabled={acting !== null} onClick={() => saveFbOnly(sub, reply.id)}>
                            {acting === `fb-save-${sub.id}` ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="mr-1.5 h-4 w-4" />
                            )}
                            仅保存
                          </Button>
                          <Button
                            className="bg-green-600 hover:bg-green-700"
                            disabled={acting !== null}
                            onClick={() => approveFb(sub, link.id, reply)}
                          >
                            {acting === `fb-approve-${sub.id}` ? (
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

/* ---------------- 智能体起草等待动画 ---------------- */

const AI_PHASES = ['正在阅读企业收集表信息…', '正在回顾梳理方案…', '正在理解企业反馈内容…', '正在起草回复…']

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
          智能体正在综合「企业收集表信息 + 梳理方案 + 反馈内容」起草回复，通常需要 20-60 秒，请勿关闭页面
        </p>
      </div>
    </div>
  )
}
