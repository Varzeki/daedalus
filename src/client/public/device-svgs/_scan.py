"""
Scan SVGs: show viewBox, header text y-position, and element bounds for cropping analysis.
"""
import re, os, xml.etree.ElementTree as ET, math

SVG_DIR = r'r:\BiologicalsUpdate\daedalus\src\client\public\device-svgs'

def pf(s):
    return float(s.replace('px','').strip()) if s else None

def mat_from_str(s):
    s = s.strip()
    m = re.match(r'matrix\s*\(([^)]+)\)', s)
    if m:
        v = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
        if len(v) == 6:
            return v  # [a,b,c,d,e,f]
    m = re.match(r'translate\s*\(([^)]+)\)', s)
    if m:
        v = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip()) if x]
        return [1,0,0,1,v[0], v[1] if len(v)>1 else 0]
    return [1,0,0,1,0,0]

def concat(m1, m2):
    a = m1[0]*m2[0]+m1[2]*m2[1]; b = m1[1]*m2[0]+m1[3]*m2[1]
    c = m1[0]*m2[2]+m1[2]*m2[3]; d = m1[1]*m2[2]+m1[3]*m2[3]
    e = m1[0]*m2[4]+m1[2]*m2[5]+m1[4]; f = m1[1]*m2[4]+m1[3]*m2[5]+m1[5]
    return [a,b,c,d,e,f]

def apply_mat(m, x, y):
    return m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]

for fname in sorted(f for f in os.listdir(SVG_DIR) if f.endswith('.svg') and not f.startswith('_')):
    content = open(os.path.join(SVG_DIR, fname), encoding='utf-8').read()
    
    vb = re.search(r'viewBox="([^"]+)"', content)
    vb = vb.group(1) if vb else 'none'
    
    # Find header (large font text)
    hdrs = re.findall(r'<text\b[^>]*font-size:(\d+)px[^>]*>([^<]+)</text>', content)
    big = [(int(sz), txt.strip()) for sz, txt in hdrs if int(sz) >= 80]
    
    print(f'{fname[:45]:46} vb={vb:20} HDR:{big[:1]}')
