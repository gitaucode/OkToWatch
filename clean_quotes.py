#!/usr/bin/env python3
file_path = 'd:\\My Saas\\OkToWatchv3\\public\\index\\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove stray quotes paired with dashes
replacements = [
    ('-"', ' - '),
    ('- "', '- '),  
    ('- –', ' - '),
    ('–"', ' - '),
]

for old, new in replacements:
    if old in content:
        count = content.count(old)
        content = content.replace(old, new)
        print(f"Replaced {count} instances of '{old}'")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Done")
