import csv
import json
import os

def clean(s):
    return s.strip(' \t\r\n"')

def parse_gx_csv(filepath):
    with open(filepath, 'r', encoding='utf-16') as f:
        rows = list(csv.reader(f, delimiter='\t'))
    
    title = clean(rows[0][0]) if len(rows) > 0 and len(rows[0]) > 0 else ''
    plc_info = clean(rows[1][1]) if len(rows) > 1 and len(rows[1]) > 1 else ''
    
    instructions = []
    curr = None
    
    for i, row in enumerate(rows):
        if i < 3 or len(row) < 3:
            continue
        step = clean(row[0])
        line_stmt = clean(row[1]) if len(row) > 1 else ''
        cmd = clean(row[2])
        dev = clean(row[3]) if len(row) > 3 else ''
        pi_stmt = clean(row[5]) if len(row) > 5 else ''
        note = clean(row[6]) if len(row) > 6 else ''
        
        if cmd:
            if curr:
                instructions.append(curr)
            curr = {
                'step': int(step) if step.isdigit() else step,
                'cmd': cmd,
                'operands': [dev] if dev else [],
                'lineStmt': line_stmt,
                'note': note
            }
        elif dev and curr:
            curr['operands'].append(dev)
    if curr:
        instructions.append(curr)
    
    return {
        'title': title,
        'plcInfo': plc_info,
        'instructions': instructions
    }

def parse_io_assignment(filepath):
    with open(filepath, 'r', encoding='utf-16') as f:
        rows = list(csv.reader(f, delimiter='\t'))
    
    header = [clean(c) for c in rows[2] if clean(c)] if len(rows) > 2 else []
    slots = []
    for r in rows[3:]:
        cleaned = [clean(c) for c in r]
        if any(cleaned):
            slots.append({
                'slot': cleaned[0] if len(cleaned) > 0 else '',
                'type': cleaned[1] if len(cleaned) > 1 else '',
                'points': cleaned[2] if len(cleaned) > 2 else '',
                'startXY': cleaned[3] if len(cleaned) > 3 else '',
                'modelName': cleaned[4] if len(cleaned) > 4 else '',
                'detail': cleaned[14] if len(cleaned) > 14 else ''
            })
    return slots

data = {
    'MAIN': parse_gx_csv('MAIN.csv'),
    'ALARM': parse_gx_csv('ALARM.csv'),
    'CAMERA': parse_gx_csv('CAMERA.csv'),
    'IO_ASSIGNMENT': parse_io_assignment('IO Assignment Setting.csv')
}

with open('plc-data.js', 'w', encoding='utf-8') as f:
    f.write('// Auto-generated PLC Data from GX Works 2 CSV exports\n')
    f.write('window.PLC_PRELOADED_DATA = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n')

print("plc-data.js successfully generated!")
