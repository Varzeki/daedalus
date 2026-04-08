"""
Labyrinth icon generator — correct geometry.
Each ring extends to where it intersects the wing edge LINE,
not to a fixed angle. This ensures all rings reach the wings.
"""
import math

cx, cy = 500, 500
band = 23  # wall thickness everywhere

# Wing edge direction vectors (from earlier calculations)
wux, wuy = -0.3282, 0.9446   # upper wing inner edge (right side)
wlx, wly = 0.3029, 0.9530    # lower wing inner edge (right side)

# Outer ring (established)
outer_out, outer_in = 229.5, 206.5

# Known cut angles on the OUTER ring
cut_tr = 45.5    # top-right on outer circle
cut_br = 140.1   # bottom-right on outer circle
cut_bl = 360 - cut_br  # 219.9
cut_tl = 360 - cut_tr  # 314.5

def pt(r, angle_deg):
    a = math.radians(angle_deg)
    return (cx + r * math.sin(a), cy - r * math.cos(a))

def fmt(p):
    return f'{p[0]:.1f},{p[1]:.1f}'

def angle_of(p):
    """Angle in degrees CW from top for a point relative to center."""
    return math.degrees(math.atan2(p[0] - cx, cy - p[1])) % 360

# =====================
# DEFINE THE 4 WING EDGE LINES
# Each as (anchor_point, direction_vector)
# =====================
# Upper-right wing line
UR_anchor = pt(outer_out, cut_tr)
UR_dir = (wux, wuy)  # (-0.3282, 0.9446)

# Upper-left wing line (mirror)
UL_anchor = pt(outer_out, cut_tl)
UL_dir = (-wux, wuy)  # (0.3282, 0.9446)

# Lower-right wing line
LR_anchor = pt(outer_out, cut_br)
LR_dir = (wlx, wly)   # (0.3029, 0.9530)

# Lower-left wing line (mirror)
LL_anchor = pt(outer_out, cut_bl)
LL_dir = (-wlx, wly)  # (-0.3029, 0.9530)

def line_circle_intersections(anchor, direction, r):
    """Find both intersection points of a line with circle of radius r.
    Returns list of (point, angle, t) sorted by t."""
    px, py = anchor
    dx, dy = direction
    ox, oy = px - cx, py - cy
    a_ = dx*dx + dy*dy
    b_ = 2*(ox*dx + oy*dy)
    c_ = ox*ox + oy*oy - r*r
    disc = b_*b_ - 4*a_*c_
    if disc < 0:
        return []
    sq = math.sqrt(disc)
    results = []
    for t in [(-b_ - sq)/(2*a_), (-b_ + sq)/(2*a_)]:
        p = (px + t*dx, py + t*dy)
        ang = angle_of(p)
        results.append((p, ang, t))
    results.sort(key=lambda x: x[2])
    return results

def wing_cut_angle(r, anchor, direction, prefer_top):
    """Find the angle where circle of radius r intersects a wing edge line.
    prefer_top: if True, pick the intersection in the upper half (angle < 180);
                if False, pick the intersection in the lower half (angle > 90)."""
    hits = line_circle_intersections(anchor, direction, r)
    if not hits:
        return None
    if prefer_top:
        # Pick the intersection with angle closest to 0° (top)
        best = min(hits, key=lambda h: min(h[1], 360 - h[1]))
    else:
        # Pick the intersection with angle closest to 180° (bottom)
        best = min(hits, key=lambda h: abs(h[1] - 180))
    return best[1], best[0]

# =====================
# RING RADII — equal spacing between all elements
# =====================
dot_r = 42  # Center dot radius

# Distribute: outer_in → mid_band → inner_band → dot_r with 3 equal gaps
available = outer_in - dot_r  # 206.5 - 42 = 164.5
gap = (available - 2 * band) / 3  # (164.5 - 46) / 3 = 39.5

mid_out = outer_in - gap
mid_in  = mid_out - band

inner_out = mid_in - gap
inner_in  = inner_out - band

print(f"Outer:  {outer_out}/{outer_in}")
print(f"Middle: {mid_out}/{mid_in}")
print(f"Inner:  {inner_out}/{inner_in}")
print(f"Dot:    r={dot_r:.1f}")
print(f"Gap:    {gap}")

# =====================
# COMPUTE CUT ANGLES FOR EACH RADIUS
# =====================
def get_cuts(r):
    """Get the 4 wing intersection angles for a circle of radius r.
    Returns None values if the circle doesn't intersect a wing line."""
    tr = wing_cut_angle(r, UR_anchor, UR_dir, True)
    tl = wing_cut_angle(r, UL_anchor, UL_dir, True)
    br = wing_cut_angle(r, LR_anchor, LR_dir, False)
    bl = wing_cut_angle(r, LL_anchor, LL_dir, False)
    return {'tr': tr[0] if tr else None, 'tl': tl[0] if tl else None,
            'br': br[0] if br else None, 'bl': bl[0] if bl else None,
            'tr_pt': tr[1] if tr else None, 'tl_pt': tl[1] if tl else None,
            'br_pt': br[1] if br else None, 'bl_pt': bl[1] if bl else None}

for label, r in [('outer_out', outer_out), ('outer_in', outer_in),
                  ('mid_out', mid_out), ('mid_in', mid_in),
                  ('inner_out', inner_out), ('inner_in', inner_in)]:
    c = get_cuts(r)
    tl = f"{c['tl']:.1f}°" if c['tl'] else "N/A"
    tr = f"{c['tr']:.1f}°" if c['tr'] else "N/A"
    br = f"{c['br']:.1f}°" if c['br'] else "N/A"
    bl = f"{c['bl']:.1f}°" if c['bl'] else "N/A"
    print(f"  {label:10s} r={r:6.1f}: TL={tl} TR={tr} BR={br} BL={bl}")

# =====================
# ARC BAND using per-radius wing intersection
# =====================
def _unpack_override(ovr):
    """Unpack an override that may be a single angle or (outer, inner) tuple."""
    if ovr is None:
        return None, None
    if isinstance(ovr, tuple):
        return ovr  # (outer_angle, inner_angle)
    return ovr, ovr  # same for both

def arc_band_wing(ro, ri, top=True, start_angle_override=None, end_angle_override=None):
    """Draw an arc band where endpoints are at wing-line intersections.
    top=True for top half, False for bottom half.
    Overrides can be a single angle or (outer_angle, inner_angle) tuple."""
    
    o_cuts = get_cuts(ro)
    i_cuts = get_cuts(ri)
    
    so, si = _unpack_override(start_angle_override)
    eo, ei = _unpack_override(end_angle_override)
    
    if top:
        o_start_a = so if so is not None else o_cuts['tl']
        o_end_a   = eo if eo is not None else o_cuts['tr']
        i_start_a = si if si is not None else i_cuts['tl']
        i_end_a   = ei if ei is not None else i_cuts['tr']
    else:
        o_start_a = so if so is not None else o_cuts['br']
        o_end_a   = eo if eo is not None else o_cuts['bl']
        i_start_a = si if si is not None else i_cuts['br']
        i_end_a   = ei if ei is not None else i_cuts['bl']
    
    o_start = pt(ro, o_start_a)
    o_end   = pt(ro, o_end_a)
    i_start = pt(ri, i_start_a)
    i_end   = pt(ri, i_end_a)
    
    span = (o_end_a - o_start_a) % 360
    large = 1 if span > 180 else 0
    i_span = (i_end_a - i_start_a) % 360
    i_large = 1 if i_span > 180 else 0
    
    return (f'  <path d="M {fmt(o_start)} A {ro},{ro} 0 {large},1 {fmt(o_end)} '
            f'L {fmt(i_end)} A {ri},{ri} 0 {i_large},0 {fmt(i_start)} Z" fill="#000"/>')

def arc_full_ring(ro, ri, start_deg, end_deg):
    """Draw an arc band from start_deg to end_deg (no wing clipping).
    start_deg/end_deg can be single angle or (outer, inner) tuple."""
    if isinstance(start_deg, tuple):
        o_start_a, i_start_a = start_deg
    else:
        o_start_a, i_start_a = start_deg, start_deg
    if isinstance(end_deg, tuple):
        o_end_a, i_end_a = end_deg
    else:
        o_end_a, i_end_a = end_deg, end_deg
    
    o_start = pt(ro, o_start_a)
    o_end   = pt(ro, o_end_a)
    i_start = pt(ri, i_start_a)
    i_end   = pt(ri, i_end_a)
    
    o_span = (o_end_a - o_start_a) % 360
    large = 1 if o_span > 180 else 0
    i_span = (i_end_a - i_start_a) % 360
    i_large = 1 if i_span > 180 else 0
    
    return (f'  <path d="M {fmt(o_start)} A {ro},{ro} 0 {large},1 {fmt(o_end)} '
            f'L {fmt(i_end)} A {ri},{ri} 0 {i_large},0 {fmt(i_start)} Z" fill="#000"/>')

def radial_wall(ro, ri, angle_deg):
    """Radial wall at angle_deg, width = band at that radius."""
    r_avg = (ro + ri) / 2
    half_w = math.degrees(band / (2 * r_avg))
    a1 = angle_deg - half_w
    a2 = angle_deg + half_w
    return (f'  <path d="M {fmt(pt(ro, a1))} L {fmt(pt(ro, a2))} '
            f'L {fmt(pt(ri, a2))} L {fmt(pt(ri, a1))} Z" fill="#000"/>')

# =====================
# MAZE GAP POSITIONS — rectangular (parallel edge) cuts
# =====================
def rect_gap_angles(center_deg, gap_deg_at_ref, r_ref, r_target):
    """Compute gap edge angles at r_target for a rectangular (straight) cut.
    The gap has angular width gap_deg_at_ref at radius r_ref.
    The linear half-width is constant; angle adjusts per radius."""
    half_linear = r_ref * math.sin(math.radians(gap_deg_at_ref / 2))
    half_angle = math.degrees(math.asin(min(half_linear / r_target, 1.0)))
    return center_deg - half_angle, center_deg + half_angle

mid_maze_gap_deg = 14
maze_gap_deg = 20

# Middle ring gap at 180°
mid_gap_center = 180
mid_r_ref = (mid_out + mid_in) / 2
mid_gap_s_out, mid_gap_e_out = rect_gap_angles(mid_gap_center, mid_maze_gap_deg, mid_r_ref, mid_out)
mid_gap_s_in,  mid_gap_e_in  = rect_gap_angles(mid_gap_center, mid_maze_gap_deg, mid_r_ref, mid_in)

# Inner ring gap at 270°
inner_gap_center = 270
inner_r_ref = (inner_out + inner_in) / 2
inner_gap_s_out, inner_gap_e_out = rect_gap_angles(inner_gap_center, maze_gap_deg, inner_r_ref, inner_out)
inner_gap_s_in,  inner_gap_e_in  = rect_gap_angles(inner_gap_center, maze_gap_deg, inner_r_ref, inner_in)

# =====================
# BUILD SVG ELEMENTS
# =====================
lines = []

# --- OUTER RING ---
lines.append('  <!-- OUTER RING -->')
lines.append(arc_band_wing(outer_out, outer_in, top=True))
lines.append(arc_band_wing(outer_out, outer_in, top=False))

# --- MIDDLE RING (split bottom arc for maze gap at ~200°) ---
lines.append('')
lines.append('  <!-- MIDDLE RING (gap at 200°) -->')
# Top arc: solid
lines.append(arc_band_wing(mid_out, mid_in, top=True))
# Bottom arc split: [br_wing .. gap_start] and [gap_end .. bl_wing]
lines.append(arc_band_wing(mid_out, mid_in, top=False, end_angle_override=(mid_gap_s_out, mid_gap_s_in)))
lines.append(arc_band_wing(mid_out, mid_in, top=False, start_angle_override=(mid_gap_e_out, mid_gap_e_in)))

# --- INNER RING (full circle, split for maze gap at ~165°) ---
# Inner ring is small enough to not overlap wings, so draw as full circle
lines.append('')
lines.append('  <!-- INNER RING (full circle, gap at 270°) -->')
# Full arc from gap_end around to gap_start
lines.append(arc_full_ring(inner_out, inner_in,
             (inner_gap_e_out, inner_gap_e_in),
             (inner_gap_s_out + 360, inner_gap_s_in + 360)))

# --- VERTICAL CONNECTOR between middle and inner ring (top, 0°) ---
lines.append('')
lines.append('  <!-- VERTICAL CONNECTOR (mid to inner, top) -->')
half = band / 2
overlap = 3
lines.append(f'  <rect x="{cx - half:.1f}" y="{cy - mid_in - overlap:.1f}" width="{band}" height="{mid_in - inner_out + 2*overlap:.1f}" fill="#000"/>')

# --- RADIAL CONNECTOR between middle and inner ring (bottom-right arc center) ---
lines.append('')
lines.append('  <!-- RADIAL CONNECTOR (mid to inner, bottom-right) -->')
# Center of bottom-right middle ring arc: midpoint between br wing cut and gap start
mid_br_cuts = get_cuts(mid_out)
br_mid_angle = (mid_br_cuts['br'] + (mid_gap_s_out + mid_gap_s_in) / 2) / 2
# True rectangle: compute center point, then place rect aligned to radial direction
angle_rad = math.radians(br_mid_angle)
sin_a, cos_a = math.sin(angle_rad), math.cos(angle_rad)
r_center = (mid_in + inner_out) / 2
rect_len = mid_in - inner_out + 2*overlap
rect_cx = cx + r_center * sin_a
rect_cy = cy - r_center * cos_a
lines.append(f'  <rect x="{-band/2:.1f}" y="{-rect_len/2:.1f}" width="{band}" height="{rect_len:.1f}" '
             f'transform="translate({rect_cx:.1f},{rect_cy:.1f}) rotate({br_mid_angle:.1f})" fill="#000"/>')


# --- CENTER DOT ---
lines.append('')
lines.append('  <!-- CENTER DOT -->')
lines.append(f'  <circle cx="{cx}" cy="{cy}" r="{dot_r:.1f}" fill="#000"/>')

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

# =====================
# COLORED VERSION — orange bubble border on dark background
# =====================
elite_orange = '#FA9600'
border_width = 6  # stroke width for the bubble border

# Build the icon elements as a reusable group (no fill — we set it per use)
color_lines = []
for line in lines:
    color_lines.append(line.replace('fill="#000"', 'fill="inherit"'))

icon_group = chr(10).join(color_lines)

wing_group = f'''  <g transform="translate(31.32, 36.62) scale(2)">
    <g transform="matrix(0.427557, 0, 0, 0.427557, 81.181313, 139.319397)">
      <path fill="inherit" d="{wing_path}"/>
    </g>
  </g>
  <g transform="translate(1000, 0) scale(-1, 1)">
    <g transform="translate(31.32, 36.62) scale(2)">
      <g transform="matrix(0.427557, 0, 0, 0.427557, 81.181313, 139.319397)">
        <path fill="inherit" d="{wing_path}"/>
      </g>
    </g>
  </g>'''

svg_color = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <!-- Dark background -->
  <rect width="1000" height="1000" fill="#0a0a0a"/>

  <!-- Orange border layer (rendered first, behind) -->
  <g fill="{elite_orange}" stroke="{elite_orange}" stroke-width="{border_width}" stroke-linejoin="round">
{icon_group}
{wing_group}
  </g>

  <!-- Black fill layer (on top) -->
  <g fill="#000" stroke="none">
{icon_group}
{wing_group}
  </g>
</svg>'''

with open('icon-draft-labyrinth-color.svg', 'w', encoding='utf-8') as f:
    f.write(svg_color)
print("Wrote icon-draft-labyrinth-color.svg")
