"""
Recolour edrefcard SVGs for Daedalus in-place:
  - stroke:black  -> stroke:rgb(250,150,0)   (primary orange)
  - fill:black    -> fill:rgb(250,150,0)
  - text fill     -> rgb(20,245,255)          (secondary blue)
  - Remove thin row-separator paths (stroke-opacity:0.35 hairlines)
  - Inject SVG filter that converts the device photo (dark device on white bg)
    to orange-on-black: white bg -> black, dark device -> orange rgb(250,150,0)
  - Apply that filter to every <use> element referencing device images
"""

import re
import os
import sys

ORANGE = 'rgb(250,150,0)'
BLUE   = 'rgb(20,245,255)'
SVG_DIR = os.path.dirname(os.path.abspath(__file__))

# SVG filter that inverts luminance and maps to orange.
# After feColorMatrix saturate=0: all channels = L (luminance).
# feComponentTransfer then maps:
#   R = -0.98*L + 0.98 = 0.98*(1-L)  → white(L=1)→0, black(L=0)→0.98
#   G = -0.59*L + 0.59 = 0.59*(1-L)  → white(L=1)→0, black(L=0)→0.59
#   B = 0
# Result: white background → black (invisible on dark panel)
#         dark device      → orange rgb(250,150,0)
DEVICE_PHOTO_FILTER = '''    <filter id="_devicePhoto" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="-0.98" intercept="0.98"/>
        <feFuncG type="linear" slope="-0.59" intercept="0.59"/>
        <feFuncB type="linear" slope="0" intercept="0"/>
      </feComponentTransfer>
    </filter>'''

def recolour_style_attr(style: str) -> str:
    """Rewrite colour declarations inside a style="..." attribute value."""
    # stroke:black -> orange
    style = re.sub(r'\bstroke\s*:\s*black\b', f'stroke:{ORANGE}', style)
    style = re.sub(r'\bstroke\s*:\s*#000(?:000)?\b', f'stroke:{ORANGE}', style)
    # fill:black -> orange  (for arrowheads etc.)
    style = re.sub(r'\bfill\s*:\s*black\b', f'fill:{ORANGE}', style)
    style = re.sub(r'\bfill\s*:\s*#000(?:000)?\b', f'fill:{ORANGE}', style)
    return style

def recolour_element(tag_str: str) -> str:
    """Rewrite style/stroke/fill attributes inside a single tag string."""
    # Handle style="..." attribute
    def fix_style(m):
        return f'style="{recolour_style_attr(m.group(1))}"'
    tag_str = re.sub(r'style="([^"]*)"', fix_style, tag_str)

    # Handle bare stroke="black" / stroke="#000"
    tag_str = re.sub(r'\bstroke="(?:black|#000(?:000)?)"', f'stroke="{ORANGE}"', tag_str)
    tag_str = re.sub(r"\bstroke='(?:black|#000(?:000)?)'" , f"stroke='{ORANGE}'", tag_str)

    # Handle bare fill="black" / fill="#000"
    tag_str = re.sub(r'\bfill="(?:black|#000(?:000)?)"', f'fill="{ORANGE}"', tag_str)
    tag_str = re.sub(r"\bfill='(?:black|#000(?:000)?)'"  , f"fill='{ORANGE}'"  , tag_str)

    return tag_str


def is_separator_path(tag_str: str) -> bool:
    """
    True for the thin horizontal row-divider lines inside label boxes.
    These are <path> elements with stroke-opacity:0.35 and a simple
    M…L… horizontal segment (no curves). We detect them by the low opacity.
    """
    if 'stroke-opacity:0.35' in tag_str or "stroke-opacity='0.35'" in tag_str:
        return True
    return False


def recolour_text_element(elem: str) -> str:
    """Set fill on <text> elements to secondary blue."""
    # If style already sets fill, replace it
    def fix_style(m):
        s = m.group(1)
        if re.search(r'\bfill\s*:', s):
            s = re.sub(r'\bfill\s*:[^;"]*(;|")?', f'fill:{BLUE}\\1', s)
        else:
            s = f'fill:{BLUE};' + s
        return f'style="{s}"'

    if 'style="' in elem:
        return re.sub(r'style="([^"]*)"', fix_style, elem)
    else:
        # Add fill attribute
        return elem.replace('<text ', f'<text fill="{BLUE}" ', 1)


def process_svg(path: str) -> bool:
    content = open(path, encoding='utf-8').read()
    original = content

    # 1. Remove separator paths entirely (full tag self-closing)
    content = re.sub(
        r'<path\b[^/]*/>\n?',
        lambda m: '' if is_separator_path(m.group()) else m.group(),
        content
    )

    # 2. Recolour <rect>, <path>, <line>, <polygon>, <polyline>, <circle>, <ellipse>
    def recolour_tag(m):
        return recolour_element(m.group())

    for tag in ('rect', 'path', 'line', 'polygon', 'polyline', 'circle', 'ellipse'):
        content = re.sub(
            r'<' + tag + r'\b[^>]*/?>',
            recolour_tag,
            content,
            flags=re.DOTALL
        )

    # 3. Recolour <text> elements -> secondary blue
    def recolour_text(m):
        return recolour_text_element(m.group())

    content = re.sub(
        r'<text\b[^>]*>',
        recolour_text,
        content
    )

    # 4. Remove any background rect (full-width fill:white or fill:#fff or fill:rgb(255,255,255))
    content = re.sub(
        r'<rect\b[^>]*(?:fill\s*:\s*(?:white|#fff(?:fff)?|rgb\(255\s*,\s*255\s*,\s*255\s*\)))[^>]*/>\n?',
        '',
        content,
        flags=re.IGNORECASE | re.DOTALL
    )

    # 5. Ensure the <svg> root has no background fill
    # Add/replace fill on the root svg element style if it has fill:white
    def fix_svg_root(m):
        s = m.group()
        s = re.sub(r'\bfill\s*:\s*(?:white|#fff(?:fff)?|rgb\(255[^)]*\))', 'fill:none', s, flags=re.IGNORECASE)
        return s
    content = re.sub(r'<svg\b[^>]*>', fix_svg_root, content, count=1)

    # 6. Inject device photo filter into <defs> (idempotent)
    if '<defs>' in content and '_devicePhoto' not in content:
        content = content.replace('<defs>', '<defs>\n' + DEVICE_PHOTO_FILTER, 1)

    # 7. Apply filter to <use> elements that reference device images (#_Image*)
    def add_photo_filter(m):
        tag = m.group()
        if re.search(r'xlink:href="#_Image', tag) and 'filter=' not in tag:
            tag = tag.rstrip('/>').rstrip()
            tag = tag + ' filter="url(#_devicePhoto)"/>'
        return tag
    content = re.sub(r'<use\b[^>]*/>', add_photo_filter, content)

    if content != original:
        open(path, 'w', encoding='utf-8').write(content)
        return True
    return False


def main():
    svgs = [f for f in os.listdir(SVG_DIR) if f.endswith('.svg') and not f.startswith('_')]
    edited = 0
    for fname in sorted(svgs):
        fpath = os.path.join(SVG_DIR, fname)
        changed = process_svg(fpath)
        if changed:
            print(f'  edited: {fname}')
            edited += 1
        else:
            print(f'  unchanged: {fname}')
    print(f'\nDone. {edited}/{len(svgs)} SVGs edited.')

if __name__ == '__main__':
    main()
