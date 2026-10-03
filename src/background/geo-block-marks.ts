// src/background/geo-block-marks.ts
// Отметки гео-блока в памяти service worker: в storage не пишутся и пропадают
// вместе с воркером. Ключ — tabId, значение — requestId навигации и хост.

type Mark = {
  /** `details.requestId` события `chrome.webRequest` — строка (chrome.webRequest.WebRequestDetails). */
  requestId: string;
  host: string;
};

const marks = new Map<number, Mark>();

/**
 * Поставить отметку гео-блока на вкладку.
 * @param tabId ID вкладки
 * @param requestId requestId навигации `main_frame`, на которой распознан гео-блок
 * @param host хост заблокированного сайта
 */
export function setMark(tabId: number, requestId: string, host: string): void {
  marks.set(tabId, { requestId, host });
}

/**
 * Прочитать отметку вкладки.
 * @param tabId ID вкладки
 * @returns отметка или undefined, если её нет
 */
export function getMark(tabId: number): Mark | undefined {
  return marks.get(tabId);
}

/**
 * Снять отметку вкладки без условия — путь закрытия вкладки (`chrome.tabs.onRemoved`).
 * @param tabId ID вкладки
 */
export function clearMark(tabId: number): void {
  marks.delete(tabId);
}

/**
 * Снять отметку вкладки при ответе, если requestId ответа отличается от отмеченного.
 * Тот же requestId — звено той же цепочки редиректов, отметка остаётся: все звенья одной
 * цепочки `main_frame` идут под одним requestId, отдельная навигация получает новый
 * (ответ E отчёта reports/geo-block-spike.md).
 * @param tabId ID вкладки
 * @param requestId requestId ответа
 */
export function clearMarkIfNotMatching(tabId: number, requestId: string): void {
  const mark = marks.get(tabId);
  if (mark && mark.requestId !== requestId) {
    marks.delete(tabId);
  }
}
