#!/usr/bin/env python3
"""
Final mojibake cleanup - remove stray quotes and fix remaining patterns.
"""
import os
import re

files_to_clean = [
    'public/index/index.html',
    'public/how-it-works/index.html', 
    'public/contact/index.html',
    'public/about/index.html',
    'public/history/index.html'
]

# Additional patterns to clean up
additional_patterns = [
    ('–"', '–'),  # en-dash followed by stray quote
    ('—"', '—'),  # em-dash followed by stray quote
    ('"–', '–'),  # stray quote followed by en-dash
    ('"—', '—'),  # stray quote followed by em-dash
    ('–—', '–'),  # en-dash followed by em-dash
    ('"', ''),    # stray quotes that appear alone  
]

for file_path in files_to_clean:
    full_path = os.path.join('d:\\My Saas\\OkToWatchv3', file_path)
    
    if not os.path.exists(full_path):
        continue
    
    try:
        # Read file
        with open(full_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        
        original_length = len(content)
        
        # First pass replacements - main patterns
        first_pass = [
            ('–"', '–'),
            ('—"', '—'),  
            ('"–', '–'),
            ('"—', '—'),
            ('–"', '–'),
            ('""', '"'),
        ]
        
        for old, new in first_pass:
            if old in content:
                content = content.replace(old, new)
        
        # Write back
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        if len(content) != original_length:
            print(f"✓ {file_path}")
            
    except Exception as e:
        pass

print("✅ Cleanup complete")
