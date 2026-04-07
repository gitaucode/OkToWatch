import os
import glob

replacements = {
    'Ã¢â‚¬â€ ': '—', 
    'Ã¢â‚¬Â¦': '…',
    'Ã¢Å“Â¨': '✨',
    'Ã¢â€ â€™': '→',
    'Ã°Å¸Å’Å¸': '🌟',
    'Ã¢â€¢Â ': '═',
    'Ã‚Â·': '·',
    'Ã¢Å“â€¦': '✅',
    'Ã¢â€ â‚¬': '─',
    'Ã¢Å“â€œ': '✓',
    'Ã°Å¸â€˜Â¤': '👤',
    'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ': '—',
    'ÃƒÂ¢Ã¢â‚¬Â Ã¢â€šÂ¬': '─',
    'ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦': '…',
    'ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“': '✓',
    'Ãƒâ€š·': '·'
}

def fix_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        original = content
        for bad, good in replacements.items():
            content = content.replace(bad, good)
            
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Fixed {filepath}")
    except Exception as e:
        pass

for filepath in glob.glob('public/**/*.html', recursive=True):
    fix_file(filepath)
for filepath in glob.glob('public/**/*.js', recursive=True):
    fix_file(filepath)
