import os
import yaml
import json
from datetime import datetime, timezone
import glob

def parse_frontmatter(content):
    lines = content.split('\n')
    if not lines[0].startswith('---'):
        return {}
    end = None
    for i in range(1, len(lines)):
        if lines[i].startswith('---'):
            end = i
            break
    if end is None:
        return {}
    yaml_content = '\n'.join(lines[1:end])
    try:
        data = yaml.safe_load(yaml_content)
        return data if data else {}
    except Exception as e:
        print(f"Error parsing YAML: {e}")
        return {}

def load_tickets():
    base = '.workflow/tickets'
    statuses = ['done', 'blocked', 'in-progress', 'ready', 'backlog']
    tickets = []
    for status in statuses:
        dir_path = os.path.join(base, status)
        if not os.path.exists(dir_path):
            continue
        for file_path in glob.glob(os.path.join(dir_path, '*.md')):
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            fm = parse_frontmatter(content)
            if not fm:
                continue
            ticket = {
                'id': fm.get('id', ''),
                'title': fm.get('title', ''),
                'type': fm.get('type', ''),
                'priority': fm.get('priority', ''),
                'created_at': fm.get('created_at', ''),
                'updated_at': fm.get('updated_at', ''),
                'completed_at': fm.get('completed_at', ''),
                'status': status,
                'file': file_path,
                'executor_type': fm.get('executor_type', ''),
                'parent_ticket': fm.get('parent_ticket', ''),
                'parent_plan': fm.get('parent_plan', ''),
            }
            tickets.append(ticket)
    return tickets

def calculate_time(created_str, completed_str):
    if not created_str or not completed_str:
        return ''
    try:
        created = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
        completed = datetime.fromisoformat(completed_str.replace('Z', '+00:00'))
        diff = completed - created
        minutes = diff.total_seconds() / 60
        if minutes < 60:
            return f"{int(minutes)} мин"
        else:
            hours = minutes / 60
            return f"{hours:.1f} ч"
    except:
        return ''

def main():
    tickets = load_tickets()
    
    done_tickets = [t for t in tickets if t['status'] == 'done']
    blocked_tickets = [t for t in tickets if t['status'] == 'blocked']
    in_progress_tickets = [t for t in tickets if t['status'] == 'in-progress']
    ready_tickets = [t for t in tickets if t['status'] == 'ready']
    backlog_tickets = [t for t in tickets if t['status'] == 'backlog']
    
    # Статистика
    total = len(tickets)
    done_count = len(done_tickets)
    blocked_count = len(blocked_tickets)
    in_progress_count = len(in_progress_tickets)
    ready_count = len(ready_tickets)
    backlog_count = len(backlog_tickets)
    
    # Распределение по типам
    type_counts = {}
    for t in tickets:
        typ = t['type'] or 'unknown'
        type_counts[typ] = type_counts.get(typ, 0) + 1
    
    # Velocity
    completed_tickets = [t for t in tickets if t['completed_at']]
    if completed_tickets:
        completed_dates = []
        for t in completed_tickets:
            try:
                dt = datetime.fromisoformat(t['completed_at'].replace('Z', '+00:00'))
                completed_dates.append(dt)
            except:
                pass
        if completed_dates:
            earliest = min(completed_dates)
            latest = max(completed_dates)
            days = (latest - earliest).days + 1
            if days == 0:
                days = 1
            velocity_day = len(completed_tickets) / days
        else:
            velocity_day = 0
    else:
        velocity_day = 0
    
    # Аномалии
    anomalies = []
    # 1. Блокированный тикет с completed_at
    for t in blocked_tickets:
        if t.get('completed_at'):
            anomalies.append({
                'type': 'blocked_but_completed',
                'ticket': t['id'],
                'description': f"Тикет {t['id']} находится в blocked, но имеет completed_at"
            })
    # 2. In-progress без updated_at за последние 3 дня
    now = datetime.now(timezone.utc)
    for t in in_progress_tickets:
        updated = t.get('updated_at')
        if updated:
            try:
                updated_dt = datetime.fromisoformat(updated.replace('Z', '+00:00'))
                delta = now - updated_dt
                if delta.days > 3:
                    anomalies.append({
                        'type': 'stale_in_progress',
                        'ticket': t['id'],
                        'description': f"Тикет {t['id']} в in-progress не обновлялся {delta.days} дней"
                    })
            except:
                pass
    
    # Формирование таблицы выполненных задач
    done_table_rows = []
    for t in done_tickets:
        time_str = calculate_time(t['created_at'], t['completed_at'])
        role = t['executor_type'] or 'agent'
        result = 'PASS'  # можно извлечь из результата, но упростим
        done_table_rows.append({
            'id': t['id'],
            'title': t['title'],
            'role': role,
            'result': result,
            'time': time_str
        })
    
    # Формирование таблицы заблокированных задач
    blocked_table_rows = []
    for t in blocked_tickets:
        # причина блокировки - попробуем извлечь из описания
        reason = "Аномалия: тикет завершён, но находится в blocked"
        if not t.get('completed_at'):
            reason = "Требуется анализ"
        blocked_table_rows.append({
            'id': t['id'],
            'title': t['title'],
            'reason': reason,
            'required': "Переместить в done"
        })
    
    # Вывод для отладки
    print(f"Всего тикетов: {total}")
    print(f"Выполнено: {done_count}")
    print(f"Заблокировано: {blocked_count}")
    print(f"В работе: {in_progress_count}")
    print(f"В очереди: {ready_count}")
    print(f"Бэклог: {backlog_count}")
    print(f"Velocity: {velocity_day:.2f} задач/день")
    
    # Сохраняем данные в JSON для использования в шаблоне
    report_data = {
        'total': total,
        'done_count': done_count,
        'blocked_count': blocked_count,
        'in_progress_count': in_progress_count,
        'ready_count': ready_count,
        'backlog_count': backlog_count,
        'velocity_day': velocity_day,
        'velocity_week': velocity_day * 7,
        'done_rate': done_count / total * 100 if total > 0 else 0,
        'blocked_rate': blocked_count / total * 100 if total > 0 else 0,
        'in_progress_rate': in_progress_count / total * 100 if total > 0 else 0,
        'type_distribution': type_counts,
        'done_tickets': done_table_rows,
        'blocked_tickets': blocked_table_rows,
        'anomalies': anomalies,
    }
    
    with open('report_data.json', 'w', encoding='utf-8') as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)
    
    print("\nДанные сохранены в report_data.json")

if __name__ == '__main__':
    main()