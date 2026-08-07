import { useEffect, useState, type ReactNode } from 'react'
import { gql } from '@/lib/graphql'
import { BASIC_GROUPS, DETAILED_SECTIONS } from '@/lib/forms'
import { FEEDBACK_OPTION_LABEL, FEEDBACK_OPTION_DESC, FEEDBACK_OPTION_ORDER } from '@/lib/labels'
import type { FeedbackLink, FeedbackOption, FormSupplement, Submission } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import Beian from '@/components/Beian'
import { MessageSquarePlus, CheckCircle2, Loader2, XCircle, Clock, FileCheck, Ban } from 'lucide-react'

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'closed' }
  | { kind: 'already' }
  | { kind: 'form' }
  | { kind: 'done' }

interface LinkInfo extends FeedbackLink {
  project?: { id: number; name: string } | null
}

/** 方案反馈填写页（/f/:token 命中反馈链接时渲染） */
export default function FeedbackFillPage({ token }: { token: string }) {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [link, setLink] = useState<LinkInfo | null>(null)
  const [basicAnswers, setBasicAnswers] = useState<Record<string, string>>({})
  const [detailedAnswers, setDetailedAnswers] = useState<Record<string, string>>({})
  const [supplements, setSupplements] = useState<FormSupplement>({ basic: {}, detailed: {} })
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [fillerName, setFillerName] = useState('')
  const [fillerContact, setFillerContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const data = await gql<{ feedback_link: LinkInfo[] }>(
          `query($token: String!) {
            feedback_link(where: { token: { _eq: $token } }, limit: 1) {
              id token options status expires_at project_id
              project { id name }
            }
          }`,
          { token },
          false,
        )
        const lk = data.feedback_link[0]
        if (!lk) {
          setState({ kind: 'invalid' })
          return
        }
        setLink(lk)
        if (lk.status === 'closed') {
          setState({ kind: 'closed' })
          return
        }
        if (lk.status === 'submitted' || lk.status === 'done') {
          setState({ kind: 'already' })
          return
        }
        const expired = new Date(lk.expires_at).getTime() < Date.now()
        if (expired) {
          setState({ kind: 'expired' })
          return
        }
        // 勾选了补充表单时，加载该项目已提交的收集表内容（只读展示）
        if ((lk.options ?? []).includes('form_supplement')) {
          try {
            const sub = await gql<{ submission: Submission[] }>(
              `query($pid: bigint!) {
                submission(where: { project_id: { _eq: $pid } }, order_by: { id: desc }) {
                  id form_type filler_name filler_contact answers
                }
              }`,
              { pid: lk.project_id },
              false,
            )
            const latestBasic = sub.submission.find((s) => s.form_type === 'basic')
            const latestDetailed = sub.submission.find((s) => s.form_type === 'detailed')
            if (latestBasic) {
              setBasicAnswers(latestBasic.answers ?? {})
              setFillerName(latestBasic.filler_name ?? '')
              setFillerContact(latestBasic.filler_contact ?? '')
            }
            if (latestDetailed) {
              setDetailedAnswers(latestDetailed.answers ?? {})
              if (!latestBasic) {
                setFillerName(latestDetailed.filler_name ?? '')
                setFillerContact(latestDetailed.filler_contact ?? '')
              }
            }
          } catch {
            /* 加载失败不阻塞 */
          }
        }
        setState({ kind: 'form' })
      } catch {
        setState({ kind: 'invalid' })
      }
    })()
  }, [token])

  const options = (link?.options ?? []) as FeedbackOption[]
  const orderedOptions = FEEDBACK_OPTION_ORDER.filter((o) => options.includes(o))

  const setSupplement = (formType: string, field: string, v: string) =>
    setSupplements((prev) => ({ ...prev, [formType]: { ...(prev[formType] ?? {}), [field]: v } }))

  const onSubmit = async () => {
    if (!link) return
    // 至少填写一项内容
    const hasSupplement = Object.values(supplements).some((m) =>
      Object.values(m ?? {}).some((v) => v.trim()),
    )
    const hasText = orderedOptions
      .filter((o) => o !== 'form_supplement')
      .some((o) => (texts[o] ?? '').trim())
    if (!hasSupplement && !hasText) {
      setError('请至少填写一项反馈内容')
      return
    }
    if (!fillerName.trim()) {
      setError('请填写您的称呼')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      // 只保留有内容的补充项
      const cleanSupplement: FormSupplement = {}
      for (const [ft, m] of Object.entries(supplements)) {
        const cleaned = Object.fromEntries(Object.entries(m ?? {}).filter(([, v]) => v.trim()))
        if (Object.keys(cleaned).length > 0) cleanSupplement[ft] = cleaned
      }
      await gql(
        `mutation($obj: feedback_submission_insert_input!, $lid: bigint!) {
          insert_feedback_submission_one(object: $obj) { id }
          update_feedback_link_by_pk(pk_columns: { id: $lid }, _set: { status: "submitted" }) { id }
        }`,
        {
          obj: {
            link_id: link.id,
            form_supplement: Object.keys(cleanSupplement).length > 0 ? cleanSupplement : null,
            info_supplement: options.includes('info_supplement') ? (texts.info_supplement ?? '').trim() || null : null,
            execution_issues: options.includes('execution_issues') ? (texts.execution_issues ?? '').trim() || null : null,
            detail_request: options.includes('detail_request') ? (texts.detail_request ?? '').trim() || null : null,
            result_feedback: options.includes('result_feedback') ? (texts.result_feedback ?? '').trim() || null : null,
            filler_name: fillerName.trim(),
            filler_contact: fillerContact.trim() || null,
            status: 'submitted',
          },
          lid: link.id,
        },
        false,
      )
      setState({ kind: 'done' })
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const renderSupplementBlock = (formType: string, title: string, answers: Record<string, string>, fieldOrder?: string[]) => {
    const keys = fieldOrder ?? Object.keys(answers)
    const visible = keys.filter((k) => answers[k]?.trim())
    if (visible.length === 0) return null
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <p className="mt-1 text-xs text-slate-400">您此前填写的内容不可修改，如想补充或更正，请在该项下方的补充框中填写。</p>
        <div className="mt-4 space-y-5">
          {visible.map((k) => (
            <div key={k} className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">{k}</Label>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm whitespace-pre-wrap text-slate-600 border border-slate-100">
                {answers[k]}
              </div>
              <Textarea
                rows={2}
                value={supplements[formType]?.[k] ?? ''}
                onChange={(e) => setSupplement(formType, k, e.target.value)}
                placeholder="在此补充（选填）"
                className="border-dashed"
              />
            </div>
          ))}
        </div>
      </section>
    )
  }

  const basicFieldOrder = BASIC_GROUPS.flatMap((g) => g.fields.map((f) => f.key))
  const detailedFieldOrder = DETAILED_SECTIONS.flatMap((s) => s.questions)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 px-4 py-4 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <MessageSquarePlus className="h-5 w-5" />
          <span className="font-semibold">方案反馈</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        {state.kind === 'loading' && (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        )}
        {state.kind === 'invalid' && (
          <TipCard icon={<XCircle className="h-10 w-10 text-red-400" />} title="链接无效" desc="该反馈链接不存在，请与您的咨询顾问确认链接是否正确。" />
        )}
        {state.kind === 'closed' && (
          <TipCard icon={<Ban className="h-10 w-10 text-slate-400" />} title="链接已关闭" desc="该反馈链接已被您的咨询顾问撤回，如有需要请联系顾问重新签发。" />
        )}
        {state.kind === 'expired' && (
          <TipCard icon={<Clock className="h-10 w-10 text-amber-400" />} title="链接已过期" desc="该反馈链接已超过有效期，请联系您的咨询顾问重新签发。" />
        )}
        {state.kind === 'already' && (
          <TipCard icon={<FileCheck className="h-10 w-10 text-blue-400" />} title="已提交" desc="您已提交过反馈，无需重复填写。如有新情况，请联系您的咨询顾问。" />
        )}
        {state.kind === 'done' && (
          <TipCard icon={<CheckCircle2 className="h-10 w-10 text-green-500" />} title="反馈提交成功" desc="感谢您的反馈！您的咨询顾问确认后，我们会尽快给您回复。" />
        )}
        {state.kind === 'form' && link && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h1 className="text-lg font-bold text-slate-900">{link.project?.name ?? '方案反馈'}</h1>
              <p className="mt-1 text-sm text-slate-500">
                您的咨询顾问邀请您就方案反馈以下 {orderedOptions.length} 项内容，均可选填，填好哪项写哪项。
              </p>
              <ul className="mt-2 space-y-1">
                {orderedOptions.map((o) => (
                  <li key={o} className="text-xs text-slate-400">
                    · {FEEDBACK_OPTION_LABEL[o]}：{FEEDBACK_OPTION_DESC[o]}
                  </li>
                ))}
              </ul>
            </div>

            {options.includes('form_supplement') && (
              <>
                {Object.keys(basicAnswers).length === 0 && Object.keys(detailedAnswers).length === 0 ? (
                  <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400 shadow-sm">
                    暂无已提交的收集表内容可供补充。
                  </section>
                ) : (
                  <>
                    {renderSupplementBlock('detailed', '补充表单 · 详细版收集表', detailedAnswers, detailedFieldOrder)}
                    {renderSupplementBlock('basic', '补充表单 · 基础版收集表', basicAnswers, basicFieldOrder)}
                  </>
                )}
              </>
            )}

            {orderedOptions
              .filter((o) => o !== 'form_supplement')
              .map((o) => (
                <section key={o} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-slate-800">{FEEDBACK_OPTION_LABEL[o]}</h2>
                  <p className="mt-1 text-xs text-slate-400">{FEEDBACK_OPTION_DESC[o]}</p>
                  <Textarea
                    rows={5}
                    className="mt-3"
                    value={texts[o] ?? ''}
                    onChange={(e) => setTexts((prev) => ({ ...prev, [o]: e.target.value }))}
                    placeholder="在此填写（选填）"
                  />
                </section>
              ))}

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-800">填写人信息</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm text-slate-700">
                    您的称呼<span className="ml-0.5 text-red-500">*</span>
                  </Label>
                  <Input value={fillerName} onChange={(e) => setFillerName(e.target.value)} placeholder="如：王总" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-slate-700">联系方式</Label>
                  <Input value={fillerContact} onChange={(e) => setFillerContact(e.target.value)} placeholder="手机号或微信（选填）" />
                </div>
              </div>
            </section>

            {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
            <Button className="w-full bg-slate-900 py-6 text-base hover:bg-slate-800" disabled={submitting} onClick={onSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              提交反馈
            </Button>
            <p className="text-center text-xs text-slate-400">提交后不可修改，请确认内容无误</p>
          </div>
        )}
      </main>
      <Beian />
    </div>
  )
}

function TipCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-4 flex justify-center">{icon}</div>
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
    </div>
  )
}
