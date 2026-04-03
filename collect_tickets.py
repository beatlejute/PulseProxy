import os
import sys
import yaml
import json
from datetime import datetime, timezone
import glob

def parse_frontmatter(content):
    """Parse YAML frontmatter from markdown file."""
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

def collect_tickets(base_path='.workflow/tickets'):
    statuses = ['done', 'blocked', 'in-progress', 'ready', 'backlog']
    tickets = []
    for status in statuses:
        dir_path = os.path.join(base_path, status)
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
            }
            tickets.append(ticket)
    return tickets

def calculate_metrics(tickets):
    total = len(tickets)
    by_status = {}
    by_type = {}
    for t in tickets:
        s = t['status']
        by_status[s] = by_status.get(s, 0) + 1
        typ = t['type']
        if typ:
            by_type[typ] = by_type.get(typ, 0) + 1
    
    done_count = by_status.get('done', 0)
    blocked_count = by_status.get('blocked', 0)
    in_progress_count = by_status.get('in-progress', 0)
    ready_count = by_status.get('ready', 0)
    backlog_count = by_status.get('backlog', 0)
    
    done_rate = done_count / total * 100 if total > 0 else 0
    blocked_rate = blocked_count / total * 100 if total > 0 else 0
    in_progress_rate = in_progress_count / total * 100 if total > 0 else 0
    
    # Velocity: calculate days elapsed based on earliest created_at and latest completed_at
    now = datetime.now(timezone.utc)
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
            earliest_completion = min(completed_dates)
            latest_completion = max(completed_dates)
            days_elapsed = (latest_completion - earliest_completion).days + 1
            if days_elapsed == 0:
                days_elapsed = 1
            velocity_day = len(completed_tickets) / days_elapsed
        else:
            velocity_day = 0
    else:
        velocity_day = 0
    
    # Plan health: not implemented yet
    
    return {
        'total': total,
        'by_status': by_status,
        'by_type': by_type,
        'done_count': done_count,
        'blocked_count': blocked_count,
        'in_progress_count': in_progress_count,
        'ready_count': ready_count,
        'backlog_count': backlog_count,
        'done_rate': done_rate,
        'blocked_rate': blocked_rate,
        'in_progress_rate': in_progress_rate,
        'velocity_day': velocity_day,
        'velocity_week': velocity_day * 7,
        'completed_tickets': completed_tickets,
    }

def main():
    tickets = collect_tickets()
    metrics = calculate_metrics(tickets)
    
    print(f"Total tickets: {metrics['total']}")
    print(f"Done: {metrics['done_count']} ({metrics['done_rate']:.1f}%)")
    print(f"Blocked: {metrics['blocked_count']} ({metrics['blocked_rate']:.1f}%)")
    print(f"In-progress: {metrics['in_progress_count']} ({metrics['in_progress_rate']:.1f}%)")
    print(f"Ready: {metrics['ready_count']}")
    print(f"Backlog: {metrics['backlog_count']}")
    print(f"Velocity: {metrics['velocity_day']:.2f} tasks/day, {metrics['velocity_week']:.2f} tasks/week")
    
    print("\nBy type:")
    for typ, count in metrics['by_type'].items():
        print(f"  {typ}: {count}")
    
    # Output JSON for further use
    with open('tickets_metrics.json', 'w', encoding='utf-8') as f:
        json.dump({
            'tickets': tickets,
            'metrics': metrics
        }, f, indent=2, default=str)
    
    # Also output a simple report summary
    report = {
        'total': metrics['total'],
        'done': metrics['done_count'],
        'blocked': metrics['blocked_count'],
        'in_progress': metrics['in_progress_count'],
        'ready': metrics['ready_count'],
        'backlog': metrics['backlog_count'],
        'velocity_day': metrics['velocity_day'],
        'velocity_week': metrics['velocity_week'],
        'blocked_rate': metrics['blocked_rate'],
        'done_rate': metrics['done_rate'],
    }
    with open('report_summary.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

if __name__ == '__main__':
    main()