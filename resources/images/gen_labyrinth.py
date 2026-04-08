import math

cx, cy = 500, 500

cut_tr = 45.5
cut_br = 140.1
cut_bl = 360 - cut_br  # 219.9
cut_tl = 360 - cut_tr  # 314.5

wux, wuy = -0.3282, 0.9446
wlx, wly = 0.3029, 0.9530

def pt(r, angle_deg):
    a = math.radians(angle_deg)
    return (cx + r * math.sin(a), cy - r * math.cos(a))

def fmt(p):
    return f'{p[0]:.1f},{p[1]:.1f}'

def find_inner_pt(outer_pt, r_in, direction):
    d = direction
    a_ = d[0]**2 + d[1]**2
    b_ = 2*((outer_pt[0]-cx)*d[0] + (outer_pt[1]-cy)*d[1])
    c_ = (outer_pt[0]-cx)**2 + (outer_pt[1]-cy)**2 - r_in**2
    disc = b_**2 - 4*a_*c_
    if disc < 0:
        return None
    t1 = (-b_ - math.sqrt(disc))/(2*a_)
    t2 = (-b_ + math.sqrt(disc))/(2*a_)
    best = None
    for t in [t1, t2]:
        p = (outer_pt[0]+t*d[0], outer_pt[1]+t*d[1])
        dist = math.sqrt((p[0]-outer_pt[0])**2 + (p[1]-outer_pt[1])**2)
        if 0 < dist < 200 and (best is None or dist < best[1]):
            best = (p, dist)
    return best[0] if best else None

def wing_dir_for_angle(angle_deg):
    if angle_deg > 180:
        return (-wux, wuy)  # left side mirror
    else:
        return (wux, wuy)

def wing_dir_for_angle_lower(angle_deg):
    if angle_deg > 180:
        return (-wlx, wly)
    else:
        return (wlx, wly)

def arc_band(r_out, r_in, start_deg, end_deg, start_cut='none', end_cut='none'):
    span = (end_deg - start_deg) % 360
    large = 1 if span > 180 else 0

    os = pt(r_out, start_deg)
    oe = pt(r_out, end_deg)

    if start_cut == 'upper':
        d = wing_dir_for_angle(start_deg)
        iis = find_inner_pt(os, r_in, d) or pt(r_in, start_deg)
    elif start_cut == 'lower':
        d = wing_dir_for_angle_lower(start_deg)
        iis = find_inner_pt(os, r_in, d) or pt(r_in, start_deg)
    else:
        iis = pt(r_in, start_deg)

    if end_cut == 'upper':
        d = wing_dir_for_angle(end_deg)
        ie = find_inner_pt(oe, r_in, d) or pt(r_in, end_deg)
    elif end_cut == 'lower':
        d = wing_dir_for_angle_lower(end_deg)
        ie = find_inner_pt(oe, r_in, d) or pt(r_in, end_deg)
    else:
        ie = pt(r_in, end_deg)

    return f'  <path d="M {fmt(os)} A {r_out},{r_out} 0 {large},1 {fmt(oe)} L {fmt(ie)} A {r_in},{r_in} 0 {large},0 {fmt(iis)} Z" fill="#000"/>'

def radial_wall(r_outer, r_inner, angle_deg, width_deg=3):
    a1 = angle_deg - width_deg/2
    a2 = angle_deg + width_deg/2
    p1 = pt(r_outer, a1)
    p2 = pt(r_outer, a2)
    p3 = pt(r_inner, a2)
    p4 = pt(r_inner, a1)
    return f'  <path d="M {fmt(p1)} L {fmt(p2)} L {fmt(p3)} L {fmt(p4)} Z" fill="#000"/>'

lines = []

lines.append('  <!-- OUTER RING (r=218, band=23) -->')
lines.append(arc_band(229.5, 206.5, cut_tl, cut_tr, 'upper', 'upper'))
lines.append(arc_band(229.5, 206.5, cut_br, cut_bl, 'lower', 'lower'))

lines.append('  <!-- MIDDLE RING (r=158, band=20) — maze gap at top (352-8 deg) -->')
lines.append(arc_band(168, 148, cut_tl, 352, 'upper', 'none'))
lines.append(arc_band(168, 148, 8, cut_tr, 'none', 'upper'))
lines.append(arc_band(168, 148, cut_br, cut_bl, 'lower', 'lower'))

lines.append('  <!-- INNER RING (r=101, band=18) — maze gap at bottom (172-188 deg) -->')
lines.append(arc_band(110, 92, cut_tl, cut_tr, 'upper', 'upper'))
lines.append(arc_band(110, 92, cut_br, 172, 'lower', 'none'))
lines.append(arc_band(110, 92, 188, cut_bl, 'none', 'lower'))

lines.append('  <!-- RADIAL WALLS -->')
lines.append('  <!-- Outer-to-Middle at top gap edges -->')
lines.append(radial_wall(206.5, 168, 352, 3))
lines.append(radial_wall(206.5, 168, 8, 3))
lines.append('  <!-- Middle-to-Inner at bottom gap edges -->')
lines.append(radial_wall(148, 110, 172, 3))
lines.append(radial_wall(148, 110, 188, 3))

lines.append('  <!-- CENTER DOT -->')
lines.append(f'  <circle cx="{cx}" cy="{cy}" r="18" fill="#000"/>')

print('\n'.join(lines))
