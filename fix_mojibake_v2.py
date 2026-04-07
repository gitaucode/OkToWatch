#!/usr/bin/env python3
"""
Fix mojibake by treating UTF-8 content that was mislabeled as Latin-1.
The files contain UTF-8 encoded bytes but were interpreted as Latin-1.
Solution: Read as UTF-8, encode to Latin-1 bytes, decode as UTF-8, save as UTF-8.
"""
import os

files_to_fix = [
    'public/index/index.html',
    'public/how-it-works/index.html', 
    'public/contact/index.html',
    'public/about/index.html'
]

for file_path in files_to_fix:
    full_path = os.path.join('d:\\My Saas\\OkToWatchv3', file_path)
    
    if not os.path.exists(full_path):
        print(f"❌ File not found: {file_path}")
        continue
    
    print(f"\n📄 {file_path}")
    
    try:
        # Read as UTF-8 (current broken state)
        with open(full_path, 'r', encoding='utf-8-sig') as f:  # Use utf-8-sig to skip BOM
            broken_content = f.read()
        
        # Convert: interpret the mojibake text as if it were Latin-1 bytes
        # This reverses the mis-encoding
        fixed_content = broken_content.encode('latin-1').decode('utf-8', errors='ignore')
        
        # Write back as proper UTF-8 with BOM
        with open(full_path, 'w', encoding='utf-8-sig') as f:
            f.write(fixed_content)
        
        # Count improvements
        mojibake_chars = ['â€"', 'â€¦', 'ðŸ', 'â–', 'Ã¢']
        found = sum(1 for char in mojibake_chars if char in broken_content)
        
        print(f"   ✅ Fixed! (Found {found} mojibake patterns)")
    except Exception as e:
        print(f"   ❌ Error: {e}")

print("\n✨ Mojibake fix complete!")
