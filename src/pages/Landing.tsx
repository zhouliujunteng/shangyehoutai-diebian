import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import Beian from '@/components/Beian'
import { Building2, ClipboardCheck, LineChart, MonitorSmartphone, ArrowRight, ChevronDown } from 'lucide-react'

const PROCESS = [
  { no: '01', title: '面谈收集', desc: '顾问与企业面对面深谈，全面采集经营一线信息' },
  { no: '02', title: '诊断梳理', desc: '智能梳理结合顾问经验，定位核心经营卡点' },
  { no: '03', title: '方案交付', desc: '多级审核层层把关，出具低成本、可验证的改善方案' },
  { no: '04', title: '跟进反馈', desc: '执行问题在线反馈，咨询团队逐级回复持续陪跑' },
]

/** 公司门户首页（备案合规落地页）：主体信息 + 平台业务介绍 */
export default function Landing() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* 顶部导航 */}
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-wide">项目后台</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto border-white/20 bg-white/5 text-white backdrop-blur hover:bg-white/15 hover:text-white"
            onClick={() => navigate('/login')}
          >
            客户登录 <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-[140px]" />
          <div className="absolute top-40 -left-32 h-72 w-72 rounded-full bg-cyan-400/10 blur-[100px]" />
          <div className="absolute top-24 -right-24 h-72 w-72 rounded-full bg-violet-500/10 blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(148,163,184,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.25) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 50% 35%, black, transparent)',
              WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 35%, black, transparent)',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-4xl px-5 pt-36 pb-20 text-center sm:pt-44">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs tracking-widest text-slate-300 backdrop-blur">
            经营诊断 · 方案落地 · 持续陪跑
          </div>
          <h1 className="mt-8 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            项目后台
            <span className="mx-3 text-slate-600">·</span>
            <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
              企业咨询服务平台
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl leading-8 text-slate-400">
            面向中小企业的经营管理咨询服务：深入企业一线收集经营信息，系统诊断梳理经营卡点，
            出具可落地的改善方案，并以数字化平台完成方案交付与持续跟进。
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              className="h-12 bg-white px-8 text-base font-medium text-slate-900 hover:bg-slate-200"
              onClick={() => navigate('/login')}
            >
              进入平台 <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="h-12 px-6 text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={() => document.getElementById('process')?.scrollIntoView({ behavior: 'smooth' })}
            >
              了解服务流程 <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* 服务流程 */}
      <section id="process" className="relative border-t border-white/5 bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-center text-xs tracking-[0.3em] text-slate-500">SERVICE FLOW</p>
          <h2 className="mt-3 text-center text-2xl font-bold">一次咨询的完整旅程</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((s, i) => (
              <div
                key={s.no}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-indigo-400/40 hover:bg-white/[0.06]"
              >
                <span className="bg-gradient-to-br from-indigo-300 to-cyan-300 bg-clip-text text-3xl font-bold text-transparent">
                  {s.no}
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{s.desc}</p>
                {i < PROCESS.length - 1 && (
                  <ArrowRight className="absolute top-6 right-5 h-4 w-4 text-slate-700 transition-colors group-hover:text-indigo-300 max-lg:hidden" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 业务板块 */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-center text-xs tracking-[0.3em] text-slate-500">WHAT WE DO</p>
          <h2 className="mt-3 text-center text-2xl font-bold">三大服务能力</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: ClipboardCheck,
                title: '企业管理咨询',
                desc: '顾问与企业面对面深入沟通，全面收集经营信息，逐级审核把关后出具诊断梳理方案——低成本、可验证、能落地。',
              },
              {
                icon: LineChart,
                title: '信息咨询服务',
                desc: '方案交付后持续跟进执行情况，企业可在线反馈执行问题与结果，咨询团队逐级回复，服务全程在线完成。',
              },
              {
                icon: MonitorSmartphone,
                title: '技术服务',
                desc: '自主研发「项目后台」服务平台，咨询过程数字化：信息收集、诊断报告、方案跟踪全程透明、留痕、可回溯。',
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-7 transition-transform hover:-translate-y-1"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-400/25">
                  <c.icon className="h-5 w-5 text-indigo-300" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{c.title}</h3>
                <p className="mt-2.5 text-sm leading-7 text-slate-400">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 底部 CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-indigo-600/30 via-slate-900 to-cyan-600/20 px-8 py-14 text-center">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[480px] -translate-x-1/2 rounded-full bg-indigo-400/20 blur-[90px]" />
          <h2 className="relative text-2xl font-bold">让经营问题，先被看清楚</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
            登录平台，创建企业项目，开始一次系统的经营诊断梳理。
          </p>
          <Button
            className="relative mt-7 h-12 bg-white px-8 text-base font-medium text-slate-900 hover:bg-slate-200"
            onClick={() => navigate('/login')}
          >
            进入平台 <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </section>

      <Beian />
    </div>
  )
}
