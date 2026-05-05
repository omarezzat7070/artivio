from pathlib import Path
import re

root = Path('..') if Path('.').name == 'scripts' else Path('.')
html_files = sorted(root.glob('*.html'))
report = []
for path in html_files:
    text = path.read_text(encoding='utf-8')
    original = text
    if '<script src="config.js"></script>' not in text:
        text, n = re.subn(r'(<body[^>]*>)', r'\1\n<script src="config.js"></script>', text, count=1, flags=re.IGNORECASE)
        if n:
            report.append(f'{path.name}: inserted config.js script tag')
    text, n = re.subn(r'const API_BASE = window\.location\.origin;', 'const API_BASE = window.API_BASE || window.location.origin;', text)
    if n:
        report.append(f'{path.name}: updated const API_BASE declaration ({n} replacements)')
    text, n = re.subn(r'fetch\(\`\$\{window\.location\.origin\}', 'fetch(`${window.API_BASE}', text)
    if n:
        report.append(f'{path.name}: replaced {n} direct window.location.origin fetch call(s)')
    text, n2 = re.subn(r'window\.location\.origin\s*\+\s*window\.location\.pathname', 'window.API_BASE + window.location.pathname', text)
    if n2:
        report.append(f'{path.name}: replaced {n2} checkout URL concatenation(s)')
    if text != original:
        path.write_text(text, encoding='utf-8')
for line in report:
    print(line)
