#!/usr/bin/env python3
"""
Final comprehensive mojibake fix.
"""
import os

file_path = 'd:\\My Saas\\OkToWatchv3\\public\\index\\index.html'

# Read as UTF-8
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Initial size: {len(content)}")

# List all replacements to make
replacements = [
    ("â€"â", "–"),
    ("â€"â€", "–"),
    ("â€"", "–"),
    ("â€", "–"),
    ("â€¦", "…"),
    ("â–¾", "▾"),
    ("â†", "↓"),
    ("Â·", "·"),
    ("â€™", "'"),
    ("â€˜", "'"),
    ("â€œ", '"'),
    ("â€", '"'),
]

for old, new in replacements:
    if old in content:
        before = content.count(old)
        content = content.replace(old, new)
        after = content.count(old)
        if before > 0:
            print(f"Replaced {before} instances of '{old}' → '{new}'")

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Final size: {len(content)}")
print("✅ Done!")
