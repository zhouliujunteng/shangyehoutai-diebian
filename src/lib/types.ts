export type AccountType = 'super_admin' | 'client' | 'reviewer'
export type AccountStatus = 'active' | 'disabled'

export interface Account {
  id: number | string
  username: string
  /** 用户自定义昵称（未设置时各处展示用户名） */
  nickname?: string | null
  /** 绑定的手机号（改密码的前置条件） */
  fz_phone_number?: string | null
  account_type: AccountType
  reviewer_level: number | null
  project_quota: number
  status: AccountStatus
}

/** 账号展示名：优先昵称，未设置回退用户名 */
export function accountDisplayName(a?: { username: string; nickname?: string | null } | null): string {
  return a?.nickname?.trim() || a?.username || ''
}

export type ProjectStatus =
  | 'created'
  | 'collecting'
  | 'pending_confirm'
  | 'supplementing'
  | 'submitted'
  | 'analyzing'
  | 'in_review'
  | 'published'

export interface Project {
  id: number
  /** 项目名称：创建时为空，由填写人提交收集表后自动回填（企业名称/公司全称） */
  name: string
  /** 客户对项目/收集链接的备注（仅内部可见） */
  remark?: string | null
  status: ProjectStatus
  review_level: number | null
  /** 当前展示版本指针：指向哪份梳理报告，全端以此为准（客户端仅在其已发布时展示） */
  current_analysis_id?: number | null
  owner_id?: number | string
  created_at?: string
  owner?: { username: string } | null
}

/** 项目显示名：优先企业名称，其次备注，兜底未命名 */
export function projectDisplayName(p: { name?: string | null; remark?: string | null }): string {
  return p.name?.trim() || p.remark?.trim() || '未命名项目'
}

export type CollectLinkStatus = 'active' | 'submitted' | 'supplementing' | 'expired'

export interface CollectLink {
  id: number
  token: string
  status: CollectLinkStatus
  expires_at: string
  project_id: number
  created_at?: string
}

export type FormType = 'basic' | 'detailed'

export interface Submission {
  id: number
  form_type: FormType
  filler_name: string | null
  filler_contact: string | null
  answers: Record<string, string> | null
  is_supplement: boolean
  project_id: number
  created_at?: string
}

export type ReviewStatus = 'pending_setup' | 'pending_l3' | 'pending_l2' | 'pending_l1' | 'published' | 'superseded'

export interface Analysis {
  id: number
  version: number
  content: string
  /** 思想来源（仅审核人员可见，客户端无此列权限） */
  internal_ref?: string | null
  status: ReviewStatus
  current_stage: number
  /** 终审通过时间（发布时间）；未发布为空 */
  published_at?: string | null
  project_id: number
  created_at?: string
  project?: { id: number; name: string; current_analysis_id?: number | null } | null
}

export interface ReviewAssignment {
  id: number
  level: number
  reviewer: string
  project_id: number
}

export interface ReviewRecord {
  id: number
  target_type: 'analysis' | 'reply' | 'feedback_reply'
  target_id: string
  level: number
  reviewer: string
  decision: 'approved' | 'reanalyze' | 'returned'
  comment: string | null
  project_id: number
  created_at?: string
}

export type QuestionStatus = 'pending' | 'in_review' | 'replied'

export interface AttachmentPayload {
  name: string
  mime: string
  size: number
  data: string
}

export interface Question {
  id: number
  content: string
  status: QuestionStatus
  project_id: number
  attachments?: AttachmentPayload[] | null
  created_at?: string
  project?: { id: number; name: string } | null
  replies?: Reply[]
}

export interface Reply {
  id: number
  content: string
  status: ReviewStatus | 'published'
  current_stage: number
  question_id: number
  attachments?: AttachmentPayload[] | null
  created_at?: string
}

export interface OperationLog {
  id: number
  target_type: string | null
  target_id: string | null
  operator: string
  action: string
  detail: Record<string, unknown> | null
  project_id: number
  created_at?: string
}

/* ---------- 音频转写填表 ---------- */

export type AudioRecordStatus = 'uploaded' | 'processing' | 'done' | 'failed'

export interface AudioRecord {
  id: number
  file_name: string | null
  audio_url: string | null
  file_id: string | null
  transcript: string | null
  status: AudioRecordStatus
  error_message: string | null
  project_id: number
  created_at?: string
}

/* ---------- 方案反馈（反馈链接机制，替代旧提问/回复） ---------- */

/** 反馈选项 key */
export type FeedbackOption =
  | 'form_supplement'   // ① 补充表单
  | 'info_supplement'   // ② 方案过程中的补充信息
  | 'execution_issues'  // ③ 执行过程中遇到的问题
  | 'detail_request'    // ④ 方案中需要再具体陈述的细节
  | 'result_feedback'   // ⑤ 执行后的反馈结果

export type FeedbackLinkStatus = 'active' | 'submitted' | 'closed' | 'done'

export interface FeedbackLink {
  id: number
  token: string
  options: FeedbackOption[]
  status: FeedbackLinkStatus
  expires_at: string
  project_id: number
  created_at?: string
  feedback_submissions?: FeedbackSubmission[]
}

export type FeedbackSubmissionStatus = 'submitted' | 'confirmed' | 'replied'

/** 表单补充内容：{ basic: { 字段名: 补充文本 }, detailed: { 字段名: 补充文本 } } */
export type FormSupplement = Record<string, Record<string, string>>

export interface FeedbackSubmission {
  id: number
  form_supplement: FormSupplement | null
  info_supplement: string | null
  execution_issues: string | null
  detail_request: string | null
  result_feedback: string | null
  filler_name: string | null
  filler_contact: string | null
  status: FeedbackSubmissionStatus
  link_id: number
  created_at?: string
  feedback_replies?: FeedbackReply[]
}

export interface FeedbackReply {
  id: number
  version: number
  content: string
  status: ReviewStatus | 'draft' | 'published'
  current_stage: number
  internal_ref?: string | null
  feedback_submission_id: number
  project_id: number
  created_at?: string
}
