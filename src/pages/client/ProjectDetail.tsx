import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import ReactMarkdown from 'react-markdown'
import { gql, logOperation, createActionFlowTask, ANALYZE_FLOW_ID, FEEDBACK_REPLY_FLOW_ID, AUDIO_FILL_FLOW_ID } from '@/lib/graphql'
import { buildReportDocument, downloadWord, downloadPdf } from '@/lib/exportReport'
import { uploadFile } from '@/lib/upload'
import { useAuth } from '@/lib/auth'
import {
  formatTime,
  randomToken,
  plusDaysISO,
  FEEDBACK_OPTION_LABEL,
  FEEDBACK_OPTION_DESC,
  FEEDBACK_OPTION_ORDER,
  AUDIO_STATUS_LABEL,
} from '@/lib/labels'
import { projectDisplayName, type Analysis, type AudioRecord, type FeedbackLink, type FeedbackOption, type FeedbackSubmission, type Project, type Submission } from '@/lib/types'
import { markProjectViewed, clientDisplayStatus } from '@/lib/projectMeta'
import { ClientProjectStatusBadge as ProjectStatusBadge, FeedbackLinkStatusBadge, FeedbackSubmissionStatusBadge } from '@/components/StatusBadge'
import CopyTextButton from '@/components/CopyTextButton'
import AnswersView from '@/components/AnswersView'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DETAILED_SECTIONS } from '@/lib/forms'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Copy,
  RefreshCw,
  Loader2,
  Link2,
  FileDown,
  Printer,
  Rocket,
  Check,
  Pencil,
  ListChecks,
  Ban,
  Mic,
} from 'lucide-react'

interface ProjectFull extends Project {
  submissions: Submission[]
  analyses: Analysis[]
  feedback_links: FeedbackLink[]
  audio_records: AudioRecord[]
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { auth } = useAuth()
  const [project, setProject] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const load = async () => {
    try {
      const data = await gql<{ project_by_pk: ProjectFull | null }>(
        `query($id: bigint!) {
          project_by_pk(id: $id) {
            id name remark status review_level current_analysis_id created_at
            submissions(order_by: { id: desc }) { id form_type filler_name filler_contact answers is_supplement project_id created_at }
            analyses(order_by: { id: desc }) { id version content status current_stage published_at project_id created_at }
            audio_records(order_by: { id: desc }) { id file_name audio_url file_id transcript status error_message processing_seconds finished_at project_id created_at }
            feedback_links(order_by: { id: desc }) {
              id token options status expires_at project_id created_at
              feedback_submissions(order_by: { id: desc }) {
                id form_supplement info_supplement execution_issues detail_request result_feedback
                status filler_name filler_contact created_at
                feedback_replies(order_by: { id: desc }) { id content status created_at }
              }
            }
          }
        }`,
        { id },
      )
      setProject(data.project_by_pk)
      // 进入详情即视为已读，清除列表页的更新红点
      if (data.project_by_pk) markProjectViewed(data.project_by_pk.id)
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

  // 每分钟刷新倒计时显示
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const latestAnalysis = project?.analyses[0] ?? null
  // 客户端展示以「当前版本」指针为准：指针所指版本已发布才展示；无指针回退到最新已发布版本
  const currentId = project?.current_analysis_id ?? null
  const publishedAnalysis = currentId
    ? (project?.analyses.find((a) => a.id === currentId && a.status === 'published') ?? null)
    : (project?.analyses.find((a) => a.status === 'published') ?? null)

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
      </div>
    )
  }
  if (!project) {
    return <div className="py-24 text-center text-slate-400">项目不存在或无权访问</div>
  }

  const refresh = () => load()

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/client')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回
        </Button>
        <Button variant="ghost" size="sm" onClick={refresh} title="刷新">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <h1 className="text-xl font-bold text-slate-900">{projectDisplayName(project)}</h1>
        <ProjectStatusBadge status={clientDisplayStatus(project)} />
        <RemarkEditor project={project} onChanged={refresh} />
      </div>

      <div className="no-print">
        <AudioCard
          project={project}
          records={project.audio_records}
          username={auth!.account.username}
          onChanged={refresh}
        />
      </div>

      <div className="no-print">
        <SubmissionsCard
          submissions={project.submissions}
          project={project}
          username={auth!.account.username}
          onChanged={refresh}
        />
      </div>

      <div className="no-print">
        <ActionsCard
          project={project}
          actionLoading={actionLoading}
          setActionLoading={setActionLoading}
          onChanged={refresh}
        />
      </div>

      <AnalysisCard project={project} analyses={project.analyses} latestAnalysis={latestAnalysis} publishedAnalysis={publishedAnalysis} />

      <div className="no-print">
        {publishedAnalysis && (
          <FeedbackCard
            project={project}
            links={project.feedback_links}
            username={auth!.account.username}
            onChanged={refresh}
          />
        )}
      </div>
    </div>
  )
}

/* ---------------- 备注编辑（客户） ---------------- */

function RemarkEditor({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await gql(
        `mutation($id: bigint!, $r: String) {
          update_project_by_pk(pk_columns: { id: $id }, _set: { remark: $r }) { id }
        }`,
        { id: project.id, r: draft.trim() || null },
      )
      toast.success('备注已更新')
      setEditing(false)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Input
          className="h-7 w-48 text-sm"
          autoFocus
          value={draft}
          placeholder="备注（选填）"
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <Button size="sm" variant="ghost" className="h-7 px-2" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
      </span>
    )
  }
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      onClick={() => {
        setDraft(project.remark ?? '')
        setEditing(true)
      }}
    >
      {project.remark ? `备注：${project.remark}` : '添加备注'}
      <Pencil className="h-3 w-3" />
    </button>
  )
}

/* ---------------- 提交信息（含客户修改） ---------------- */

function SubmissionsCard({
  submissions,
  project,
  username,
  onChanged,
}: {
  submissions: Submission[]
  project: Project
  username: string
  onChanged: () => void
}) {
  const basics = submissions.filter((s) => s.form_type === 'basic')
  const detailed = submissions.filter((s) => s.form_type === 'detailed')
  const latestDetailed = detailed[0] ?? null
  // 提交梳理前（信息整理阶段）客户可修改最新详细版答案
  const canEdit = ['created', 'collecting', 'pending_confirm', 'supplementing'].includes(project.status)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    if (!latestDetailed) return
    const d: Record<string, string> = {}
    for (const sec of DETAILED_SECTIONS) {
      for (const q of sec.questions) d[q] = latestDetailed.answers?.[q] ?? ''
    }
    setDraft(d)
    setEditing(true)
  }

  const save = async () => {
    if (!latestDetailed) return
    setSaving(true)
    try {
      // 只保留非空答案 + 原有非题目键（兼容历史键名）
      const cleaned: Record<string, string> = { ...(latestDetailed.answers ?? {}) }
      for (const sec of DETAILED_SECTIONS) {
        for (const q of sec.questions) {
          const v = (draft[q] ?? '').trim()
          if (v) cleaned[q] = v
          else delete cleaned[q]
        }
      }
      await gql(
        `mutation($id: bigint!, $a: jsonb) {
          update_submission_by_pk(pk_columns: { id: $id }, _set: { answers: $a }) { id }
        }`,
        { id: latestDetailed.id, a: cleaned },
      )
      await logOperation({
        projectId: project.id,
        operator: username,
        action: '修改企业信息（详细版）',
        targetType: 'submission',
        targetId: latestDetailed.id,
      })
      toast.success('修改已保存')
      setEditing(false)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          提交信息（{submissions.length}）
          {canEdit && latestDetailed && !editing && (
            <Button variant="outline" size="sm" className="ml-auto h-8" onClick={startEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> 修改企业信息
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">尚未整理企业信息，请先上传面谈音频</p>
        ) : editing ? (
          <div className="space-y-5">
            <p className="rounded-lg bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
              请核对系统整理的企业信息，不准确的地方直接修改，全部确认后保存；提交梳理前都可以再次修改。
            </p>
            {DETAILED_SECTIONS.map((sec) => (
              <section key={sec.title} className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">{sec.title}</h3>
                <div className="space-y-3">
                  {sec.questions.map((q) => (
                    <div key={q} className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{q}</label>
                      <Textarea
                        rows={2}
                        value={draft[q] ?? ''}
                        onChange={(e) => setDraft((p) => ({ ...p, [q]: e.target.value }))}
                        placeholder="未涉及"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <div className="flex gap-3">
              <Button className="bg-slate-900 hover:bg-slate-800" disabled={saving} onClick={save}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                保存修改
              </Button>
              <Button variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue={detailed.length > 0 ? 'detailed' : 'basic'}>
            <TabsList>
              <TabsTrigger value="basic">基础版（{basics.length}）</TabsTrigger>
              <TabsTrigger value="detailed">详细版（{detailed.length}）</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="space-y-4 pt-4">
              {basics.length === 0 ? <p className="text-sm text-slate-400">暂无基础版提交</p> : basics.map((s) => <AnswersView key={s.id} submission={s} />)}
            </TabsContent>
            <TabsContent value="detailed" className="space-y-4 pt-4">
              {detailed.length === 0 ? <p className="text-sm text-slate-400">暂无详细版提交</p> : detailed.map((s) => <AnswersView key={s.id} submission={s} />)}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- 操作（提交梳理） ---------------- */

function ActionsCard({
  project,
  actionLoading,
  setActionLoading,
  onChanged,
}: {
  project: Project & { submissions: Submission[] }
  actionLoading: string | null
  setActionLoading: (v: string | null) => void
  onChanged: () => void
}) {
  const { auth } = useAuth()
  const hasSubmission = project.submissions.length > 0
  const canSubmit = hasSubmission && ['created', 'collecting', 'pending_confirm', 'supplementing'].includes(project.status)

  const doSubmit = async () => {
    setActionLoading('submit')
    try {
      // 状态置为「梳理中」并触发「项目梳理」ActionFlow（异步：汇总信息 → AI 梳理 → 写回报告并转入审核）
      await gql(
        `mutation($pid: bigint!, $fid: String!, $args: Json!) {
          update_project_by_pk(pk_columns: { id: $pid }, _set: { status: "analyzing" }) { id }
          fz_create_action_flow_task(actionFlowId: $fid, args: $args)
        }`,
        { pid: project.id, fid: ANALYZE_FLOW_ID, args: { 项目ID: project.id } },
      )
      await logOperation({
        projectId: project.id,
        operator: auth!.account.username,
        action: '提交梳理（触发 AI 梳理）',
        targetType: 'project',
        targetId: project.id,
      })
      toast.success('已提交，梳理进行中，完成后将第一时间展示')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  if (!canSubmit) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">操作</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">请核对上方企业信息，确认完整无误后提交梳理；提交后信息不可再修改。</p>
        <Button className="bg-slate-900 hover:bg-slate-800" disabled={actionLoading === 'submit'} onClick={doSubmit}>
          {actionLoading === 'submit' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Rocket className="mr-1.5 h-4 w-4" />}
          确认信息完整，提交梳理
        </Button>
      </CardContent>
    </Card>
  )
}

/* ---------------- 梳理结果 ---------------- */

/** 客户端展示前剥离「内部参考 / 思想来源（仅审核人员可见）」一节 */
function stripInternalRef(content: string): string {
  return content.split(/\n#{1,3}\s*(内部参考|思想来源|指导核心)/)[0].trimEnd()
}

function AnalysisCard({
  project,
  analyses,
  latestAnalysis,
  publishedAnalysis,
}: {
  project: Project
  analyses: Analysis[]
  latestAnalysis: Analysis | null
  publishedAnalysis: Analysis | null
}) {
  const [exportingPdf, setExportingPdf] = useState(false)
  // 历史版本：全部已发布版本（新→旧）；默认看「当前版本」指针所指（即最新交付版本），旧版本随时可回看
  const publishedVersions = analyses.filter((a) => a.status === 'published')
  const [viewId, setViewId] = useState<number | null>(null)
  const viewed = (viewId != null ? publishedVersions.find((a) => a.id === viewId) : null) ?? publishedAnalysis

  const buildDoc = () => {
    if (!viewed) return null
    return buildReportDocument(
      {
        enterpriseName: projectDisplayName(project),
        version: viewed.version,
        generatedAt: formatTime(viewed.published_at ?? viewed.created_at),
      },
      stripInternalRef(viewed.content),
    )
  }

  const exportWord = () => {
    const doc = buildDoc()
    if (!doc || !viewed) return
    downloadWord(doc, `${projectDisplayName(project)}-梳理报告-v${viewed.version}.doc`)
  }

  const exportPdf = async () => {
    if (!viewed) return
    setExportingPdf(true)
    try {
      await downloadPdf(
        {
          enterpriseName: projectDisplayName(project),
          version: viewed.version,
          generatedAt: formatTime(viewed.published_at ?? viewed.created_at),
        },
        stripInternalRef(viewed.content),
        `${projectDisplayName(project)}-梳理报告-v${viewed.version}.pdf`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF 导出失败')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          梳理结果
          {latestAnalysis && (
            <span className="text-sm font-normal text-slate-500">
              v{latestAnalysis.version} · {latestAnalysis.status === 'published' ? '已梳理' : '梳理中'}
              {latestAnalysis.status === 'published' &&
                ` · 梳理时间 ${formatTime(latestAnalysis.published_at ?? latestAnalysis.created_at)}`}
            </span>
          )}
          {publishedVersions.length > 1 && (
            <span className="ml-auto flex items-center gap-2 text-sm font-normal text-slate-500">
              历史版本
              <Select value={String(viewed?.id ?? '')} onValueChange={(v) => setViewId(Number(v))}>
                <SelectTrigger className="h-8 w-44 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {publishedVersions.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      v{a.version} · {formatTime(a.published_at ?? a.created_at)}
                      {publishedAnalysis?.id === a.id ? '（当前）' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!latestAnalysis ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {project.status === 'analyzing' ? '梳理中' : '尚未提交梳理'}
          </p>
        ) : viewed ? (
          <div className="space-y-4">
            {viewed.id !== publishedAnalysis?.id && (
              <p className="rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-500">
                正在查看历史版本 v{viewed.version}（基于此前较简略的信息梳理）；当前交付版本为 v{publishedAnalysis?.version}。
              </p>
            )}
            <div className="markdown-body rounded-lg border border-slate-200 bg-white p-5">
              <h1>{projectDisplayName(project)} · 企业梳理报告</h1>
              <ReactMarkdown>{stripInternalRef(viewed.content)}</ReactMarkdown>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={exportWord}>
                <FileDown className="mr-1.5 h-4 w-4" /> 导出 Word
              </Button>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf}>
                {exportingPdf ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
                {exportingPdf ? '正在导出…' : '导出 PDF'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {latestAnalysis.status === 'published' ? '已梳理' : '当前状态：梳理中，完成后将在此展示'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- 方案反馈 ---------------- */

const FEEDBACK_LINK_DAYS = 3

function FeedbackCard({
  project,
  links,
  username,
  onChanged,
}: {
  project: Project & { submissions: Submission[] }
  links: FeedbackLink[]
  username: string
  onChanged: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<FeedbackOption[]>([])
  const [acting, setActing] = useState<string | null>(null)

  // 周期门控：有进行中（未过期）的链接、或有待确认/回复中的反馈时，不可签发新链接
  const busyCycle = links.some((l) => {
    if (l.status === 'active' && new Date(l.expires_at).getTime() >= Date.now()) return true
    return (l.feedback_submissions ?? []).some((s) => s.status === 'submitted' || s.status === 'confirmed')
  })

  const fullUrl = (token: string) => `${window.location.origin}${window.location.pathname}#/f/${token}`

  const copyInvite = async (link: FeedbackLink) => {
    const opts = ((link.options ?? []) as FeedbackOption[])
    const lines = [
      '【方案反馈邀请】',
      `你好，${projectDisplayName(project)} 的服务团队邀请你就梳理方案反馈以下内容（均可选填）：`,
      ...FEEDBACK_OPTION_ORDER.filter((o) => opts.includes(o)).map(
        (o) => `- ${FEEDBACK_OPTION_LABEL[o]}：${FEEDBACK_OPTION_DESC[o]}`,
      ),
      `填写链接（${FEEDBACK_LINK_DAYS} 天内有效，仅可提交一次）：${fullUrl(link.token)}`,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success('邀请话术和链接已复制，可直接转发给填写人')
    } catch {
      toast.info(fullUrl(link.token))
    }
  }

  const createLink = async () => {
    if (selected.length === 0) {
      toast.error('请至少勾选一项反馈内容')
      return
    }
    setActing('create')
    try {
      await gql(
        `mutation($obj: feedback_link_insert_input!) {
          insert_feedback_link_one(object: $obj) { id }
        }`,
        {
          obj: {
            project_id: project.id,
            token: randomToken(),
            options: selected,
            status: 'active',
            expires_at: plusDaysISO(FEEDBACK_LINK_DAYS),
          },
        },
      )
      await logOperation({
        projectId: project.id,
        operator: username,
        action: '签发方案反馈链接',
        targetType: 'feedback_link',
        detail: { options: selected },
      })
      toast.success('反馈链接已签发，复制后发送给填写人')
      setPicking(false)
      setSelected([])
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '签发失败')
    } finally {
      setActing(null)
    }
  }

  const closeLink = async (link: FeedbackLink) => {
    setActing(`close-${link.id}`)
    try {
      await gql(
        `mutation($id: bigint!) {
          update_feedback_link_by_pk(pk_columns: { id: $id }, _set: { status: "closed" }) { id }
        }`,
        { id: link.id },
      )
      await logOperation({
        projectId: project.id,
        operator: username,
        action: '撤回方案反馈链接',
        targetType: 'feedback_link',
        targetId: link.id,
      })
      toast.success('已撤回，填写人将无法再打开该链接')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  const resignLink = async (link: FeedbackLink) => {
    setActing(`resign-${link.id}`)
    try {
      await gql(
        `mutation($id: bigint!, $token: String!, $exp: timestamptz!) {
          update_feedback_link_by_pk(pk_columns: { id: $id }, _set: { token: $token, expires_at: $exp, status: "active" }) { id }
        }`,
        { id: link.id, token: randomToken(), exp: plusDaysISO(FEEDBACK_LINK_DAYS) },
      )
      await logOperation({
        projectId: project.id,
        operator: username,
        action: '重新签发方案反馈链接',
        targetType: 'feedback_link',
        targetId: link.id,
      })
      toast.success(`已重新签发（${FEEDBACK_LINK_DAYS} 天有效）`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  /** 客户经理确认反馈：①补充表单合并进收集表（标注后补充）②状态转 confirmed ③触发智能体起草回复（自动写回审核链） */
  const confirmSubmission = async (s: FeedbackSubmission) => {
    setActing(`confirm-${s.id}`)
    try {
      const sup = s.form_supplement
      if (sup && typeof sup === 'object') {
        for (const [formType, fields] of Object.entries(sup)) {
          const entries = Object.entries(fields ?? {}).filter(([, v]) => String(v).trim())
          if (entries.length === 0) continue
          // 合并到该项目该表单类型的最新一条收集表提交
          const cur = await gql<{ submission: { id: number; answers: Record<string, string> | null }[] }>(
            `query($pid: bigint!, $ft: String!) {
              submission(where: { project_id: { _eq: $pid }, form_type: { _eq: $ft } }, order_by: { id: desc }, limit: 1) { id answers }
            }`,
            { pid: project.id, ft: formType },
          )
          const row = cur.submission[0]
          if (!row) continue
          const answers = { ...(row.answers ?? {}) }
          for (const [k, v] of entries) {
            const t = String(v).trim()
            answers[k] = answers[k] ? `${answers[k]}\n【后补充】${t}` : `【后补充】${t}`
          }
          await gql(
            `mutation($id: bigint!, $set: submission_set_input!) {
              update_submission_by_pk(pk_columns: { id: $id }, _set: $set) { id }
            }`,
            { id: row.id, set: { answers } },
          )
        }
      }
      await gql(
        `mutation($sid: bigint!) {
          update_feedback_submission_by_pk(pk_columns: { id: $sid }, _set: { status: "confirmed" }) { id }
        }`,
        { sid: s.id },
      )
      await createActionFlowTask(FEEDBACK_REPLY_FLOW_ID, { 反馈提交ID: s.id })
      await logOperation({
        projectId: project.id,
        operator: username,
        action: '确认方案反馈（触发回复起草）',
        targetType: 'feedback_submission',
        targetId: s.id,
      })
      toast.success('已确认，服务团队回复后将在此展示')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '确认失败，请重试')
    } finally {
      setActing(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4" /> 方案反馈
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">
          签发反馈链接发给企业，邀请对方就方案补充信息、提出执行问题或反馈执行结果；服务团队回复后在此展示。
        </p>

        {links.length > 0 && (
          <div className="space-y-3">
            {links.map((l) => {
              const expired = l.status === 'active' && new Date(l.expires_at).getTime() < Date.now()
              const submissions = l.feedback_submissions ?? []
              return (
                <div key={l.id} className="space-y-2 rounded-lg border border-slate-200 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <FeedbackLinkStatusBadge status={expired ? 'closed' : l.status} />
                    {expired && <span className="text-xs text-slate-400">（已过期）</span>}
                    <span className="text-xs text-slate-400">
                      {((l.options ?? []) as FeedbackOption[])
                        .map((o) => FEEDBACK_OPTION_LABEL[o] ?? o)
                        .join('、')}
                    </span>
                    <span className="ml-auto text-xs text-slate-400">{formatTime(l.created_at)}</span>
                  </div>
                  {l.status === 'active' && !expired && (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <code className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 border border-slate-200">
                          {fullUrl(l.token)}
                        </code>
                        <Button variant="outline" size="sm" className="shrink-0" onClick={() => copyInvite(l)}>
                          <Copy className="mr-1 h-4 w-4" /> 复制
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>到期时间 {formatTime(l.expires_at)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                          disabled={acting === `close-${l.id}`}
                          onClick={() => closeLink(l)}
                        >
                          {acting === `close-${l.id}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1 h-3.5 w-3.5" />}
                          撤回
                        </Button>
                      </div>
                    </>
                  )}
                  {(l.status === 'closed' || expired) && submissions.length === 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">该链接{expired ? '已过期' : '已撤回'}，可重新签发后再发给填写人</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 border-amber-300 text-amber-700 hover:bg-amber-50"
                        disabled={acting === `resign-${l.id}`}
                        onClick={() => resignLink(l)}
                      >
                        {acting === `resign-${l.id}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                        重新签发
                      </Button>
                    </div>
                  )}
                  {submissions.map((s) => {
                    const publishedReply = (s.feedback_replies ?? []).find((r) => r.status === 'published')
                    return (
                      <div key={s.id} className="rounded-lg bg-slate-50 px-3 py-2.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-slate-700">{s.filler_name ?? '填写人'} 已提交反馈</span>
                          <FeedbackSubmissionStatusBadge status={s.status} />
                          <span className="ml-auto text-xs text-slate-400">{formatTime(s.created_at)}</span>
                        </div>
                        <FeedbackContentView submission={s} />
                        {s.status === 'submitted' && (
                          <div className="flex items-center gap-3 border-t border-slate-200 pt-2">
                            <p className="text-xs text-slate-400">请核对反馈内容，确认后服务团队将跟进回复</p>
                            <Button
                              size="sm"
                              className="ml-auto h-7 bg-slate-900 hover:bg-slate-800"
                              disabled={acting === `confirm-${s.id}`}
                              onClick={() => confirmSubmission(s)}
                            >
                              {acting === `confirm-${s.id}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                              确认
                            </Button>
                          </div>
                        )}
                        {s.status === 'confirmed' && (
                          <p className="border-t border-slate-200 pt-2 text-xs text-slate-400">已确认，服务团队回复中…</p>
                        )}
                        {s.status === 'replied' && publishedReply && (
                          <div className="space-y-2 border-t border-slate-200 pt-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-slate-500">老师回复</p>
                              <CopyTextButton text={publishedReply.content} />
                            </div>
                            <p className="whitespace-pre-wrap text-sm text-slate-700">{publishedReply.content}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {picking ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-4">
            <p className="text-sm font-medium text-slate-700">勾选希望企业反馈的内容（至少一项）：</p>
            <div className="space-y-2.5">
              {FEEDBACK_OPTION_ORDER.map((o) => (
                <label key={o} className="flex cursor-pointer items-start gap-2.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.includes(o)}
                    onCheckedChange={(v) =>
                      setSelected((prev) => (v ? [...prev, o] : prev.filter((x) => x !== o)))
                    }
                  />
                  <span className="text-sm">
                    <span className="font-medium text-slate-800">{FEEDBACK_OPTION_LABEL[o]}</span>
                    <span className="ml-1.5 text-xs text-slate-400">{FEEDBACK_OPTION_DESC[o]}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={acting === 'create'} onClick={createLink}>
                {acting === 'create' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
                签发链接（{FEEDBACK_LINK_DAYS} 天有效）
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPicking(false); setSelected([]) }}>
                取消
              </Button>
            </div>
          </div>
        ) : busyCycle ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-400">
            当前有一轮反馈正在进行中（链接待填写 / 待确认 / 回复中），本轮回复完成后才能签发新链接；如需更换反馈内容，可先撤回上方链接再重新签发。
          </p>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            <Link2 className="mr-1.5 h-4 w-4" /> 签发反馈链接
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- 反馈内容展示 ---------------- */

function FeedbackContentView({ submission: s }: { submission: FeedbackSubmission }) {
  const items: { label: string; text: string }[] = []
  if (s.form_supplement && typeof s.form_supplement === 'object') {
    for (const [ft, fields] of Object.entries(s.form_supplement)) {
      const entries = Object.entries(fields ?? {}).filter(([, v]) => String(v).trim())
      if (entries.length > 0) {
        items.push({
          label: `${FEEDBACK_OPTION_LABEL.form_supplement}（${ft === 'detailed' ? '详细版' : '基础版'}）`,
          text: entries.map(([k, v]) => `${k}：${String(v).trim()}`).join('\n'),
        })
      }
    }
  }
  const textMap: [FeedbackOption, string | null][] = [
    ['info_supplement', s.info_supplement],
    ['execution_issues', s.execution_issues],
    ['detail_request', s.detail_request],
    ['result_feedback', s.result_feedback],
  ]
  for (const [key, val] of textMap) {
    if (val?.trim()) items.push({ label: FEEDBACK_OPTION_LABEL[key], text: val.trim() })
  }
  if (items.length === 0) return null
  return (
    <div className="space-y-2 border-t border-slate-200 pt-2">
      {items.map((it) => (
        <div key={it.label}>
          <p className="text-xs font-medium text-slate-500">{it.label}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{it.text}</p>
        </div>
      ))}
    </div>
  )
}

/* ---------------- 面谈音频（音频转写填表） ---------------- */

const AUDIO_ACCEPT = ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'webm']

/** 读取音频时长（秒），失败返回 0 */
function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      const d = a.duration
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(d) ? d : 0)
    }
    a.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    a.src = url
  })
}

/** 预计整理时长（分钟）：转写约按时长的 0.3 倍，加 AI 填表约 2 分钟，保底 3 分钟 */
export function estimateMinutes(durationSec: number): number {
  if (!durationSec) return 5
  return Math.max(3, Math.round(durationSec / 60) * 0.3 + 2)
}

/** 预计时长提示的本地存取（按音频记录 id，刷新页面后仍可见） */
const estKey = (rid: number) => `xa_audio_est_${rid}`
function saveEstimate(rid: number, minutes: number) {
  try {
    localStorage.setItem(estKey(rid), String(minutes))
  } catch {
    /* ignore */
  }
}
function loadEstimate(rid: number): number | null {
  try {
    const v = Number(localStorage.getItem(estKey(rid)))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

/** 处理耗时展示：90 秒内显示秒，否则 X 分 Y 秒 */
function formatDuration(sec?: number | null): string {
  if (sec == null || sec <= 0) return ''
  if (sec < 90) return `${sec} 秒`
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`
}

function AudioCard({
  project,
  records,
  username,
  onChanged,
}: {
  project: Project
  records: AudioRecord[]
  username: string
  onChanged: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [retrying, setRetrying] = useState<number | null>(null)
  const [openTranscript, setOpenTranscript] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const busy = records.some((r) => r.status === 'uploaded' || r.status === 'processing')

  // 有排队/整理中的记录时，每 5 秒自动刷新一次状态
  useEffect(() => {
    if (!busy) return
    const t = setTimeout(onChanged, 5000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, records])

  const onPick = async (file: File) => {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!AUDIO_ACCEPT.includes(ext)) {
      toast.error('请上传音频文件（mp3 / m4a / wav / ogg / flac / aac / webm）')
      return
    }
    setUploading(true)
    try {
      // 0. 读取音频时长，给出预计处理时间
      const durationSec = await readAudioDuration(file)
      const durationMin = durationSec ? Math.round(durationSec / 60) : 0
      const estMin = estimateMinutes(durationSec)
      if (durationMin > 60) {
        toast.warning(`音频时长约 ${durationMin} 分钟，较长可能转写超时，建议分段上传；仍将继续尝试`, { duration: 8000 })
      }
      // 1. 直传 Zion 资源存储（CDN 公开地址，供转写工作流拉取）
      const up = await uploadFile(file)
      // 2. 落音频记录
      const ins = await gql<{ insert_audio_record_one: { id: number } }>(
        `mutation($obj: audio_record_insert_input!) {
          insert_audio_record_one(object: $obj) { id }
        }`,
        {
          obj: {
            project_id: project.id,
            file_name: file.name,
            audio_url: up.downloadUrl,
            file_id: up.fileId,
            status: 'uploaded',
          },
        },
      )
      const rid = ins.insert_audio_record_one.id
      saveEstimate(rid, estMin)
      // 3. 触发异步「音频转写填表」流程（转写耗时较长，异步任务不受接口超时限制）
      await createActionFlowTask(AUDIO_FILL_FLOW_ID, { 音频记录ID: rid })
      await logOperation({
        projectId: project.id,
        operator: username,
        action: '上传面谈音频（触发整理填表）',
        targetType: 'audio_record',
        targetId: rid,
        detail: { file_name: file.name, 时长秒: Math.round(durationSec), 预计分钟: estMin },
      })
      toast.success(
        durationMin > 0
          ? `音频已上传（时长约 ${durationMin} 分钟），预计整理约 ${estMin} 分钟完成，企业信息将自动更新`
          : `音频已上传，预计整理约 ${estMin} 分钟完成，企业信息将自动更新`,
        { duration: 8000 },
      )
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败，请重试')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const retry = async (r: AudioRecord) => {
    setRetrying(r.id)
    try {
      await createActionFlowTask(AUDIO_FILL_FLOW_ID, { 音频记录ID: r.id })
      toast.success('已重新触发整理，请稍候')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '触发失败，请重试')
    } finally {
      setRetrying(null)
    }
  }

  const statusColor = (st: string) =>
    st === 'done'
      ? 'bg-green-50 text-green-700 border-green-200'
      : st === 'failed'
        ? 'bg-red-50 text-red-600 border-red-200'
        : 'bg-blue-50 text-blue-700 border-blue-200'

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mic className="h-4 w-4" /> 面谈音频
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">
          与企业线下面谈时录音并上传，系统会自动整理访谈内容、填写企业信息；已交付方案的项目会基于更详细的信息重新梳理并进入审核，旧版本方案保留可回看。
        </p>

        <input
          ref={fileRef}
          type="file"
          accept={AUDIO_ACCEPT.map((e) => '.' + e).join(',')}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onPick(f)
          }}
        />
        <Button
          className="bg-slate-900 hover:bg-slate-800"
          disabled={uploading || busy}
          onClick={() => fileRef.current?.click()}
          title={busy ? '有音频正在整理中，完成后再上传' : undefined}
        >
          {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mic className="mr-1.5 h-4 w-4" />}
          {uploading ? '上传中…' : '上传面谈音频'}
        </Button>
        {busy && (() => {
          const cur = records.find((r) => r.status === 'uploaded' || r.status === 'processing')
          const est = cur ? loadEstimate(cur.id) : null
          return (
            <p className="flex items-center text-sm text-blue-600">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              正在整理访谈内容{est ? `，预计约 ${est} 分钟完成` : ''}，页面会自动刷新，无需等待…
            </p>
          )
        })()}

        {records.length > 0 && (
          <div className="space-y-2">
            {records.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{r.file_name ?? '音频文件'}</span>
                  {(r.status === 'uploaded' || r.status === 'processing') && loadEstimate(r.id) && (
                    <span className="text-xs text-blue-500">预计约 {loadEstimate(r.id)} 分钟</span>
                  )}
                  {(r.status === 'done' || r.status === 'failed') && r.processing_seconds != null && (
                    <span className="text-xs text-slate-400">耗时 {formatDuration(r.processing_seconds)}</span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${statusColor(r.status)}`}>
                    {AUDIO_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  <span className="text-xs text-slate-400">{formatTime(r.created_at)}</span>
                </div>
                {r.status === 'failed' && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <p className="flex-1 text-xs text-red-500">{r.error_message ?? '整理失败'}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={retrying === r.id}
                      onClick={() => retry(r)}
                    >
                      {retrying === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                      重试
                    </Button>
                  </div>
                )}
                {r.status === 'done' && r.transcript && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600"
                      onClick={() => setOpenTranscript(openTranscript === r.id ? null : r.id)}
                    >
                      {openTranscript === r.id ? '收起访谈整理文本' : '查看访谈整理文本'}
                    </button>
                    {openTranscript === r.id && (
                      <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                        {r.transcript}
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
