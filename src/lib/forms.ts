/**
 * 收集表字段定义
 * 字段清单严格来自《开发文档.md》§5.1（基础版 3 组 15 项）与 §5.2（详细版 7 部分 42 问）
 */

export interface FieldDef {
  key: string
  type: 'input' | 'textarea'
  required?: boolean
  placeholder?: string
}

export interface FieldGroup {
  title: string
  fields: FieldDef[]
}

/** 基础版收集表（3 组 15 项） */
export const BASIC_GROUPS: FieldGroup[] = [
  {
    title: 'A. 基础信息',
    fields: [
      { key: '企业名称', type: 'input', required: true, placeholder: '请输入企业全称' },
      { key: '所属行业', type: 'input', required: true, placeholder: '如：餐饮、零售、制造业…' },
      { key: '经营年限', type: 'input', required: true, placeholder: '如：5 年' },
      { key: '您的职位', type: 'input', required: true, placeholder: '如：创始人、总经理…' },
      { key: '员工人数', type: 'input', required: true, placeholder: '如：15人，3个大厨、2个服务员…' },
      { key: '主要业务城市', type: 'input', required: true, placeholder: '如：西安' },
      { key: '办公面积', type: 'input', required: true, placeholder: '如：200 平米' },
    ],
  },
  {
    title: 'B. 财务模型',
    fields: [
      { key: '年营业额', type: 'input', required: true, placeholder: '如：300万' },
      { key: '产品成本', type: 'textarea', required: true, placeholder: '请描述主要成本构成，如原材料、人工、房租…' },
      { key: '利润', type: 'input', required: true, placeholder: '可填百分比或金额，如：15% 或 50万' },
    ],
  },
  {
    title: 'C. 核心痛点',
    fields: [
      { key: '当前最头疼的三个问题', type: 'textarea', required: true, placeholder: '请尽量具体描述' },
      { key: '为解决痛点做过哪些努力', type: 'textarea', required: true, placeholder: '尝试过的方法、效果如何' },
      { key: '有什么独特资源', type: 'textarea', required: true, placeholder: '如：渠道、人脉、技术、资质…' },
      { key: '创始人愿景', type: 'textarea', required: true, placeholder: '您希望把企业做成什么样' },
      { key: '创始人决策风格', type: 'textarea', required: true, placeholder: '如：果断型、商量型…' },
    ],
  },
]

export interface DetailedSection {
  title: string
  questions: string[]
}

/** 详细版收集表《企业全面诊断信息收集表》（7 部分 42 问） */
export const DETAILED_SECTIONS: DetailedSection[] = [
  {
    title: '第一部分：企业基本信息',
    questions: [
      '公司全称',
      '成立时间',
      '所属行业',
      '主营业务',
      '企业性质（国企/民营/外资/合资）',
      '员工总数',
      '年营业额（近三年均值）',
      '利润情况（近三年均值）',
      '主要办公/生产基地地址',
    ],
  },
  {
    title: '第二部分：战略与定位',
    questions: [
      '企业愿景与使命',
      '未来 3—5 年的战略目标',
      '核心竞争优势',
      '市场定位（目标客户、区域）',
      '主要竞争对手及对它们的评价',
      '行业发展趋势及对企业的影响',
    ],
  },
  {
    title: '第三部分：产品与服务',
    questions: [
      '主要产品/服务清单',
      '各产品线营收占比',
      '产品生命周期阶段',
      '客户对产品/服务的评价',
    ],
  },
  {
    title: '第四部分：市场与客户',
    questions: [
      '主要客户群体特征',
      '市场占有率及变化趋势',
      '销售渠道与分布',
      '品牌知名度与影响力',
      '客户获取成本与留存率',
    ],
  },
  {
    title: '第五部分：人力资源',
    questions: [
      '核心管理层背景',
      '关键岗位人才配置',
      '员工满意度调查结果',
      '培训与发展体系',
      '绩效考核与激励制度',
      '人才流失率及原因分析',
    ],
  },
  {
    title: '第六部分：财务与资本',
    questions: [
      '主要成本构成',
      '现金流状况',
      '资产负债情况',
      '融资渠道与资本结构',
      '主要财务风险',
      '投资计划与方向',
    ],
  },
  {
    title: '第七部分：存在的问题与挑战',
    questions: [
      '当前最紧迫的三大问题',
      '尝试过的解决方案及效果',
      '内部资源与能力限制',
      '外部环境带来的主要挑战',
      '期望咨询达成的具体目标',
      '其他需要说明的情况',
    ],
  },
]
