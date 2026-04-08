"""
Recreate the user's paint mockup labyrinth exactly:
- 3 concentric rings, all band=23
- Maze gap in middle ring (upper-left ~330°)
- Maze gap in inner ring (lower-right ~155°)
- Radial walls at maze gap edges
- Wing-edge walls at all 4 wing cut positions
- Large center dot
- All rings extend fully to wing edges
"""
import math

cx, cy = 500, 500
band = 23  # wall thickness everywhere

# Wing cut angles (CW from 12 o'clock)
cut_tr = 45.5
cut_br = 140.1
cut_bl = 360 - cut_br  # 219.9
cut_tl = 360 - cut_tr  # 314.5

# Wing edge direction vectors
wux, wuy = -0.3282, 0.9446   # upper wing inner edge (right side)
wlx, wly = 0.3029, 0.9530    # lower wing inner edge (right side)

h = band / 2  # 11.5

# =====================
# RING RADII — evenly distributed from outer_in to dot
# =====================
# Outer ring (existing): edges at 229.5/206.5
outer_out, outer_in = 229.5, 206.5

# Center dot — gap to inner ring = ~20px (matches inter-ring passage)
# inner_in = 120.5, so dot_r = 120.5 - 20 = 100.5... that's huge
# Looking at the mockup: center is a medium dot with generous spacing
# Use ~40px gap to give breathing room
dot_r = 42

# Distribute evenly: outer_in=206.5 down to dot_r=30
# Layout: [outer ring] gap [mid ring] gap [inner ring] gap [dot]
# 3 bands (23 each = 69) + 3 gaps → gap = (206.5 - 30 - 69) / 3 ≈ 35.8
# But this leaves big gaps. Instead use tighter spacing:
gap = 20  # passage width between rings

mid_out = outer_in - gap              # 186.5
mid_in  = mid_out - band              # 163.5

inner_out = mid_in - gap              # 143.5
inner_in  = inner_out - band          # 120.5

print(f"Outer:  {outer_out}/{outer_in}")
print(f"Middle: {mid_out}/{mid_in}")
print(f"Inner:  {inner_out}/{inner_in}")
print(f"Dot:    r={dot_r}")
print(f"Gap ring-to-ring: {gap}")
print(f"Gap inner→dot: {inner_in - dot_r}")

# =====================
# MAZE GAP POSITIONS
# =====================
maze_gap_deg = 22  # angular width of maze openings (wider for visibility)

# Middle ring gap: upper-left area of top arc (~335°)
mid_gap_center = 335
mid_gap_s = mid_gap_center - maze_gap_deg/2  # 324
mid_gap_e = mid_gap_center + maze_gap_deg/2  # 346

# Inner ring gap: lower-right area of bottom arc (~165°)
inner_gap_center = 165
inner_gap_s = inner_gap_center - maze_gap_deg/2  # 154
inner_gap_e = inner_gap_center + maze_gap_deg/2  # 176

# =====================
# HELPER FUNCTIONS
# =====================
def pt(r, angle_deg):
    a = math.radians(angle_deg)
    return (cx + r * math.sin(a), cy - r * math.cos(a))

def fmt(p):
    return f'{p[0]:.1f},{p[1]:.1f}'

def wing_dir(angle_deg, is_upper):
    if is_upper:
        return (-wux, wuy) if angle_deg > 180 else (wux, wuy)
    else:
        return (-wlx, wly) if angle_deg > 180 else (wlx, wly)

def ray_circle(origin, d, r):
    ox, oy = origin[0] - cx, origin[1] - cy
    a_ = d[0]**2 + d[1]**2
    b_ = 2*(ox*d[0] + oy*d[1])
    c_ = ox**2 + oy**2 - r**2
    disc = b_**2 - 4*a_*c_
    if disc < 0:
        return None
    sq = math.sqrt(disc)
    best = None
    for t in [(-b_-sq)/(2*a_), (-b_+sq)/(2*a_)]:
        if t < 0.5:
            continue
        p = (origin[0]+t*d[0], origin[1]+t*d[1])
        dist = math.hypot(p[0]-origin[0], p[1]-origin[1])
        if best is None or dist < best[1]:
            best = (p, dist)
    return best[0] if best else None

def arc_band(ro, ri, start_deg, end_deg, start_cut=None, end_cut=None):
    """Filled arc band. start_cut/end_cut: 'upper'|'lower'|None."""
    span = (end_deg - start_deg) % 360
    large = 1 if span > 180 else 0

    os = pt(ro, start_deg)
    oe = pt(ro, end_deg)

    if start_cut:
        d = wing_dir(start_deg, start_cut == 'upper')
        iis = ray_circle(os, d, ri) or pt(ri, start_deg)
    else:
        iis = pt(ri, start_deg)

    if end_cut:
        d = wing_dir(end_deg, end_cut == 'upper')
        ie = ray_circle(oe, d, ri) or pt(ri, end_deg)
    else:
        ie = pt(ri, end_deg)

    return (f'  <path d="M {fmt(os)} A {ro},{ro} 0 {large},1 {fmt(oe)} '
            f'L {fmt(ie)} A {ri},{ri} 0 {large},0 {fmt(iis)} Z" fill="#000"/>')

def radial_wall(ro, ri, angle_deg):
    """Radial wall at angle_deg, width matching band thickness at that radius."""
    r_avg = (ro + ri) / 2
    half_w = math.degrees(band / (2 * r_avg))
    a1 = angle_deg - half_w
    a2 = angle_deg + half_w
    return (f'  <path d="M {fmt(pt(ro, a1))} L {fmt(pt(ro, a2))} '
            f'L {fmt(pt(ri, a2))} L {fmt(pt(ri, a1))} Z" fill="#000"/>')

def wing_wall(ro, ri, cut_angle, is_upper):
    """Wall along wing edge direction from ro to ri."""
    d = wing_dir(cut_angle, is_upper)
    perp = (-d[1], d[0])
    half_t = band / 2

    start = pt(ro, cut_angle)
    # Try both directions for ray intersection
    end = ray_circle(start, d, ri)
    if end is None:
        d2 = (-d[0], -d[1])
        end = ray_circle(start, d2, ri)
        if end is None:
            return ''
        d = d2
        perp = (-d[1], d[0])

    p1 = (start[0]+perp[0]*half_t, start[1]+perp[1]*half_t)
    p2 = (start[0]-perp[0]*half_t, start[1]-perp[1]*half_t)
    p3 = (end[0]-perp[0]*half_t, end[1]-perp[1]*half_t)
    p4 = (end[0]+perp[0]*half_t, end[1]+perp[1]*half_t)
    return (f'  <path d="M {fmt(p1)} L {fmt(p2)} L {fmt(p3)} L {fmt(p4)} Z" fill="#000"/>')

# =====================
# BUILD SVG ELEMENTS
# =====================
lines = []

# --- OUTER RING ---
lines.append('  <!-- OUTER RING -->')
lines.append(arc_band(outer_out, outer_in, cut_tl, cut_tr, 'upper', 'upper'))
lines.append(arc_band(outer_out, outer_in, cut_br, cut_bl, 'lower', 'lower'))

# --- MIDDLE RING (maze gap at ~335°, upper-left of top arc) ---
lines.append('')
lines.append('  <!-- MIDDLE RING (gap at 335°) -->')
# Top arc: split at maze gap
lines.append(arc_band(mid_out, mid_in, cut_tl, mid_gap_s, 'upper', None))
lines.append(arc_band(mid_out, mid_in, mid_gap_e, cut_tr, None, 'upper'))
# Bottom arc: solid
lines.append(arc_band(mid_out, mid_in, cut_br, cut_bl, 'lower', 'lower'))

# --- INNER RING (maze gap at ~165°, lower-right of bottom arc) ---
lines.append('')
lines.append('  <!-- INNER RING (gap at 165°) -->')
# Top arc: solid
lines.append(arc_band(inner_out, inner_in, cut_tl, cut_tr, 'upper', 'upper'))
# Bottom arc: split at maze gap
lines.append(arc_band(inner_out, inner_in, cut_br, inner_gap_s, 'lower', None))
lines.append(arc_band(inner_out, inner_in, inner_gap_e, cut_bl, None, 'lower'))

# --- RADIAL WALLS at maze gap edges ---
lines.append('')
lines.append('  <!-- RADIAL WALLS at maze gap edges -->')
# Middle gap edges: connect outer→middle
lines.append(radial_wall(outer_in, mid_out, mid_gap_s))
lines.append(radial_wall(outer_in, mid_out, mid_gap_e))
# Inner gap edges: connect middle→inner
lines.append(radial_wall(mid_in, inner_out, inner_gap_s))
lines.append(radial_wall(mid_in, inner_out, inner_gap_e))

# --- CENTER DOT ---
lines.append('')
lines.append('  <!-- CENTER DOT -->')
lines.append(f'  <circle cx="{cx}" cy="{cy}" r="{dot_r}" fill="#000"/>')

# =====================
# ASSEMBLE FULL SVG
# =====================
wing_path = ('M 861.578 -98.713 L 563.415 27.001 L 506.665 190.535 '
             'L 505.339 245.337 L 506.665 304.623 L 561.925 478.568 '
             'C 563.395 481.868 692.759 425.398 692.759 425.398 '
             'L 715.449 353.554 L 596.985 403.418 L 596.985 380.027 '
             'L 723.969 326.579 L 750.602 242.257 L 596.985 306.917 '
             'L 596.985 283.529 L 759.122 215.283 L 786.5 128.605 '
             'L 596.985 208.373 L 596.985 184.984 L 795.021 101.627 '
             'L 821.117 18.997 L 596.985 113.34 L 596.985 89.95 '
             'L 829.777 -8.038 L 861.578 -98.713 Z')

svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">

{chr(10).join(lines)}

  <!-- Right wing -->
  <g transform="translate(31.32, 36.62) scale(2)">
    <g transform="matrix(0.427557, 0, 0, 0.427557, 81.181313, 139.319397)">
      <path fill="#000" d="{wing_path}"/>
    </g>
  </g>

  <!-- Left wing (mirror) -->
  <g transform="translate(1000, 0) scale(-1, 1)">
    <g transform="translate(31.32, 36.62) scale(2)">
      <g transform="matrix(0.427557, 0, 0, 0.427557, 81.181313, 139.319397)">
        <path fill="#000" d="{wing_path}"/>
      </g>
    </g>
  </g>
</svg>'''

with open('icon-draft-labyrinth.svg', 'w', encoding='utf-8') as f:
    f.write(svg)
print("\nWrote icon-draft-labyrinth.svg")
