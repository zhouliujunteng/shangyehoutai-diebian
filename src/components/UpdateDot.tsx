/**
 * 更新红点：卡片/列表项右上角，有新的未查看动态时显示。
 * 外层容器需为 relative 定位。
 */
export default function UpdateDot() {
  return (
    <span className="absolute -right-1 -top-1 flex h-3 w-3">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white bg-red-500" />
    </span>
  )
}
