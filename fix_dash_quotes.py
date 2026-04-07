#!/usr/bin/env python3
import re

path = 'd:\\My Saas\\OkToWatchv3\\public\\index\\index.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Show what we have
lines = content.split('\n')
for i, line in enumerate(lines):
    if '-"' in line or '- "' in line or 'rate limit' in line:
        print(f"Line {i}: {repr(line[:100])}")

# Replace any problematic dash-quote combinations
patterns = [
    (r'-[\"\u201c\u201d\u2018\u2019\xc3\xa2\xe2\x80]', ' - '),  # dash followed by any quote variant
    (r'- "([^"]*)', '- \1'),  # fix spaced versions
]

count = 0
for pattern, repl in patterns:
    matches = len(re.findall(pattern, content))
    if matches > 0:
        content = re.sub(pattern, repl, content)
        count += matches
        print(f"Fixed {matches} matches of pattern: {pattern}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"✅ Total: {count} fixes")
