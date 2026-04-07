#!/usr/bin/env python3
"""
Fix all mojibake patterns by doing direct byte-level replacement.
Map each garbled sequence to its correct character.
"""
import os
import re

# Map mojibake patterns to correct characters
mojibake_map = {
    # En-dash variants
    'â€"': '–',
    'â€–': '–',
    'Ã¢â€â„': '–',
    
    # Em-dash variants  
    'â€"': '—',
    'â€"': '—',
    
    # Ellipsis variants
    'â€¦': '…',
    'Ã¢â€¦': '…',
    
    # Bullet/middle dot variants
    'Â·': '·',
    'Ã‚Â·': '·',
    
    # Right single quote variants
    'â€™': ''',
    'â€˜': ''',
    
    # Double quote variants
    'â€œ': '"',
    'â€': '"',
    'Ã¢â€\x9c': '"',
    'Ã¢â€\x9d': '"',
    
    # Decorative dash
    'â€': '–',
    'Ã¢â€â‚¬': '–',
    'Ã¢â€â„': '–',
    
    # Arrow
    'â†"': '↓',
    'â†': '↓',
    
    # Drop arrow  
    'â–¾': '▾',
    'â–': '▾',
}

files_to_fix = [
    'public/index/index.html',
    'public/how-it-works/index.html', 
    'public/contact/index.html',
    'public/about/index.html',
    'public/history/index.html'
]

for file_path in files_to_fix:
    full_path = os.path.join('d:\\My Saas\\OkToWatchv3', file_path)
    
    if not os.path.exists(full_path):
        print(f"❌ File not found: {file_path}")
        continue
    
    print(f"\n📄 {file_path}")
    
    try:
        # Read with UTF-8 with BOM 
        with open(full_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        
        original_size = len(content)
        replaced_count = 0
        
        # Apply all replacements
        for mojibake, correct in mojibake_map.items():
            if mojibake in content:
                content = content.replace(mojibake, correct)
                count = len(content.split(correct)) - 1  # rough count
                replaced_count += content.count(correct)
                print(f"   ✓ Replaced '{mojibake}' → '{correct}'")
        
        # Write back
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"   ✅ Complete")
        
    except Exception as e:
        print(f"   ❌ Error: {e}")

print("\n✨ All mojibake fixed!")
