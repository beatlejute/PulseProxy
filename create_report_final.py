import json
from datetime import datetime, timezone

def load_data():
    with open('report_data.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_report():
    data = load_data()
    now = datetime.now(timezone.utc)
    created_at = now.isoformat().replace('+00:00', 'Z')
    period_start = "2026-03-31T00:00:00Z"  # весь день
    period_end = "2026-03-31T23:59:59Z"
    
    report_id = "REPORT-018"
    title = "Отчёт по выполнению задач после QA-тестирования (продолжение)"
    
    # Статистика
    total = data['total']
    done = data['done_count']
    blocked = data['blocked_count']
    in_progress = data['in_progress_count']
    ready = data['ready_count']
    backlog = data['backlog_count']
    
    # Таблица выполненных задач
    done_table = ""
    for t in data['done_tickets']:
        done_table += f"| {t['id']} | {t['title']} | {t['role']} | {t['result']} | {t['time']} |\n"
    
    # Таблица заблокированных задач
    blocked_table = ""
    for t in data['blocked_tickets']:
        blocked_table += f"| {t['id']} | {t['title']} | {t['reason']} | {t['required']} |\n"
    
    # Распределение по типам
    type_table = ""
    for typ, count in data['type_distribution'].items():
        pct = count / total * 100
        type_table += f"| {typ.upper()} | {count} | {pct:.1f}% |\n"
    
    # Аномалии
    anomalies_list = ""
    for a in data['anomalies']:
        anomalies_list += f"1. **{a['ticket']}**: {a['description']}\n"
    
    # Velocity
    velocity_day = data['velocity_day']
    velocity_week = data['velocity_week']
    
    # Шаблон отчёта
    report = f"""---
id: "{report_id}"
title: "{title}"
type: daily
period_start: "{period_start}"
period_end: "{period_end}"
author: administrator

created_at: "{created_at}"
related_plan: "plans/current/PLAN-006.md"
---

# Отчёт: Ежедневное QA-тестирование PulseProxy (PLAN-006) – продолжение

**Дата создания:** {now.date()}  
**Период:** {period_start[:10]} — {period_end[:10]}  
**Связанный план:** [PLAN-006](../plans/current/PLAN-006.md)

---

## Сводка

За отчётный период сохраняется ситуация с завершёнными QA-тестами. Все 8 задач выполнены, одна задача (QA-024) остаётся заблокированной из-за аномалии размещения. План PLAN-006 выполнен полностью, новых задач не добавлялось.

| Метрика | Значение |
|---------|----------|
| Выполнено задач | {done} |
| В работе | {in_progress} |
| Заблокировано | {blocked} |
| Новых задач | 0 |

---

## Выполненные задачи

| ID | Задача | Роль | Результат | Время |
|----|--------|------|-----------|-------|
{done_table.rstrip()}

### Детали выполненных задач

#### BUG-026-001: [i18n] UI отображает сырые i18n-ключи вместо переводов в test-popup.html

**Summary:** Исправлен мок `chrome.runtime.getURL` для корректной загрузки i18n-переводов. Добавлен мок `chrome.i18n.getUILanguage()`. Все элементы UI отображают переводы, ошибки консоли отсутствуют.

**Ключевые изменения:**
- Обновлён мок `chrome.runtime.getURL` в `test-popup.html`
- Добавлен мок `chrome.i18n.getUILanguage()`
- Создан автоматизированный тест `test-i18n-fix.cjs`

**Изменённые файлы:**
- `test-popup.html`

---

## Задачи в работе

Нет задач в работе.

---

## Заблокированные задачи

| ID | Задача | Причина блокировки | Требуется |
|----|--------|-------------------|-----------|
{blocked_table.rstrip()}

### Анализ блокировок

Тикет QA-024 был выполнен и прошёл ревью, но остался в папке blocked. Это аномалия, требующая ручного перемещения. В frontmatter тикета указан status: ready и completed_at, что свидетельствует о завершении задачи.

---

## Метрики производительности

### Velocity

- **Выполнено задач:** {done}
- **Средняя скорость:** {velocity_day:.1f} задач/день (за период {data.get('days_elapsed', 1)} день)
- **Cycle time:** ~15-40 часов на задачу (разброс из-за разных типов задач)

### Распределение по типам

| Тип | Задач | % от общего |
|------|-------|-------------|
{type_table.rstrip()}

### Распределение по статусам

| Статус | Количество | % |
|--------|-----------|---|
| Выполнено | {done} | {data['done_rate']:.1f}% |
| В работе | {in_progress} | {data['in_progress_rate']:.1f}% |
| Заблокировано | {blocked} | {data['blocked_rate']:.1f}% |
| В очереди (ready) | {ready} | {ready/total*100 if total>0 else 0:.1f}% |
| Бэклог | {backlog} | {backlog/total*100 if total>0 else 0:.1f}% |
| **Итого** | **{total}** | **100%** |

---

## Риски и проблемы

### Выявленные проблемы

{anomalies_list.rstrip()}

### Потенциальные риски

1. **Отсутствие новых задач в backlog**
   - Вероятность: Средняя
   - Влияние: После завершения всех задач PLAN-006 работа может остановиться
   - Митигация: Создать новый план или декомпозировать оставшиеся задачи

---

## Рекомендации для Architect

### Требуют решения

1. Переместить тикет QA-024 из blocked в done.
2. Рассмотреть создание нового плана для продолжения работ.

### Предложения по оптимизации

1. Внедрить автоматическую проверку аномалий размещения тикетов (скрипт check-anomalies.js уже есть).
2. Регулярно обновлять backlog новыми задачами для поддержания потока.

### Готовность к следующему этапу

План PLAN-006 выполнен полностью, все QA-тестирование завершено. Система готова к следующему этапу — разработке новых фич или углублённому тестированию.

---

## План на следующий период

### Приоритетные задачи

1. Перемещение QA-024 в done.
2. Создание нового плана для следующих итераций.

### Ожидаемые deliverables

- Корректная структура тикетов
- Новый план работ

---

## Приложения

### Ссылки на артефакты

- [PLAN-006](../plans/current/PLAN-006.md)
- [Отчёт QA-024](../../reports/QA-024-test-session-report.md)

### Дополнительные материалы

Нет.
"""
    return report

if __name__ == '__main__':
    report_content = generate_report()
    with open('.workflow/reports/REPORT-018.md', 'w', encoding='utf-8') as f:
        f.write(report_content)
    print("Отчёт создан: .workflow/reports/REPORT-018.md")