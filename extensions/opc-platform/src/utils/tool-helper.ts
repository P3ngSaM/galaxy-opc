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

/** 标准错误码 */
export type OpcErrorCode =
  | "COMPANY_NOT_FOUND"
  | "CONTACT_NOT_FOUND"
  | "EMPLOYEE_NOT_FOUND"
  | "INVOICE_NOT_FOUND"
  | "CONTRACT_NOT_FOUND"
  | "RECORD_NOT_FOUND"
  | "INVALID_STATUS"
  | "INVALID_INPUT"
  | "VALIDATION_ERROR"
  | "DB_ERROR"
  | "UNKNOWN_ACTION"
  | "UNKNOWN_ERROR";

/** 生成标准错误响应 */
export function toolError(message: string, code?: OpcErrorCode) {
  return json({ ok: false, error: true, code: code ?? "UNKNOWN_ERROR", message });
}

/** 生成字段级验证错误 */
export function validationError(field: string, message: string) {
  return json({
    ok: false,
    error: true,
    code: "VALIDATION_ERROR" as OpcErrorCode,
    message: `${field}: ${message}`,
    field,
  });
}
