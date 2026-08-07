/**
 * ICP 备案页脚（合规要求：全站页面底部展示备案号并链接至工信部备案管理系统）
 * fixed 定位固定在视口底部，不受各页面布局容器影响
 */
export default function Beian() {
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-20 py-3 text-center text-xs text-slate-400">
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto transition-colors hover:text-slate-600"
      >
        粤ICP备2026107077号-1
      </a>
    </div>
  )
}
