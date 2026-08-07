import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import Beian from '@/components/Beian'
import { Building2, ClipboardCheck, LineChart, MonitorSmartphone, ArrowRight, MapPin, BadgeCheck } from 'lucide-react'

/** 公司门户首页（备案合规落地页）：展示主办单位主体信息与平台业务 */
export default function Landing() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-4">
          <Building2 className="h-5 w-5" />
          <span className="font-semibold">项目后台</span>
          <span className="text-xs text-slate-500">深圳市原点秩序科技有限公司</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto border-slate-600 bg-transparent text-white hover:bg-slate-800 hover:text-white"
            onClick={() => navigate('/login')}
          >
            客户登录 <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        {/* 首屏：主体 + 业务定位 */}
        <section className="py-14 text-center">
          <p className="text-sm tracking-widest text-slate-400">深圳市原点秩序科技有限公司</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">项目后台 · 企业咨询服务平台</h1>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-500">
            面向中小企业的经营管理咨询服务：深入企业一线收集经营信息，系统诊断梳理经营卡点，
            出具可落地的改善方案，并通过数字化平台完成方案交付与持续跟进。
          </p>
          <Button className="mt-8 bg-slate-900 px-8 py-6 text-base hover:bg-slate-800" onClick={() => navigate('/login')}>
            进入平台 <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </section>

        {/* 业务板块 */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <ClipboardCheck className="h-6 w-6 text-slate-700" />
            <h2 className="mt-3 font-semibold text-slate-900">企业管理咨询</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              顾问与企业面对面深入沟通，全面收集经营信息，逐级审核把关后出具诊断梳理方案，低成本、可验证、能落地。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <LineChart className="h-6 w-6 text-slate-700" />
            <h2 className="mt-3 font-semibold text-slate-900">信息咨询服务</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              方案交付后持续跟进执行情况，企业可在线反馈执行问题与结果，咨询团队逐级回复，服务全程在线完成。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <MonitorSmartphone className="h-6 w-6 text-slate-700" />
            <h2 className="mt-3 font-semibold text-slate-900">技术服务</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              自主研发「项目后台」服务平台，咨询过程数字化：信息收集、诊断报告、方案跟踪全程透明、留痕、可回溯。
            </p>
          </div>
        </section>

        {/* 公司信息 */}
        <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <BadgeCheck className="h-5 w-5 text-slate-600" /> 公司信息
          </h2>
          <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="shrink-0 text-slate-400">公司名称</dt>
              <dd>深圳市原点秩序科技有限公司</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-slate-400">统一社会信用代码</dt>
              <dd>91440300MAKJE9B367</dd>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <dt className="shrink-0 text-slate-400"><MapPin className="mt-0.5 inline h-3.5 w-3.5" /></dt>
              <dd>深圳市龙岗区平湖街道禾花社区平新北路163号广弘美居A栋A302</dd>
            </div>
          </dl>
        </section>
      </main>

      <Beian />
    </div>
  )
}
