/**
 * ICP 备案页脚（合规要求：全站页面底部展示备案号并链接至工信部备案管理系统）
 */
export default function Beian({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`no-print py-5 text-center text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className={`transition-colors ${dark ? 'hover:text-slate-300' : 'hover:text-slate-600'}`}
      >
        粤ICP备2026107077号-1
      </a>
    </div>
  )
}
