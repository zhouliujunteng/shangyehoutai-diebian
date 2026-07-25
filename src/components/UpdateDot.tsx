/**
 * 更新红点：统一内嵌在卡片/列表项的右上角（right-2 top-2），不超出容器、不会被裁剪。
 * 外层容器需为 relative 定位。
 */
export default function UpdateDot() {
  return (
    <span className="absolute right-2 top-2 flex h-3 w-3">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white bg-red-500" />
    </span>
  )
}
