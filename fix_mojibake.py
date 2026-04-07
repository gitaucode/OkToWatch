#!/usr/bin/env python3
"""
Fix UTF-8 mojibake encoding issues by converting files to proper UTF-8.
Files are likely saved as Latin-1/Windows-1252 but declared as UTF-8.
"""
import os

files_to_fix = [
    'public/index/index.html',
    'public/how-it-works/index.html', 
    'public/contact/index.html',
    'public/about/index.html'
]

# Try encodings in order of likelihood
encodings_to_try = ['cp1252', 'latin-1', 'iso-8859-1', 'utf-16', 'utf-8']

for file_path in files_to_fix:
    full_path = os.path.join('d:\\My Saas\\OkToWatchv3', file_path)
    
    if not os.path.exists(full_path):
        print(f"❌ File not found: {file_path}")
        continue
    
    print(f"\n📄 {file_path}")
    
    # Read raw bytes
    with open(full_path, 'rb') as f:
        raw_data = f.read()
    
    # Try each encoding
    content = None
    found_encoding = None
    
    for enc in encodings_to_try:
        try:
            content = raw_data.decode(enc)
            found_encoding = enc
            break
        except:
            pass
    
    if content and found_encoding:
        # Write back as proper UTF-8 (with BOM to prevent future issues)
        with open(full_path, 'w', encoding='utf-8-sig') as f:
            f.write(content)
        print(f"   ✅ Converted from {found_encoding} to UTF-8")
    else:
        print(f"   ❌ Could not detect encoding")

print("\n✨ Encoding fix complete!")
