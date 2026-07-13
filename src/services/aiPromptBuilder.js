export const DEFAULT_QUICK_FOCUS_SYMBOLS = ['TSLL', 'SOXS', 'RKLX', 'ASTX', 'AMDL', 'RKLB', 'TSLU.TO', 'SMCL', 'AMZU', 'ORCX', 'OKLL', 'ETHU', 'MSTU.TO', 'MSTP', 'IONL', 'KBAB', 'METU', 'GLDU.TO', 'NVDY', 'SOXL', 'AMD.TO', 'OSCR', 'ASML.TO', 'RDW', 'VFV.TO', 'XEQT.TO']

const cleanList = (items) => [...new Set((items || []).map((item) => String(item || '').trim().toUpperCase()).filter(Boolean))]

const outputLanguageName = (language) => language === 'zh' ? 'Chinese' : 'English'
const outputLanguageLocale = (language) => language === 'zh' ? 'zh-CN' : 'en-US'
const outputLanguageInstruction = (language) => {
  if (language === 'zh') {
    return `输出语言：中文。
order-plan.json 中的用户可读字段请优先写中文；如果提供双语字段，请使用 { "zh": "...", "en": "..." }。`
  }
  return `Output language: English.
The narrative analysis and every user-facing order-plan.json text field must be in English.
For localized fields, include bilingual objects where possible, for example currentSituationText/suggestionText/plannedOrderText/reasonText/riskText/reEntryPlanText as { "en": "...", "zh": "..." }. Do not put Chinese-only prose in plain string fields such as suggestion, currentSituation, plannedOrder, reason, risk, or note.`
}

export function buildChatGptPrompt(snapshot) {
  const mode = snapshot.snapshotMode === 'FULL' ? 'FULL' : 'QUICK'
  const focusSymbols = cleanList(snapshot.request?.focusSymbols || [])
  const language = snapshot.request?.uiLanguage === 'zh' ? 'zh' : 'en'
  const languageInstruction = outputLanguageInstruction(language)
  const jsonLanguage = outputLanguageLocale(language)
  const proseLanguage = outputLanguageName(language)
  if (mode === 'QUICK') {
    return `请使用当前 ChatGPT 项目 Sources 中已连接 Google Drive 并保持同步的 Chris_Investing_Project_Instructions，严格按照其中规则分析我上传的最新 TradeMarker AI 快照。

${languageInstruction}

这是一次盘中快速更新，请优先阅读文件中的：
- request
- changeSummary
- account
- positions
- recentTrades
- currentOrderPlanSummary
- focusSymbols

本次重点分析：
${focusSymbols.length ? focusSymbols.join(', ') : '文件中的 focusSymbols'}

请重点检查：
1. 当前仓位数量是否足够支持建议的卖出数量；
2. 可用现金是否足够支持建议的买入数量；
3. 多个 BUY_FIRST 计划是否会重复占用同一笔现金；
4. SELL_FIRST 数量是否超过现有持股；
5. 日内交易的预计毛利是否达到项目要求；
6. 杠杆产品是否适合今天执行日内交易；
7. 已有挂单是否需要维持、取消或修改；
8. 最新成交后，止损、补仓价和平均成本是否需要调整；
9. 主动评估今天是否存在适合补仓/加仓的机会，尤其是长期核心仓、长期卫星仓、ETF和高质量回调的AI/半导体/科技仓位；
10. 对每个可补仓标的，给出建议买入价位、数量、现金占用、优先级、触发条件和不买的条件；
11. 区分“长期补仓”“波段低吸”“日内BUY_FIRST”，不要把日内交易误当成长期加仓；
12. 杠杆波段仓默认不建议补仓，除非出现明确企稳、强反转、成交量确认，且仓位不会失控；
13. 对于 TSLL、TSLU.TO、RKLX、ASTX、AMDL、SOXL 等杠杆产品，如果不建议补仓，也必须明确说明原因；
14. 如果现金不足以同时执行多个买单，必须标注哪些买单互斥，并按优先级排序。

请先给我 ${proseLanguage} 整体分析，然后生成完整、可下载的挂单建议 JSON。
JSON 必须严格符合项目中的 order-plan schema，并包含每个订单的 alerts。JSON request.language 应为 ${jsonLanguage}。`
  }

  return `请使用当前 ChatGPT 项目 Sources 中已连接 Google Drive 并保持同步的 Chris_Investing_Project_Instructions，严格按照其中规则分析我上传的最新 TradeMarker AI 快照。

${languageInstruction}

请结合：
- 全部当前持仓
- 观察列表分组
- 最近成交
- 当前现金
- 当前挂单建议摘要
- 技术指标
- 宏观事件
- 文件中的 changeSummary

完成整体组合分析。

要求：
1. 优先列出可立即执行的操作；
2. 每个当前持仓至少给出一个 REGULAR 计划；
3. 波段仓和杠杆波段仓都要有 INTRADAY 评估；
4. 重点分析 TSLL、SOXS、RKLX、ASTX 等杠杆波段仓；
5. 所有建议必须结合实际持仓数量；
6. 所有买单必须通过现金占用校验；
7. 多个候选交易必须说明互斥关系；
8. SELL_FIRST 必须从已有仓位卖出，并在当天恢复原始股数；
9. BUY_FIRST 必须当天平仓；
10. 每个卖出建议都提供买回计划；
11. 主动评估是否存在适合补仓/加仓的机会，尤其是长期核心仓、长期卫星仓、ETF和高质量回调的AI/半导体/科技仓位；
12. 对每个可补仓标的，给出建议买入价位、数量、现金占用、优先级、触发条件和不买的条件；
13. 区分“长期补仓”“波段低吸”“日内BUY_FIRST”，不要把日内交易误当成长期加仓；
14. 杠杆波段仓默认不建议补仓，除非出现明确企稳、强反转、成交量确认，且仓位不会失控；
15. 对于 TSLL、TSLU.TO、RKLX、ASTX、AMDL、SOXL 等杠杆产品，如果不建议补仓，也必须明确说明原因；
16. 如果现金不足以同时执行多个买单，必须标注哪些买单互斥，并按优先级排序；
17. 最后生成完整、可下载的 order-plan.json，JSON request.language 应为 ${jsonLanguage}。`
}

export { cleanList as uniquePromptSymbols }
