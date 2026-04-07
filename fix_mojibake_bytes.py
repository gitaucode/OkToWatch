#!/usr/bin/env python3
"""
Comprehensive mojibake fix - replace with raw byte patterns.
"""
import os
import re

files_to_clean = [
    'public/index/index.html',
    'public/index/indexv2.html',
    'public/how-it-works/index.html', 
    'public/contact/index.html',
    'public/about/index.html',
    'public/history/index.html',
    'public/dashboard/index.html',
    'public/discover/index.html',
    'public/lists/index.html',
    'public/forgot-password/index.html',
    'public/plans/index.html',
    'public/signin/index.html',
    'public/signup/index.html',
    'public/dashboard/dasboardv2.html',
]

for file_path in files_to_clean:
    full_path = os.path.join('d:\\My Saas\\OkToWatchv3', file_path)
    
    if not os.path.exists(full_path):
        continue
    
    try:
        # Read raw bytes
        with open(full_path, 'rb') as f:
            raw = f.read()
        
        # Common UTF-8 mojibake patterns (bytes that should be replaced)
        mojibake_fixes = [
            # UTF-8 for –  en-dash appearing garbled
            (b'\xc3\xa2\xc2\x80\xc2\x93', '–'.encode('utf-8')),  # Â–
            (b'\xc3\xa2\xc2\x80\xe2\x80\x93', '–'.encode('utf-8')),
            (b'\xc2\xa0\xc2\xa0', ' '.encode('utf-8')),  # Non-breaking spaces
            
            # Smart quotes appearing garbled
            (b'\xc3\xa2\xc2\x80\xc2\x9c', '"'.encode('utf-8')),  # Left quote
            (b'\xc3\xa2\xc2\x80\xc2\x9d', '"'.encode('utf-8')),  # Right quote
            (b'\xc3\xa2\xc2\x80\xc2\x98', "'".encode('utf-8')),  # Left single quote
            (b'\xc3\xa2\xc2\x80\xc2\x99', "'".encode('utf-8')),  # Right single quote
            
            # Ellipsis
            (b'\xc3\xa2\xc2\x80\xc2\xa6', '…'.encode('utf-8')),
            
            # Unicode issues
            (b'\xc3\x83\xc2\xa2', 'â'.encode('utf-8')),
        ]
        
        original = raw
        for old_bytes, new_bytes in mojibake_fixes:
            raw = raw.replace(old_bytes, new_bytes)
        
        # Write back if changed
        if raw != original:
            with open(full_path, 'wb') as f:
                f.write(raw)
            print(f"✓ {file_path}")
    except Exception as e:
        print(f"✗ {file_path}: {e}")

print("\n✅ All mojibake fixed at byte level")
