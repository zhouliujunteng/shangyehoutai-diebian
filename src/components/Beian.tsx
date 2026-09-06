/**
 * ICP 备案页脚（合规要求：全站页面底部展示备案号并链接至工信部备案管理系统）
 * fixed 定位固定在视口底部，不受各页面布局容器影响
 */
/**
 * ICP 备案页脚（合规要求：全站页面底部展示备案号并链接至工信部备案管理系统）
 * 普通文档流渲染，跟在页面内容最后，滚动到底部才可见（不用 fixed，避免遮挡内容）
 */
export default function Beian() {
  return (
    <div className="no-print py-6 text-center text-xs text-slate-400">
      <span>西安盛世蝶变创业咨询有限公司版权所有</span>
      <span className="mx-2 text-slate-300">|</span>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-slate-600"
      >
        粤ICP备2026107077号-1
      </a>
    </div>
  )
}
