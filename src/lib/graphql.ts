const ENDPOINT: string =
  import.meta.env.VITE_ZION_GRAPHQL_URL ||
  'https://zion-app.functorz.com/zero/k5PBKyGXkgk/api/graphql-v2'

/** 「项目梳理」ActionFlow ID（Zion 后端，异步执行：汇总信息 → AI 梳理 → 写回报告） */
export const ANALYZE_FLOW_ID = '7d097c45-ae63-4597-8444-e5598ab7fbd5'

/** 「后台账号管理」ActionFlow ID（同步执行：为审核员账号绑定服务端角色；仅超管/一级审核员可调用） */
export const ACCOUNT_ADMIN_FLOW_ID = 'ef7f3f19-7ad1-446a-a579-53d8b2121a8f'

/** 「生成回复草稿」ActionFlow ID（异步执行：汇总企业信息+梳理方案+历史问答 → AI 起草回复） */
export const REPLY_DRAFT_FLOW_ID = '0a83c789-2d67-45ad-809e-e267d7194bde'

/** 「局部修改报告」ActionFlow ID（异步执行：定位片段 → AI 只改写该片段 → 写回新版本） */
export const PARTIAL_EDIT_FLOW_ID = '139c9fc1-2cd4-46d6-bb5e-f28a52fa6fa3'

/** 同步调用行为流（按最新版本），失败抛错 */
export async function invokeActionFlow(flowId: string, args: Record<string, unknown>): Promise<unknown> {
  const data = await gql<{ fz_invoke_action_flow_default_by_latest_version: unknown }>(
    `mutation($fid: String!, $args: Json!) {
      fz_invoke_action_flow_default_by_latest_version(actionFlowId: $fid, args: $args)
    }`,
    { fid: flowId, args },
  )
  return data.fz_invoke_action_flow_default_by_latest_version
}

/** 创建异步行为流任务，返回任务 ID */
export async function createActionFlowTask(flowId: string, args: Record<string, unknown>): Promise<number> {
  const data = await gql<{ fz_create_action_flow_task: number }>(
    `mutation($fid: String!, $args: Json!) {
      fz_create_action_flow_task(actionFlowId: $fid, args: $args)
    }`,
    { fid: flowId, args },
  )
  return data.fz_create_action_flow_task
}

/** 轮询异步行为流任务直到完成，返回输出对象；失败或超时抛错 */
export async function waitActionFlowResult(
  taskId: number,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  const interval = opts.intervalMs ?? 2500
  const timeout = opts.timeoutMs ?? 180000
  const deadline = Date.now() + timeout
  for (;;) {
    const data = await gql<{ fz_action_flow_result: { status: string; output: Record<string, unknown> | null } | null }>(
      `query($t: Long!) {
        fz_action_flow_result(taskId: $t) { status output }
      }`,
      { t: taskId },
    )
    const r = data.fz_action_flow_result
    if (r?.status === 'COMPLETED') return r.output ?? {}
    // 终止态判断：只有明确的失败/取消才算失败；RUNNING/PENDING/PROCESSING 等一律继续轮询
    if (r && /fail|error|cancel/i.test(r.status)) {
      throw new Error(`任务执行失败（${r.status}），请重试`)
    }
    if (Date.now() > deadline) throw new Error('生成超时，请稍后重试')
    await new Promise((res) => setTimeout(res, interval))
  }
}

const AUTH_KEY = 'xa_auth'

export function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw).token ?? null
  } catch {
    return null
  }
}

export interface GqlErrorItem {
  message: string
  extensions?: Record<string, unknown>
}

export class GqlError extends Error {
  errors: GqlErrorItem[]
  constructor(errors: GqlErrorItem[]) {
    super(errors.map((e) => e.message).join('；'))
    this.name = 'GqlError'
    this.errors = errors
  }
}

/** 执行 GraphQL 请求，自动附带 Authorization 头，统一错误处理 */
export async function gql<T = Record<string, any>>(
  query: string,
  variables: Record<string, unknown> = {},
  withAuth = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withAuth) {
    const token = getStoredToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new Error('网络连接失败，请检查网络后重试')
  }
  let json: { data?: T; errors?: GqlErrorItem[] }
  try {
    json = await res.json()
  } catch {
    throw new Error(`服务响应异常（HTTP ${res.status}）`)
  }
  if (json.errors && json.errors.length > 0) {
    throw new GqlError(json.errors)
  }
  if (!json.data) throw new Error('服务返回数据为空')
  return json.data
}

/** 写操作日志（尽力而为，失败不阻塞主流程） */
export async function logOperation(params: {
  projectId: number | string
  operator: string
  action: string
  targetType?: string
  targetId?: number | string
  detail?: Record<string, unknown>
}) {
  try {
    await gql(
      `mutation($obj: operation_log_insert_input!) {
        insert_operation_log_one(object: $obj) { id }
      }`,
      {
        obj: {
          project_id: params.projectId,
          operator: params.operator,
          action: params.action,
          target_type: params.targetType ?? null,
          target_id: params.targetId != null ? String(params.targetId) : null,
          detail: params.detail ?? null,
        },
      },
    )
  } catch (e) {
    console.warn('operation_log 写入失败', e)
  }
}
