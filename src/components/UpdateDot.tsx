/**
 * 更新红点：默认内嵌在卡片/列表项的右上角（right-2 top-2），不超出容器、不会被裁剪。
 * 外层容器需为 relative 定位。
 * inline=true 时渲染为行内小圆点（用于表格单元格内紧跟文字）。
 */
export default function UpdateDot({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return <span className="ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-500 align-middle" />
  }
  return (
    <span className="absolute right-2 top-2 flex h-3 w-3">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white bg-red-500" />
    </span>
  )
}
