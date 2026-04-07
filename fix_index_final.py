#!/usr/bin/env python3
"""
Aggressive mojibake cleanup - handles all variants.
"""
import re

file_path = 'd:\\My Saas\\OkToWatchv3\\public\\index\\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# All mojibake replacement patterns
patterns = [
    # Dash variants with quote
    (r'–"', ' - '),
    (r'–\"', ' - '),
    (r'—"', ' - '),
    (r'—\"', ' - '),
    
    # Standalone mojibake dashes
    (r'â€"', '-'),
    (r'â€"', '-'),  
    (r'â€"', '–'),
    (r'â–', '-'),
    (r'–', '-'),  # Replace en-dash with regular dash for simplicity
    (r'—', '-'),  # Replace em-dash with regular dash
    
    # Other mojibake
    (r'â€¦', '...'),
    (r'â€™', "'"),
    (r'â€˜', "'"),
    (r'â€œ', '"'),
    (r'â€', '"'),
    (r'â–¾', 'v'),
    (r'â†', '↓'),
    (r'Â·', '.'),
]

count = 0
for pattern, replacement in patterns:
    before = len(re.findall(pattern, content))
    if before > 0:
        content = re.sub(pattern, replacement, content)
        count += before
        print(f"Replaced {before} instances of '{pattern}'")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n✅ Total replacements: {count}")
