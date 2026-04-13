"""
Find minimum absolute y-coordinate of visible content (excluding header text)
in each SVG, using proper CTM accumulation. Outputs cropY per SVG.
"""
import re, os, math, xml.etree.ElementTree as ET

SVG_DIR = r'r:\BiologicalsUpdate\daedalus\src\client\public\device-svgs'

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
        return [1,0,0,1, v[0], v[1] if len(v)>1 else 0]
    m = re.match(r'scale\s*\(([^)]+)\)', s)
    if m:
        v = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
        sx = v[0]; sy = v[1] if len(v)>1 else sx
        return [sx,0,0,sy,0,0]
    return [1,0,0,1,0,0]

def concat(m1, m2):
    return [
        m1[0]*m2[0]+m1[2]*m2[1], m1[1]*m2[0]+m1[3]*m2[1],
        m1[0]*m2[2]+m1[2]*m2[3], m1[1]*m2[2]+m1[3]*m2[3],
        m1[0]*m2[4]+m1[2]*m2[5]+m1[4], m1[1]*m2[4]+m1[3]*m2[5]+m1[5]
    ]

def apply_mat(m, x, y):
    return m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]

def pf(s):
    return float(s.replace('px','').strip()) if s else None

def walk(el, ctm, in_defs, results):
    """Walk tree, computing absolute bounding boxes."""
    tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag

    if tag == 'defs':
        in_defs = True

    t = el.get('transform', '')
    local_ctm = concat(ctm, mat_from_str(t)) if t else ctm

    if not in_defs:
        if tag == 'text':
            # Skip large (header) text
            style = el.get('style','')
            fsm = re.search(r'font-size\s*:\s*(\d+)', style)
            fs = int(fsm.group(1)) if fsm else 0
            if fs >= 80:
                return  # skip header
            raw_x = pf(el.get('x'))
            raw_y = pf(el.get('y'))
            if raw_x is not None and raw_y is not None:
                _, ay = apply_mat(local_ctm, raw_x, raw_y)
                results.append(('text', ay))

        elif tag == 'rect':
            raw_x = pf(el.get('x'))
            raw_y = pf(el.get('y'))
            raw_h = pf(el.get('height'))
            if raw_x is not None and raw_y is not None:
                _, ay0 = apply_mat(local_ctm, raw_x, raw_y or 0)
                _, ay1 = apply_mat(local_ctm, raw_x, (raw_y or 0) + (raw_h or 0))
                results.append(('rect', min(ay0, ay1)))

        elif tag == 'use':
            raw_x = pf(el.get('x'))
            raw_y = pf(el.get('y'))
            raw_h = pf(el.get('height'))
            href = el.get('{http://www.w3.org/1999/xlink}href', '')
            if '_Image' in href and raw_y is not None:
                _, ay = apply_mat(local_ctm, raw_x or 0, raw_y)
                results.append(('use', ay))

        elif tag in ('path', 'line', 'ellipse', 'circle'):
            # Approximate: use transform e (y-translation)
            results.append((tag, local_ctm[5]))

    for child in el:
        walk(child, local_ctm, in_defs, results)


for fname in sorted(f for f in os.listdir(SVG_DIR) if f.endswith('.svg') and not f.startswith('_')):
    content = open(os.path.join(SVG_DIR, fname), encoding='utf-8').read()
    
    # Skip SVGs without headers
    has_header = bool(re.search(r'font-size:144px', content))
    
    vb = re.search(r'viewBox="([^"]+)"', content)
    vb_vals = [float(x) for x in vb.group(1).split()] if vb else [0,0,3840,2160]
    vb_h = vb_vals[3]
    
    if not has_header:
        print(f'{fname[:50]:52} NO HEADER  vb_h={vb_h:.0f}')
        continue

    try:
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
        root = ET.parse(os.path.join(SVG_DIR, fname)).getroot()
    except Exception as e:
        print(f'{fname}: PARSE ERROR {e}')
        continue

    results = []
    walk(root, [1,0,0,1,0,0], False, results)

    if results:
        min_y = min(v for _, v in results)
        # Exclude wildly negative values (artefacts)
        rect_ys = [v for t, v in results if t == 'rect' and v >= 0]
        use_ys  = [v for t, v in results if t == 'use'  and v >= 0]
        min_rect = min(rect_ys) if rect_ys else 9999
        min_use  = min(use_ys)  if use_ys  else 9999
        content_min = min(min_rect, min_use)
        crop_y = max(0, int(content_min) - 20) if content_min < 9999 else 0
        new_h = int(vb_h) - crop_y
        print(f'{fname[:50]:52} min_rect={min_rect:.0f}  min_use={min_use:.0f}  crop_y={crop_y}  new_h={new_h}')
    else:
        print(f'{fname[:50]:52} NO CONTENT')
