"""
Two-pass SVG processor:
  Pass 1 — Remove <text> header elements (font-size >= 80px)
  Pass 2 — Crop viewBox: raise the y origin to just above the first visible
            content element (label boxes / device photos), eliminating the
            whitespace that the header occupied.

Outputs a JS snippet for SVG_DIMS so the label overlay can be updated.
SVGs without a header (VKB variants, Saitek X45) are skipped.
"""

import re, os, math, xml.etree.ElementTree as ET

SVG_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Matrix helpers ─────────────────────────────────────────────────────────────
def mat_from_str(s):
    s = s.strip()
    m = re.match(r'matrix\s*\(([^)]+)\)', s)
    if m:
        v = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
        if len(v) == 6:
            return v
    m = re.match(r'translate\s*\(([^)]+)\)', s)
    if m:
        v = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
        return [1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0]
    m = re.match(r'scale\s*\(([^)]+)\)', s)
    if m:
        v = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
        sx = v[0]; sy = v[1] if len(v) > 1 else sx
        return [sx, 0, 0, sy, 0, 0]
    return [1, 0, 0, 1, 0, 0]

def concat(m1, m2):
    return [
        m1[0]*m2[0]+m1[2]*m2[1], m1[1]*m2[0]+m1[3]*m2[1],
        m1[0]*m2[2]+m1[2]*m2[3], m1[1]*m2[2]+m1[3]*m2[3],
        m1[0]*m2[4]+m1[2]*m2[5]+m1[4], m1[1]*m2[4]+m1[3]*m2[5]+m1[5]
    ]

def apply_mat(m, x, y):
    return m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]

def pf(s):
    return float(s.replace('px', '').strip()) if s else None


# ── Find minimum y of visible content (excluding defs, excluding headers) ─────
def find_content_min_y(root_el):
    """
    DFS through element tree accumulating CTM. Returns the minimum absolute y
    of rects (label boxes) and <use> device photo elements at the top level
    (not inside <defs>).  Excludes <text> with font-size >= 80.
    """
    best_y = []

    def walk(el, ctm, in_defs):
        tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag

        if tag == 'defs':
            in_defs = True

        t = el.get('transform', '')
        m = mat_from_str(t) if t else None
        local_ctm = concat(ctm, m) if m else ctm

        if not in_defs:
            if tag == 'text':
                style = el.get('style', '')
                fsm = re.search(r'font-size\s*:\s*(\d+)', style)
                fs = int(fsm.group(1)) if fsm else 0
                if fs < 80:  # only small arrow/label texts
                    ry = pf(el.get('y'))
                    if ry is not None:
                        _, ay = apply_mat(local_ctm, pf(el.get('x')) or 0, ry)
                        best_y.append(ay)

            elif tag == 'rect':
                ry = pf(el.get('y'))
                rh = pf(el.get('height')) or 0
                if ry is not None and ry >= 0:
                    _, ay0 = apply_mat(local_ctm, pf(el.get('x')) or 0, ry)
                    _, ay1 = apply_mat(local_ctm, pf(el.get('x')) or 0, ry + rh)
                    y_top = min(ay0, ay1)
                    if y_top >= 0:
                        best_y.append(y_top)

            elif tag == 'use':
                href = el.get('{http://www.w3.org/1999/xlink}href', '')
                if '#_Image' in href:
                    ry = pf(el.get('y'))
                    if ry is not None and ry >= 0:
                        _, ay = apply_mat(local_ctm, pf(el.get('x')) or 0, ry)
                        if ay >= 0:
                            best_y.append(ay)

        for child in el:
            walk(child, local_ctm, in_defs)

    walk(root_el, [1, 0, 0, 1, 0, 0], False)
    return min(best_y) if best_y else None


# ── Main ──────────────────────────────────────────────────────────────────────
def process_svg(fpath):
    content = open(fpath, encoding='utf-8').read()

    # Check for header text
    has_header = bool(re.search(r'font-size\s*:\s*(?:144|120|108|96|80)px', content))
    if not has_header:
        return None  # skip

    original = content

    # ── Pass 1: Remove header text elements ───────────────────────────────────
    # Match full <text ...>...</text> where style contains a large font-size
    def remove_header_text(m):
        open_tag = m.group(1)
        style = re.search(r'style="([^"]*)"', open_tag)
        if style:
            fsm = re.search(r'font-size\s*:\s*(\d+)', style.group(1))
            if fsm and int(fsm.group(1)) >= 80:
                return ''  # remove
        return m.group(0)

    content = re.sub(
        r'(<text\b[^>]*>)(.*?)(</text>)',
        remove_header_text,
        content,
        flags=re.DOTALL
    )

    # ── Pass 2: Compute crop_y from content bounds ─────────────────────────────
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
    try:
        # Parse the HEADER-REMOVED content for accurate bounds
        root = ET.fromstring(content)
    except ET.ParseError as e:
        print(f'  PARSE ERROR: {e}')
        return None

    min_y = find_content_min_y(root)
    if min_y is None or min_y < 0:
        print(f'  WARNING: could not determine content min_y, skipping crop')
        # Still write header-removed version
        if content != original:
            open(fpath, 'w', encoding='utf-8').write(content)
        return None

    PADDING = 20  # SVG units of whitespace above first element
    crop_y = max(0, int(min_y) - PADDING)

    # Parse current viewBox
    vb_m = re.search(r'viewBox="([^"]+)"', content)
    if not vb_m:
        print(f'  WARNING: no viewBox, skipping crop')
        if content != original:
            open(fpath, 'w', encoding='utf-8').write(content)
        return None

    vb_vals = vb_m.group(1).split()
    vb_x, vb_y = float(vb_vals[0]), float(vb_vals[1])
    vb_w, vb_h = float(vb_vals[2]), float(vb_vals[3])

    new_y = vb_y + crop_y
    new_h = vb_h - crop_y

    new_vb = f'{vb_x:.0f} {new_y:.0f} {vb_w:.0f} {new_h:.0f}'
    content = re.sub(r'viewBox="[^"]+"', f'viewBox="{new_vb}"', content, count=1)

    if content != original:
        open(fpath, 'w', encoding='utf-8').write(content)

    return {
        'w': int(vb_w),
        'h': int(new_h),
        'cropY': crop_y
    }


def main():
    svgs = sorted(f for f in os.listdir(SVG_DIR) if f.endswith('.svg') and not f.startswith('_'))
    dims = {}
    edited = 0

    for fname in svgs:
        fpath = os.path.join(SVG_DIR, fname)
        result = process_svg(fpath)
        if result is None:
            print(f'  skipped: {fname}')
        else:
            dims[fname] = result
            print(f'  edited: {fname}  cropY={result["cropY"]}  new_h={result["h"]}')
            edited += 1

    print(f'\nDone. {edited}/{len(svgs)} SVGs edited.')
    print('\n// ── SVG_DIMS update for keybinds-visual.js ──────────────────────────────────')
    print('const SVG_DIMS = {')
    # Always keep X45 entry
    print("  'Saitek X45.svg': { w: 5120, h: 2880 },")
    for fname, d in sorted(dims.items()):
        print(f"  '{fname}': {{ w: {d['w']}, h: {d['h']}, cropY: {d['cropY']} }},")
    print('}')
    print('const SVG_DEF = { w: 3840, h: 2160 }')


if __name__ == '__main__':
    main()
