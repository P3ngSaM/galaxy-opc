/**
 * 星环OPC中心 — 工具辅助函数
 */

/** 将数据封装为 AI 工具标准响应格式 */
export function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

/** 生成标准错误响应 */
export function toolError(message: string) {
  return json({ ok: false, error: message });
}
