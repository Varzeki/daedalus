"""
Find SVGs where arrow <text> elements are positioned very close to or overlapping
the boundary of their nearest <rect> element.
"""
import re
import os

SVG_DIR = os.path.dirname(os.path.abspath(__file__))
ARROW_CHARS = set('↑↓←→')

def get_attr_float(attrs, name):
    m = re.search(r'\b' + name + r'=["\']([0-9.]+)["\']', attrs)
    return float(m.group(1)) if m else None

for fname in sorted(f for f in os.listdir(SVG_DIR) if f.endswith('.svg') and not f.startswith('_')):
    content = open(os.path.join(SVG_DIR, fname), encoding='utf-8').read()

    # Collect all rect elements with x,y,width,height
    rects = []
    for m in re.finditer(r'<rect\b([^>]*)/?>', content):
        attrs = m.group(1)
        x = get_attr_float(attrs, 'x')
        y = get_attr_float(attrs, 'y')
        w = get_attr_float(attrs, 'width')
        h = get_attr_float(attrs, 'height')
        if x is not None and y is not None and w is not None and h is not None:
            rects.append((x, y, w, h))

    # Find text elements containing arrows
    issues = []
    for m in re.finditer(r'(<text\b[^>]*>)(.*?)</text>', content, re.DOTALL):
        tag_open = m.group(1)
        text_content = m.group(2).strip()
        if not any(c in text_content for c in ARROW_CHARS):
            continue
        tx = get_attr_float(tag_open, 'x')
        ty = get_attr_float(tag_open, 'y')
        if tx is None or ty is None:
            continue

        # Find the nearest rect and check margins
        for (rx, ry, rw, rh) in rects:
            # Is the text anchor inside this rect?
            if rx <= tx <= rx + rw and ry <= ty <= ry + rh:
                margin_left   = tx - rx
                margin_top    = ty - ry
                margin_right  = (rx + rw) - tx
                margin_bottom = (ry + rh) - ty
                min_margin = min(margin_left, margin_top, margin_right, margin_bottom)
                if min_margin < 8:
                    issues.append(f'  text "{text_content}" at ({tx:.0f},{ty:.0f}) in rect ({rx:.0f},{ry:.0f} {rw:.0f}x{rh:.0f})  min_margin={min_margin:.1f}')

    if issues:
        print(f'\n=== {fname} ===')
        for i in issues:
            print(i)

print('\nDone.')
