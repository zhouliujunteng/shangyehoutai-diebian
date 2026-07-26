import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router'
import ReactMarkdown from 'react-markdown'
import { gql, logOperation, ANALYZE_FLOW_ID } from '@/lib/graphql'
import { buildReportDocument, downloadWord, downloadPdf } from '@/lib/exportReport'
import { AttachmentPicker, AttachmentView, type AttachmentItem } from '@/lib/attachments'
import { useAuth } from '@/lib/auth'
import {
  formatTime,
  randomToken,
  plusDaysISO,
} from '@/lib/labels'
import { projectDisplayName, type Analysis, type CollectLink, type Project, type Question, type Submission } from '@/lib/types'
import { markProjectViewed, clientDisplayStatus } from '@/lib/projectMeta'
import { ClientProjectStatusBadge as ProjectStatusBadge, LinkStatusBadge, QuestionStatusBadge } from '@/components/StatusBadge'
import CopyTextButton from '@/components/CopyTextButton'
import AnswersView from '@/components/AnswersView'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Copy,
  RefreshCw,
  Loader2,
  Link2,
  Send,
  FileDown,
  Printer,
  MessageSquarePlus,
  FileEdit,
  Rocket,
  XCircle,
  Check,
  Pencil,
} from 'lucide-react'

interface ProjectFull extends Project {
  collect_links: CollectLink[]
  submissions: Submission[]
  analyses: Analysis[]
  questions: Question[]
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
            id name remark status review_level created_at
            collect_links(order_by: { id: desc }) { id token status expires_at project_id created_at }
            submissions(order_by: { id: desc }) { id form_type filler_name filler_contact answers is_supplement project_id created_at }
            analyses(order_by: { id: desc }) { id version content status current_stage project_id created_at }
            questions(order_by: { id: desc }) {
              id content status attachments project_id created_at
              replies(order_by: { id: desc }) { id content status attachments current_stage question_id created_at }
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

  const link = project?.collect_links[0] ?? null
  const latestAnalysis = project?.analyses[0] ?? null
  const publishedAnalysis = project?.analyses.find((a) => a.status === 'published') ?? null

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
      <div className="no-print flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/client')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回
        </Button>
        <h1 className="text-xl font-bold text-slate-900">{projectDisplayName(project)}</h1>
        <ProjectStatusBadge status={clientDisplayStatus(project)} />
      </div>

      <div className="no-print">
        {/* 梳理报告发布后：收集链接已完成使命，整个区域不再展示 */}
        {!publishedAnalysis && (
          <CollectLinkCard
            link={link}
            project={project}
            actionLoading={actionLoading}
            setActionLoading={setActionLoading}
            onChanged={refresh}
          />
        )}
      </div>

      <div className="no-print">
        <SubmissionsCard submissions={project.submissions} />
      </div>

      <div className="no-print">
        <ActionsCard
          project={project}
          link={link}
          actionLoading={actionLoading}
          setActionLoading={setActionLoading}
          onChanged={refresh}
        />
      </div>

      <AnalysisCard project={project} latestAnalysis={latestAnalysis} publishedAnalysis={publishedAnalysis} />

      <div className="no-print">
        {publishedAnalysis ? (
          <QuestionsCard project={project} questions={project.questions} username={auth!.account.username} onChanged={refresh} />
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquarePlus className="h-4 w-4" /> 提问
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="py-4 text-center text-sm text-slate-400">梳理结果发布后，可就报告内容向服务团队提问</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ---------------- 收集链接 ---------------- */

function CollectLinkCard({
  link,
  project,
  actionLoading,
  setActionLoading,
  onChanged,
}: {
  link: CollectLink | null
  project: Project
  actionLoading: string | null
  setActionLoading: (v: string | null) => void
  onChanged: () => void
}) {
  const { auth } = useAuth()
  if (!link) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-slate-400">暂无收集链接</CardContent>
      </Card>
    )
  }
  // 报告生成后（梳理中/审核中/已发布）：链接关闭，项目信息不可再改
  const frozen = ['analyzing', 'in_review', 'published'].includes(project.status)
  const expired = link.status === 'expired' || new Date(link.expires_at).getTime() < Date.now()
  const fullUrl = `${window.location.origin}${window.location.pathname}#/f/${link.token}`

  const msLeft = new Date(link.expires_at).getTime() - Date.now()
  const days = Math.floor(msLeft / 86400000)
  const hours = Math.floor((msLeft % 86400000) / 3600000)
  const countdown = expired ? '已过期' : days > 0 ? `剩余 ${days} 天 ${hours} 小时` : `剩余 ${hours} 小时`

  const copy = async () => {
    // 复制时附带邀请话术，方便客户直接转发给填写人；备注为内部信息，不带入话术
    const entName = project.name.trim()
    const inviteText = [
      '【企业信息收集邀请】',
      entName
        ? `你好，${entName} 的服务团队邀请你填写企业信息收集表。`
        : '你好，服务团队邀请你填写企业信息收集表。',
      `填写链接（3 天内有效，仅可提交一次）：${fullUrl}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(inviteText)
      toast.success('邀请话术和链接已复制，可直接转发给填写人')
    } catch {
      toast.info(fullUrl)
    }
  }

  const regenerate = async () => {
    setActionLoading('regen')
    try {
      await gql(
        `mutation($id: bigint!, $token: String!, $exp: timestamptz!) {
          update_collect_link_by_pk(pk_columns: { id: $id }, _set: { token: $token, expires_at: $exp, status: "active" }) { id }
        }`,
        { id: link.id, token: randomToken(), exp: plusDaysISO(3) },
      )
      await logOperation({
        projectId: project.id,
        operator: auth!.account.username,
        action: '重新签发收集链接',
        targetType: 'collect_link',
        targetId: link.id,
      })
      toast.success('已重新签发链接（3 天有效）')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" /> 收集链接
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {frozen ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            项目信息已提交梳理，收集链接已关闭，不可再复制或修改。如需变更请联系服务团队。
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 border border-slate-200">
                {fullUrl}
              </code>
              <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
                <Copy className="mr-1 h-4 w-4" /> 复制
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <LinkStatusBadge status={expired ? 'expired' : link.status} />
              <span>{countdown}</span>
              <span className="text-slate-400">到期时间 {formatTime(link.expires_at)}</span>
              <RemarkEditor project={project} onChanged={onChanged} />
              {expired && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  disabled={actionLoading === 'regen'}
                  onClick={regenerate}
                >
                  {actionLoading === 'regen' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                  重新签发
                </Button>
              )}
            </div>
          </>
        )}
        {frozen && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <RemarkEditor project={project} onChanged={onChanged} />
          </div>
        )}
      </CardContent>
    </Card>
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

/* ---------------- 提交信息 ---------------- */

function SubmissionsCard({ submissions }: { submissions: Submission[] }) {
  const basics = submissions.filter((s) => s.form_type === 'basic')
  const detailed = submissions.filter((s) => s.form_type === 'detailed')
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">提交信息（{submissions.length}）</CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">企业尚未填写，复制上方链接发送给填写人</p>
        ) : (
          <Tabs defaultValue={basics.length > 0 ? 'basic' : 'detailed'}>
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

/* ---------------- 操作 ---------------- */

function ActionsCard({
  project,
  link,
  actionLoading,
  setActionLoading,
  onChanged,
}: {
  project: Project & { submissions: Submission[] }
  link: CollectLink | null
  actionLoading: string | null
  setActionLoading: (v: string | null) => void
  onChanged: () => void
}) {
  const { auth } = useAuth()
  const hasSubmission = project.submissions.length > 0
  // 提交梳理后（梳理中/审核中/已发布）冻结补充通道，项目基本信息不可再改
  const frozen = ['analyzing', 'in_review', 'published'].includes(project.status)
  const canSupplement = !!link && (link.status === 'submitted' || link.status === 'expired') && project.status !== 'supplementing' && !frozen
  const canCloseSupplement = !!link && link.status === 'supplementing'
  const canSubmit = hasSubmission && ['created', 'collecting', 'pending_confirm', 'supplementing'].includes(project.status)

  const doCloseSupplement = async () => {
    if (!link) return
    setActionLoading('close_supplement')
    try {
      await gql(
        `mutation($lid: bigint!, $pid: bigint!) {
          update_collect_link_by_pk(pk_columns: { id: $lid }, _set: { status: "submitted" }) { id }
          update_project_by_pk(pk_columns: { id: $pid }, _set: { status: "pending_confirm" }) { id }
        }`,
        { lid: link.id, pid: project.id },
      )
      await logOperation({
        projectId: project.id,
        operator: auth!.account.username,
        action: '关闭补充通道',
        targetType: 'collect_link',
        targetId: link.id,
      })
      toast.success('已关闭补充通道，填写人将无法再通过该链接修改')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  const doSupplement = async () => {
    if (!link) return
    setActionLoading('supplement')
    try {
      await gql(
        `mutation($lid: bigint!, $pid: bigint!, $exp: timestamptz!) {
          update_collect_link_by_pk(pk_columns: { id: $lid }, _set: { status: "supplementing", expires_at: $exp }) { id }
          update_project_by_pk(pk_columns: { id: $pid }, _set: { status: "supplementing" }) { id }
        }`,
        { lid: link.id, pid: project.id, exp: plusDaysISO(3) },
      )
      await logOperation({
        projectId: project.id,
        operator: auth!.account.username,
        action: '开启补充填写',
        targetType: 'collect_link',
        targetId: link.id,
      })
      toast.success('已开启补充模式，请将链接重新发送给填写人')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  const doSubmit = async () => {
    setActionLoading('submit')
    try {
      // 状态置为「梳理中」并触发「项目梳理」ActionFlow（异步：汇总信息 → AI 梳理 → 写回报告并转入审核）
      // 同时关闭收集链接：报告生成后项目信息不可再修改
      if (link) {
        await gql(
          `mutation($lid: bigint!) {
            update_collect_link_by_pk(pk_columns: { id: $lid }, _set: { status: "submitted" }) { id }
          }`,
          { lid: link.id },
        )
      }
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

  if (!canSupplement && !canCloseSupplement && !canSubmit) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">操作</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {canSupplement && (
          <Button variant="outline" disabled={actionLoading === 'supplement'} onClick={doSupplement}>
            {actionLoading === 'supplement' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileEdit className="mr-1.5 h-4 w-4" />}
            补充
          </Button>
        )}
        {canCloseSupplement && (
          <Button
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
            disabled={actionLoading === 'close_supplement'}
            onClick={doCloseSupplement}
          >
            {actionLoading === 'close_supplement' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <XCircle className="mr-1.5 h-4 w-4" />}
            关闭补充通道
          </Button>
        )}
        {canSubmit && (
          <Button className="bg-slate-900 hover:bg-slate-800" disabled={actionLoading === 'submit'} onClick={doSubmit}>
            {actionLoading === 'submit' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Rocket className="mr-1.5 h-4 w-4" />}
            提交梳理
          </Button>
        )}
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
  latestAnalysis,
  publishedAnalysis,
}: {
  project: Project
  latestAnalysis: Analysis | null
  publishedAnalysis: Analysis | null
}) {
  const [exportingPdf, setExportingPdf] = useState(false)

  const buildDoc = () => {
    if (!publishedAnalysis) return null
    return buildReportDocument(
      {
        enterpriseName: projectDisplayName(project),
        version: publishedAnalysis.version,
        generatedAt: formatTime(publishedAnalysis.created_at),
      },
      stripInternalRef(publishedAnalysis.content),
    )
  }

  const exportWord = () => {
    const doc = buildDoc()
    if (!doc || !publishedAnalysis) return
    downloadWord(doc, `${projectDisplayName(project)}-梳理报告-v${publishedAnalysis.version}.doc`)
  }

  const exportPdf = async () => {
    if (!publishedAnalysis) return
    setExportingPdf(true)
    try {
      await downloadPdf(
        {
          enterpriseName: projectDisplayName(project),
          version: publishedAnalysis.version,
          generatedAt: formatTime(publishedAnalysis.created_at),
        },
        stripInternalRef(publishedAnalysis.content),
        `${projectDisplayName(project)}-梳理报告-v${publishedAnalysis.version}.pdf`,
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
        <CardTitle className="flex items-center gap-2 text-base">
          梳理结果
          {latestAnalysis && (
            <span className="text-sm font-normal text-slate-500">
              v{latestAnalysis.version} · {latestAnalysis.status === 'published' ? '已梳理' : '梳理中'}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!latestAnalysis ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {project.status === 'analyzing' ? '梳理中' : '尚未提交梳理'}
          </p>
        ) : publishedAnalysis ? (
          <div className="space-y-4">
            <div className="markdown-body rounded-lg border border-slate-200 bg-white p-5">
              <h1>{projectDisplayName(project)} · 企业梳理报告</h1>
              <ReactMarkdown>{stripInternalRef(publishedAnalysis.content)}</ReactMarkdown>
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

/* ---------------- 提问区 ---------------- */

function QuestionsCard({
  project,
  questions,
  username,
  onChanged,
}: {
  project: Project
  questions: Question[]
  username: string
  onChanged: () => void
}) {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<AttachmentItem[]>([])
  const [sending, setSending] = useState(false)

  const sorted = useMemo(() => questions, [questions])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!content.trim() && files.length === 0) {
      toast.error('请输入问题内容或添加附件')
      return
    }
    setSending(true)
    try {
      await gql(
        `mutation($obj: question_insert_input!) {
          insert_question_one(object: $obj) { id }
        }`,
        {
          obj: {
            project_id: project.id,
            content: content.trim(),
            status: 'pending',
            attachments: files.length > 0 ? files : null,
          },
        },
      )
      await logOperation({
        projectId: project.id,
        operator: username,
        action: '发起提问',
        targetType: 'question',
        detail: { content: content.trim().slice(0, 100), attachments: files.length },
      })
      setContent('')
      setFiles([])
      toast.success('提问已提交，请等待回复')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquarePlus className="h-4 w-4" /> 提问
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={send} className="space-y-2">
          <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="就梳理结果或项目情况向服务团队提问…" />
          <AttachmentPicker value={files} onChange={setFiles} disabled={sending} />
          <Button type="submit" size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={sending}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            提交问题
          </Button>
        </form>

        {sorted.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">暂无提问</p>
        ) : (
          <div className="space-y-4">
            {sorted.map((q) => {
              const publishedReply = q.replies?.find((r) => r.status === 'published')
              return (
                <div key={q.id} className="rounded-lg border border-slate-200">
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{q.content}</p>
                    <QuestionStatusBadge status={q.status} />
                  </div>
                  {q.attachments && q.attachments.length > 0 && (
                    <div className="border-t border-slate-100 px-4 py-3">
                      <AttachmentView items={q.attachments} />
                    </div>
                  )}
                  <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">{formatTime(q.created_at)}</div>
                  {q.status === 'replied' && publishedReply && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-500">老师回复</p>
                        <CopyTextButton text={publishedReply.content} />
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{publishedReply.content}</p>
                      <AttachmentView items={publishedReply.attachments} />
                    </div>
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
