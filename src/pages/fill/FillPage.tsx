import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { gql } from '@/lib/graphql'
import { BASIC_GROUPS, DETAILED_SECTIONS } from '@/lib/forms'
import type { CollectLink, Submission } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Building2, CheckCircle2, Loader2, XCircle, Clock, FileCheck } from 'lucide-react'

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'already' }
  | { kind: 'form' }
  | { kind: 'basic_done' }
  | { kind: 'done' }

type FormVersion = 'detailed' | 'basic'

interface LinkInfo extends CollectLink {
  project?: { id: number; name: string; status: string } | null
}

export default function FillPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [link, setLink] = useState<LinkInfo | null>(null)
  const [supplementMode, setSupplementMode] = useState(false)
  const [version, setVersion] = useState<FormVersion>('detailed')
  const [prefill, setPrefill] = useState<Record<string, string>>({})
  const [prefillDetailed, setPrefillDetailed] = useState<Record<string, string>>({})
  const [prefillName, setPrefillName] = useState('')
  const [prefillContact, setPrefillContact] = useState('')

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' })
      return
    }
    ;(async () => {
      try {
        const data = await gql<{ collect_link: LinkInfo[] }>(
          `query($token: String!) {
            collect_link(where: { token: { _eq: $token } }, limit: 1) {
              id token status expires_at project_id
              project { id name status }
            }
          }`,
          { token },
          false,
        )
        const lk = data.collect_link[0]
        if (!lk) {
          setState({ kind: 'invalid' })
          return
        }
        const expired = lk.status === 'expired' || new Date(lk.expires_at).getTime() < Date.now()
        if (expired) {
          setLink(lk)
          setState({ kind: 'expired' })
          return
        }
        if (lk.status === 'submitted') {
          setLink(lk)
          setState({ kind: 'already' })
          return
        }
        setLink(lk)
        if (lk.status === 'supplementing') {
          // 补充/修改模式：预填两版表单的最新提交，默认回到基础版
          setSupplementMode(true)
          setVersion('basic')
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
            if (latestBasic) {
              setPrefill(latestBasic.answers ?? {})
              setPrefillName(latestBasic.filler_name ?? '')
              setPrefillContact(latestBasic.filler_contact ?? '')
            }
            const latestDetailed = sub.submission.find((s) => s.form_type === 'detailed')
            if (latestDetailed) {
              setPrefillDetailed(latestDetailed.answers ?? {})
            }
            // 默认打开已提交过的那个版本，避免填写人看到空表单以为内容丢失
            if (!latestBasic && latestDetailed) {
              setVersion('detailed')
            }
          } catch {
            /* 预填失败不阻塞 */
          }
        }
        setState({ kind: 'form' })
      } catch {
        setState({ kind: 'invalid' })
      }
    })()
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 px-4 py-4 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Building2 className="h-5 w-5" />
          <span className="font-semibold">企业信息收集</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        {state.kind === 'loading' && (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        )}
        {state.kind === 'invalid' && (
          <TipCard icon={<XCircle className="h-10 w-10 text-red-400" />} title="链接无效" desc="该收集链接不存在，请与您的咨询顾问确认链接是否正确。" />
        )}
        {state.kind === 'expired' && (
          <TipCard icon={<Clock className="h-10 w-10 text-amber-400" />} title="链接已过期" desc="该收集链接已超过有效期，请联系您的咨询顾问重新签发链接。" />
        )}
        {state.kind === 'already' && (
          <TipCard icon={<FileCheck className="h-10 w-10 text-blue-400" />} title="已提交" desc="您已提交过信息，无需重复填写。如需补充，请联系您的咨询顾问开启补充通道。" />
        )}
        {state.kind === 'form' && link && (
          <div className="space-y-6">
            {/* 版本切换：默认详细版（推荐），可切回基础版 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setVersion('detailed')}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    version === 'detailed' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  详细版（推荐）
                </button>
                <button
                  type="button"
                  onClick={() => setVersion('basic')}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    version === 'basic' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  基础版（快速填写）
                </button>
              </div>
              <p className="mt-2.5 text-center text-xs text-slate-400">
                {version === 'detailed'
                  ? '信息越详细，越有助于为您提供更精准的服务（42 题，可分部分填写）'
                  : '只需 3 分钟填写核心信息，提交后仍可继续补填详细版'}
              </p>
            </div>

            {/* 两个表单保持挂载，切换不丢失已填内容 */}
            <div className={version === 'detailed' ? '' : 'hidden'}>
              <DetailedForm
                link={link}
                supplementMode={supplementMode}
                prefill={prefillDetailed}
                prefillName={prefillName}
                prefillContact={prefillContact}
                onDone={() => setState({ kind: 'done' })}
              />
            </div>
            <div className={version === 'basic' ? '' : 'hidden'}>
              <BasicForm
                link={link}
                supplementMode={supplementMode}
                prefill={prefill}
                prefillName={prefillName}
                prefillContact={prefillContact}
                onDone={() => setState({ kind: 'basic_done' })}
              />
            </div>
          </div>
        )}
        {state.kind === 'basic_done' && link && (
          <div className="space-y-6">
            <TipCard
              icon={<CheckCircle2 className="h-10 w-10 text-green-500" />}
              title={supplementMode ? '补充提交成功' : '基础信息提交成功'}
              desc="感谢您的填写！信息越详细，越有助于为您提供更精准的服务。推荐继续填写《企业全面诊断信息收集表》（42 题，约 15 分钟）。"
            />
            <div className="flex flex-col gap-3">
              <Button
                className="w-full bg-slate-900 hover:bg-slate-800"
                onClick={() => {
                  setVersion('detailed')
                  setState({ kind: 'form' })
                }}
              >
                继续填写详细版（推荐）
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setState({ kind: 'done' })}>
                跳过，完成填写
              </Button>
            </div>
          </div>
        )}
        {state.kind === 'done' && (
          <TipCard
            icon={<CheckCircle2 className="h-10 w-10 text-green-500" />}
            title="提交完成"
            desc="您的信息已提交成功，感谢您的填写。"
          />
        )}
      </main>
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

/* ---------------- 基础版表单 ---------------- */

function BasicForm({
  link,
  supplementMode,
  prefill,
  prefillName,
  prefillContact,
  onDone,
}: {
  link: LinkInfo
  supplementMode: boolean
  prefill: Record<string, string>
  prefillName: string
  prefillContact: string
  onDone: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(prefill)
  const [fillerName, setFillerName] = useState(prefillName)
  const [fillerContact, setFillerContact] = useState(prefillContact)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }))

  const onSubmit = async () => {
    // 全部题目必填
    for (const g of BASIC_GROUPS) {
      for (const f of g.fields) {
        if (!values[f.key]?.trim()) {
          setError(`请填写「${f.key}」（所有题目均为必填）`)
          return
        }
      }
    }
    if (!fillerName.trim()) {
      setError('请填写您的称呼')
      return
    }
    if (!fillerContact.trim()) {
      setError('请填写联系方式')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const answers: Record<string, string> = {}
      for (const g of BASIC_GROUPS) {
        for (const f of g.fields) {
          answers[f.key] = values[f.key].trim()
        }
      }
      // 同一项目的同一表单类型只保留一条提交：已有则更新原记录，否则新建
      const exist = await gql<{ submission: { id: number }[] }>(
        `query($pid: bigint!) {
          submission(where: { project_id: { _eq: $pid }, form_type: { _eq: "basic" } }, order_by: { id: desc }, limit: 1) { id }
        }`,
        { pid: link.project_id },
        false,
      )
      const existId = exist.submission[0]?.id
      if (existId) {
        await gql(
          `mutation($id: bigint!, $set: submission_set_input!) {
            update_submission_by_pk(pk_columns: { id: $id }, _set: $set) { id }
          }`,
          {
            id: existId,
            set: {
              answers,
              filler_name: fillerName.trim(),
              filler_contact: fillerContact.trim(),
              is_supplement: supplementMode,
            },
          },
          false,
        )
      } else {
        await gql(
          `mutation($obj: submission_insert_input!) {
            insert_submission_one(object: $obj) { id }
          }`,
          {
            obj: {
              project_id: link.project_id,
              form_type: 'basic',
              filler_name: fillerName.trim(),
              filler_contact: fillerContact.trim(),
              answers,
              is_supplement: supplementMode,
            },
          },
          false,
        )
      }
      // 项目尚未命名时，用企业名称回填项目名称
      const projectSet: Record<string, unknown> = { status: 'pending_confirm' }
      if (!link.project?.name?.trim() && answers['企业名称']) {
        projectSet.name = answers['企业名称']
      }
      await gql(
        `mutation($id: bigint!, $pid: bigint!, $set: project_set_input!) {
          update_collect_link_by_pk(pk_columns: { id: $id }, _set: { status: "submitted" }) { id }
          update_project_by_pk(pk_columns: { id: $pid }, _set: $set) { id }
        }`,
        { id: link.id, pid: link.project_id, set: projectSet },
        false,
      )
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
        <h1 className="text-lg font-bold text-slate-900">
          {link.project?.name ?? '企业信息收集表'}
          {supplementMode && <span className="ml-2 text-sm font-normal text-orange-600">（补充模式：已为您回填原内容）</span>}
        </h1>
        <p className="mt-1 text-sm text-slate-500">请填写以下基础信息，所有题目均为必填。</p>
      </div>

      {BASIC_GROUPS.map((group) => (
        <section key={group.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-800">{group.title}</h2>
          <div className="space-y-4">
            {group.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-sm text-slate-700">
                  {f.key}
                  {f.required && <span className="ml-0.5 text-red-500">*</span>}
                </Label>
                {f.type === 'input' ? (
                  <Input value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
                ) : (
                  <Textarea rows={3} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
                )}
              </div>
            ))}
          </div>
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
            <Label className="text-sm text-slate-700">
              联系方式<span className="ml-0.5 text-red-500">*</span>
            </Label>
            <Input value={fillerContact} onChange={(e) => setFillerContact(e.target.value)} placeholder="手机号或微信" />
          </div>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
      <Button
        className="w-full bg-slate-900 py-6 text-base hover:bg-slate-800"
        disabled={submitting}
        onClick={onSubmit}
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {supplementMode ? '提交补充信息' : '提交'}
      </Button>
    </div>
  )
}

/* ---------------- 详细版表单 ---------------- */

function DetailedForm({
  link,
  supplementMode,
  prefill,
  prefillName,
  prefillContact,
  onDone,
}: {
  link: LinkInfo
  supplementMode: boolean
  prefill: Record<string, string>
  prefillName: string
  prefillContact: string
  onDone: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(prefill)
  const [fillerName, setFillerName] = useState(prefillName)
  const [fillerContact, setFillerContact] = useState(prefillContact)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const total = useMemo(() => DETAILED_SECTIONS.reduce((n, s) => n + s.questions.length, 0), [])
  const filled = useMemo(() => Object.values(values).filter((v) => v.trim()).length, [values])

  const onSubmit = async () => {
    // 全部题目必填：定位第一题未填的位置
    let qNo = 0
    for (const s of DETAILED_SECTIONS) {
      for (const q of s.questions) {
        qNo += 1
        if (!values[q]?.trim()) {
          setError(`第 ${qNo} 题「${q}」尚未填写（所有题目均为必填）`)
          return
        }
      }
    }
    if (!fillerName.trim()) {
      setError('请填写您的称呼')
      return
    }
    if (!fillerContact.trim()) {
      setError('请填写联系方式')
      return
    }
    const answers: Record<string, string> = {}
    DETAILED_SECTIONS.forEach((s) =>
      s.questions.forEach((q) => {
        answers[q] = values[q].trim()
      }),
    )
    setError('')
    setSubmitting(true)
    try {
      // 同一项目的同一表单类型只保留一条提交：已有则更新原记录，否则新建
      const exist = await gql<{ submission: { id: number }[] }>(
        `query($pid: bigint!) {
          submission(where: { project_id: { _eq: $pid }, form_type: { _eq: "detailed" } }, order_by: { id: desc }, limit: 1) { id }
        }`,
        { pid: link.project_id },
        false,
      )
      const existId = exist.submission[0]?.id
      if (existId) {
        await gql(
          `mutation($id: bigint!, $set: submission_set_input!) {
            update_submission_by_pk(pk_columns: { id: $id }, _set: $set) { id }
          }`,
          {
            id: existId,
            set: {
              answers,
              filler_name: fillerName.trim(),
              filler_contact: fillerContact.trim(),
              is_supplement: supplementMode,
            },
          },
          false,
        )
      } else {
        await gql(
          `mutation($obj: submission_insert_input!) {
            insert_submission_one(object: $obj) { id }
          }`,
          {
            obj: {
              project_id: link.project_id,
              form_type: 'detailed',
              filler_name: fillerName.trim(),
              filler_contact: fillerContact.trim(),
              answers,
              is_supplement: supplementMode,
            },
          },
          false,
        )
      }
      // 详细版提交同样关闭链接（一次提交规则）；项目未命名时用「公司全称」回填
      const projectSet: Record<string, unknown> = { status: 'pending_confirm' }
      if (!link.project?.name?.trim() && answers['公司全称']) {
        projectSet.name = answers['公司全称']
      }
      await gql(
        `mutation($id: bigint!, $pid: bigint!, $set: project_set_input!) {
          update_collect_link_by_pk(pk_columns: { id: $id }, _set: { status: "submitted" }) { id }
          update_project_by_pk(pk_columns: { id: $pid }, _set: $set) { id }
        }`,
        { id: link.id, pid: link.project_id, set: projectSet },
        false,
      )
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  let qNo = 0
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">企业全面诊断信息收集表</h1>
        <p className="mt-1 text-sm text-slate-500">请详细填写，信息越详细越有助于为您提供更精准的服务。所有题目均为必填。</p>
        <p className="mt-2 text-xs text-slate-400">
          已填写 {filled} / {total} 题
        </p>
      </div>

      <Accordion type="multiple" defaultValue={['sec-0']} className="space-y-3">
        {DETAILED_SECTIONS.map((sec, si) => {
          const startNo = qNo
          qNo += sec.questions.length
          return (
            <AccordionItem key={sec.title} value={`sec-${si}`} className="rounded-xl border border-slate-200 bg-white px-5 shadow-sm">
              <AccordionTrigger className="text-base font-semibold text-slate-800">
                {sec.title}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  （{startNo + 1}–{startNo + sec.questions.length} 题）
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pb-2">
                  {sec.questions.map((q, qi) => (
                    <div key={q} className="space-y-1.5">
                      <Label className="text-sm text-slate-700">
                        {startNo + qi + 1}. {q}
                        <span className="ml-0.5 text-red-500">*</span>
                      </Label>
                      <Textarea
                        rows={2}
                        value={values[q] ?? ''}
                        onChange={(e) => setValues((prev) => ({ ...prev, [q]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>

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
            <Label className="text-sm text-slate-700">
              联系方式<span className="ml-0.5 text-red-500">*</span>
            </Label>
            <Input value={fillerContact} onChange={(e) => setFillerContact(e.target.value)} placeholder="手机号或微信" />
          </div>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-3">
        <Button className="w-full bg-slate-900 py-6 text-base hover:bg-slate-800" disabled={submitting} onClick={onSubmit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          提交详细版
        </Button>
        <Button variant="outline" className="w-full" onClick={onDone}>
          跳过
        </Button>
      </div>
    </div>
  )
}
