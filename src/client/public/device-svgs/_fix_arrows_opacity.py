"""
Analyse and fix two issues across device SVGs:
  1. Reduce opacity of device photo <use> elements to 0.75
  2. Find <text> arrow elements (↑↓←→) that overlap the stroke of their
     bounding <rect>, and push them inward so no glyph pixels cross the border.

Transform evaluation: walks the ancestor <g transform="..."> chain and
multiplies matrices accumlatively (row-vector convention used in SVG spec).
"""

import re
import os
import math
import xml.etree.ElementTree as ET

SVG_DIR = os.path.dirname(os.path.abspath(__file__))
ARROWS  = set('↑↓←→')
NS      = {'svg': 'http://www.w3.org/2000/svg'}

# ── Matrix helpers ─────────────────────────────────────────────────────────────

class Mat:
    """Immutable 2-D affine matrix [a c e / b d f / 0 0 1]."""
    __slots__ = ('a','b','c','d','e','f')

    def __init__(self, a=1,b=0,c=0,d=1,e=0,f=0):
        self.a,self.b,self.c,self.d,self.e,self.f = a,b,c,d,e,f

    @staticmethod
    def identity():
        return Mat()

    @staticmethod
    def from_string(s):
        """Parse transform="matrix(a,b,c,d,e,f)" or translate(tx[,ty])."""
        s = s.strip()
        m = re.match(r'matrix\s*\(([^)]+)\)', s)
        if m:
            vals = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
            if len(vals) == 6:
                return Mat(*vals)
        m = re.match(r'translate\s*\(([^)]+)\)', s)
        if m:
            vals = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
            tx = vals[0]; ty = vals[1] if len(vals) > 1 else 0
            return Mat(1,0,0,1,tx,ty)
        m = re.match(r'scale\s*\(([^)]+)\)', s)
        if m:
            vals = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
            sx = vals[0]; sy = vals[1] if len(vals) > 1 else sx
            return Mat(sx,0,0,sy,0,0)
        return Mat.identity()

    def concat(self, other):
        """Return self * other (apply self first, then other)."""
        a = self.a*other.a + self.b*other.c
        b = self.a*other.b + self.b*other.d
        c = self.c*other.a + self.d*other.c
        d = self.c*other.b + self.d*other.d
        e = self.e*other.a + self.f*other.c + other.e
        f = self.e*other.b + self.f*other.d + other.f
        return Mat(a,b,c,d,e,f)

    def apply(self, x, y):
        """Transform point (x, y) by this matrix."""
        return (self.a*x + self.c*y + self.e,
                self.b*x + self.d*y + self.f)

    def scale_x(self):
        return math.sqrt(self.a**2 + self.b**2)

    def scale_y(self):
        return math.sqrt(self.c**2 + self.d**2)

# ── Parse float from SVG attribute (strips "px") ──────────────────────────────

def pf(s):
    if s is None:
        return None
    return float(s.replace('px','').strip())

# ── Walk element tree collecting transforms ───────────────────────────────────

def build_abs_positions(root):
    """
    DFS through the element tree; for each element collect:
      - 'text_arrows': list of (elem, abs_x, abs_y, font_size)
      - 'rects':       list of (elem, abs_x, abs_y, abs_w, abs_h)
      - 'uses':        list of (elem, is_photo)
    """
    text_arrows = []
    rects       = []
    uses        = []

    def walk(el, ctm):
        tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag
        # Accumulate transform
        t = el.get('transform','')
        if t:
            m = Mat.from_string(t)
            local_ctm = ctm.concat(m)
        else:
            local_ctm = ctm

        if tag == 'text':
            raw_x = pf(el.get('x'))
            raw_y = pf(el.get('y'))
            if raw_x is not None and raw_y is not None:
                text = ''.join(el.itertext()).strip()
                if any(c in text for c in ARROWS):
                    ax, ay = local_ctm.apply(raw_x, raw_y)
                    # font-size from style attribute
                    style = el.get('style','')
                    fm = re.search(r'font-size\s*:\s*([\d.]+)', style)
                    fs = float(fm.group(1)) if fm else 12.0
                    # Scale font-size by CTM y-scale
                    eff_fs = fs * local_ctm.scale_y()
                    text_arrows.append({'el': el, 'ax': ax, 'ay': ay,
                                        'eff_fs': eff_fs, 'text': text,
                                        'raw_x': raw_x, 'raw_y': raw_y,
                                        'ctm': local_ctm})

        elif tag == 'rect':
            raw_x = pf(el.get('x'))
            raw_y = pf(el.get('y'))
            raw_w = pf(el.get('width'))
            raw_h = pf(el.get('height'))
            style = el.get('style','')
            if raw_x is not None and raw_y is not None and raw_w is not None and raw_h is not None:
                # Transform all four corners
                x0, y0 = local_ctm.apply(raw_x, raw_y)
                x1, y1 = local_ctm.apply(raw_x + raw_w, raw_y)
                x2, y2 = local_ctm.apply(raw_x, raw_y + raw_h)
                x3, y3 = local_ctm.apply(raw_x + raw_w, raw_y + raw_h)
                abs_x  = min(x0,x1,x2,x3)
                abs_y  = min(y0,y1,y2,y3)
                abs_w  = max(x0,x1,x2,x3) - abs_x
                abs_h  = max(y0,y1,y2,y3) - abs_y
                # stroke-width in absolute units
                swm = re.search(r'stroke-width\s*:\s*([\d.]+)', style)
                sw_raw = float(swm.group(1)) if swm else 1.0
                # Use geometric mean of scales for stroke-width
                scale = math.sqrt(local_ctm.scale_x() * local_ctm.scale_y())
                sw_abs = sw_raw * scale
                rects.append({'el': el, 'ax': abs_x, 'ay': abs_y,
                              'aw': abs_w, 'ah': abs_h, 'sw': sw_abs,
                              'ctm': local_ctm, 'raw_x': raw_x, 'raw_y': raw_y,
                              'raw_w': raw_w, 'raw_h': raw_h})

        elif tag == 'use':
            href = el.get('{http://www.w3.org/1999/xlink}href','')
            is_photo = bool(re.search(r'#_Image', href))
            uses.append({'el': el, 'is_photo': is_photo})

        for child in el:
            walk(child, local_ctm)

    walk(root, Mat.identity())
    return text_arrows, rects, uses


def find_containing_rect(arrow, rects):
    """
    Find the rect whose bounding box strictly contains the arrow's text anchor.
    If multiple rects contain the anchor, prefer the smallest area (tightest fit).
    Returns None if no rect strictly contains the anchor.
    """
    ax, ay = arrow['ax'], arrow['ay']
    best = None
    best_area = float('inf')
    for r in rects:
        rx1 = r['ax']
        ry1 = r['ay']
        rx2 = rx1 + r['aw']
        ry2 = ry1 + r['ah']
        # Strict containment only — anchor must be inside the rect box
        if rx1 < ax < rx2 and ry1 < ay < ry2:
            area = r['aw'] * r['ah']
            if area < best_area:
                best = r
                best_area = area
    return best


# ── Main ──────────────────────────────────────────────────────────────────────

def process_svg(path):
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
    ET.register_namespace('serif', 'http://www.serif.com/')
    ET.register_namespace('dc', 'http://purl.org/dc/elements/1.1/')
    ET.register_namespace('cc', 'http://creativecommons.org/ns#')
    ET.register_namespace('rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#')
    ET.register_namespace('sodipodi', 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd')
    ET.register_namespace('inkscape', 'http://www.inkscape.org/namespaces/inkscape')

    # Use raw string editing for actual modifications to avoid namespace mangling
    content = open(path, encoding='utf-8').read()
    original = content

    # Parse for analysis only
    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except ET.ParseError as e:
        print(f'  PARSE ERROR: {e}')
        return False

    text_arrows, rects, uses = build_abs_positions(root)

    changes = []

    # ── Fix 1: Find arrows overlapping rect borders ───────────────────────────
    for arrow in text_arrows:
        rect = find_containing_rect(arrow, rects)
        if rect is None:
            continue

        ax, ay = arrow['ax'], arrow['ay']
        eff_fs = arrow['eff_fs']
        sw     = rect['sw']

        # Estimate glyph bounding box (text-anchor=start baseline at ay)
        # Arrow glyphs: width ≈ 0.5 * font-size, ascent ≈ 0.75 * font-size, descent ≈ 0.2 * font-size
        g_left   = ax
        g_right  = ax + 0.55 * eff_fs
        g_top    = ay - 0.80 * eff_fs
        g_bottom = ay + 0.15 * eff_fs

        # Inner edges of the rect box (where content should be)
        inner_left   = rect['ax'] + sw / 2 + 2    # +2 margin
        inner_right  = rect['ax'] + rect['aw'] - sw / 2 - 2
        inner_top    = rect['ay'] + sw / 2 + 2
        inner_bottom = rect['ay'] + rect['ah'] - sw / 2 - 2

        # Compute needed adjustment in absolute SVG space
        dx = 0.0
        dy = 0.0
        if g_left < inner_left:
            dx = inner_left - g_left
        if g_right > inner_right:
            dx = min(dx if dx != 0 else float('inf'), 0) - (g_right - inner_right) if dx == 0 else dx
        if g_top < inner_top:
            dy = inner_top - g_top
        if g_bottom > inner_bottom:
            dy = -(g_bottom - inner_bottom)

        MAX_NUDGE_ABS = 30  # SVG units — ignore huge moves (wrong-rect matches)
        if (abs(dx) > 0.5 or abs(dy) > 0.5) and abs(dx) <= MAX_NUDGE_ABS and abs(dy) <= MAX_NUDGE_ABS:
            # Convert delta back to local (pre-transform) coordinates.
            # Assuming no rotation (c=b≈0): delta_rawx = dx / ctm.a, delta_rawy = dy / ctm.d
            ctm = arrow['ctm']
            drx = dx / ctm.a if abs(ctm.a) > 0.01 else 0.0
            dry = dy / ctm.d if abs(ctm.d) > 0.01 else 0.0

            changes.append({
                'type': 'nudge_text',
                'arrow': arrow,
                'drx': drx,
                'dry': dry,
                'reason': f'arrow "{arrow["text"]}" abs=({ax:.0f},{ay:.0f}) '
                          f'glyph top={g_top:.0f} rect_inner_top={inner_top:.0f} '
                          f'dx={dx:.1f} dy={dy:.1f}'
            })

    # ── Fix 2: Set photo <use> opacity to 0.75 ────────────────────────────────
    for u in uses:
        if u['is_photo']:
            el = u['el']
            if el.get('opacity','') not in ('0.75',):
                changes.append({'type': 'use_opacity', 'el': el})

    if not changes:
        return False

    # Apply changes via regex on raw content
    for c in changes:
        if c['type'] == 'use_opacity':
            el = c['el']
            href = el.get('{http://www.w3.org/1999/xlink}href','')
            # Regex: find <use ... filter="url(#_devicePhoto)"/> and add/replace opacity
            def add_opacity(m):
                tag = m.group()
                if 'opacity=' in tag:
                    tag = re.sub(r'\bopacity="[^"]*"', 'opacity="0.75"', tag)
                else:
                    tag = tag.rstrip('/>').rstrip()
                    tag += ' opacity="0.75"/>'
                return tag
            content = re.sub(r'<use\b[^>]*filter="url\(#_devicePhoto\)"[^>]*/>', add_opacity, content)

        elif c['type'] == 'nudge_text':
            arrow = c['arrow']
            drx   = c['drx']
            dry   = c['dry']
            raw_x = arrow['raw_x']
            raw_y = arrow['raw_y']
            new_x = raw_x + drx
            new_y = raw_y + dry
            # Replace exact x="..." y="..." in the text tag
            old_x_str = f'x="{raw_x}px"' if str(raw_x).endswith('0') or '.' in str(raw_x) else f'x="{raw_x}px"'
            # More robust: find the exact text element by its content and position
            arrow_char = arrow['text']
            pattern = (r'(<text\b[^>]*\bx="' + re.escape(f'{raw_x}px') +
                       r'"[^>]*\by="' + re.escape(f'{raw_y}px') +
                       r'"[^>]*>)(' + re.escape(arrow_char) + r')(</text>)')
            def fix_pos(m):
                open_tag = m.group(1)
                char     = m.group(2)
                close    = m.group(3)
                open_tag = re.sub(r'\bx="[^"]*"', f'x="{new_x:.3f}px"', open_tag)
                open_tag = re.sub(r'\by="[^"]*"', f'y="{new_y:.3f}px"', open_tag)
                return open_tag + char + close
            new_content = re.sub(pattern, fix_pos, content)
            if new_content == content:
                # try with y before x
                pattern2 = (r'(<text\b[^>]*\by="' + re.escape(f'{raw_y}px') +
                            r'"[^>]*\bx="' + re.escape(f'{raw_x}px') +
                            r'"[^>]*>)(' + re.escape(arrow_char) + r')(</text>)')
                def fix_pos2(m):
                    open_tag = m.group(1)
                    char     = m.group(2)
                    close    = m.group(3)
                    open_tag = re.sub(r'\bx="[^"]*"', f'x="{new_x:.3f}px"', open_tag)
                    open_tag = re.sub(r'\by="[^"]*"', f'y="{new_y:.3f}px"', open_tag)
                    return open_tag + char + close
                new_content = re.sub(pattern2, fix_pos2, content)
            if new_content != content:
                print(f'    nudged {c["reason"]}')
            content = new_content

    if content != original:
        open(path, 'w', encoding='utf-8').write(content)
        return True
    return False


def main():
    svgs = [f for f in os.listdir(SVG_DIR) if f.endswith('.svg') and not f.startswith('_')]
    edited = 0
    for fname in sorted(svgs):
        fpath = os.path.join(SVG_DIR, fname)
        print(f'{fname}')
        changed = process_svg(fpath)
        if changed:
            print(f'  -> edited')
            edited += 1
        else:
            print(f'  -> unchanged')
    print(f'\nDone. {edited}/{len(svgs)} SVGs edited.')


if __name__ == '__main__':
    main()
