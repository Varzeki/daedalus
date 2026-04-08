"""Generate maskable icon from colored version with padding for safe zone."""
import re

with open('icon.svg') as f:
    content = f.read()

# Extract inner SVG content
inner = re.search(r'<svg[^>]*>(.*)</svg>', content, re.DOTALL).group(1)

# Remove the background rect
inner = re.sub(r'<rect width="1000" height="1000" fill="#0a0a0a"/>\s*', '', inner)

# Build maskable: 80% scale centered with 10% padding on each side
maskable = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <rect width="1000" height="1000" fill="#0a0a0a"/>
  <g transform="translate(100, 100) scale(0.8)">
{inner}
  </g>
</svg>'''

with open('icon-maskable.svg', 'w') as f:
    f.write(maskable)
print('Wrote icon-maskable.svg')
