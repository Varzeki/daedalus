import math, sys

cx, cy = 500, 500
band = 23  # consistent thickness for ALL walls and rings

# Wing cut angles (CW from top, i.e. 0° = 12 o'clock)
cut_tr = 45.5    # top-right
cut_br = 140.1   # bottom-right
cut_bl = 360 - cut_br  # 219.9  bottom-left
cut_tl = 360 - cut_tr  # 314.5  top-left

# Wing edge direction vectors (unit-ish, used for angled cuts)
wux, wuy = -0.3282, 0.9446   # upper wing inner edge direction
wlx, wly = 0.3029, 0.9530    # lower wing inner edge direction

def pt(r, angle_deg):
    """Point on circle of radius r at angle_deg CW from top."""
    a = math.radians(angle_deg)
    return (cx + r * math.sin(a), cy - r * math.cos(a))

def fmt(p):
    return f'{p[0]:.1f},{p[1]:.1f}'

def ray_circle_intersect(origin, direction, r):
    """Intersect ray from origin along direction with circle centered at (cx,cy) radius r.
    Returns the closest intersection point."""
    dx, dy = direction
    ox, oy = origin[0] - cx, origin[1] - cy
    a_ = dx*dx + dy*dy
    b_ = 2*(ox*dx + oy*dy)
    c_ = ox*ox + oy*oy - r*r
    disc = b_*b_ - 4*a_*c_
    if disc < 0:
        return None
    sq = math.sqrt(disc)
    t1 = (-b_ - sq) / (2*a_)
    t2 = (-b_ + sq) / (2*a_)
    best = None
    for t in [t1, t2]:
        if t < 0.1:
            continue
        p = (origin[0] + t*dx, origin[1] + t*dy)
        dist = math.sqrt((p[0]-origin[0])**2 + (p[1]-origin[1])**2)
        if best is None or dist < best[1]:
            best = (p, dist)
    return best[0] if best else None

def wing_dir(angle_deg, is_upper):
    """Get wing edge direction for a cut at angle_deg.
    is_upper: True for upper cuts (45.5/314.5), False for lower cuts (140.1/219.9)."""
    if is_upper:
        return (-wux, wuy) if angle_deg > 180 else (wux, wuy)
    else:
        return (-wlx, wly) if angle_deg > 180 else (wlx, wly)

def arc_band(r_out, r_in, start_deg, end_deg, start_cut=None, end_cut=None):
    """Arc band from start_deg to end_deg CW.
    start_cut / end_cut = 'upper' | 'lower' | None for wing-angled vs radial cuts."""
    span = (end_deg - start_deg) % 360
    large = 1 if span > 180 else 0

    # Outer arc endpoints
    o_start = pt(r_out, start_deg)
    o_end = pt(r_out, end_deg)

    # Inner arc endpoints — either radial or along wing edge
    if start_cut:
        d = wing_dir(start_deg, start_cut == 'upper')
        i_start = ray_circle_intersect(o_start, d, r_in) or pt(r_in, start_deg)
    else:
        i_start = pt(r_in, start_deg)

    if end_cut:
        d = wing_dir(end_deg, end_cut == 'upper')
        i_end = ray_circle_intersect(o_end, d, r_in) or pt(r_in, end_deg)
    else:
        i_end = pt(r_in, end_deg)

    return (f'  <path d="M {fmt(o_start)} A {r_out},{r_out} 0 {large},1 {fmt(o_end)} '
            f'L {fmt(i_end)} A {r_in},{r_in} 0 {large},0 {fmt(i_start)} Z" fill="#000"/>')

def radial_wall(r_outer, r_inner, angle_deg, width_deg):
    """Rectangular radial wall at angle_deg, spanning from r_outer to r_inner."""
    hw = width_deg / 2
    return (f'  <path d="M {fmt(pt(r_outer, angle_deg - hw))} '
            f'L {fmt(pt(r_outer, angle_deg + hw))} '
            f'L {fmt(pt(r_inner, angle_deg + hw))} '
            f'L {fmt(pt(r_inner, angle_deg - hw))} Z" fill="#000"/>')

def wing_edge_wall(r_outer, r_inner, cut_angle, is_upper, thickness=23):
    """Wall following the wing edge direction from r_outer to r_inner.
    Creates a parallelogram along the wing edge with given thickness."""
    d = wing_dir(cut_angle, is_upper)

    start_pt = pt(r_outer, cut_angle)
    # Try both directions — for bottom cuts the wing edge points away from center
    end_pt = ray_circle_intersect(start_pt, d, r_inner)
    if end_pt is None:
        d = (-d[0], -d[1])
        end_pt = ray_circle_intersect(start_pt, d, r_inner)
    if end_pt is None:
        return ''

    # Perpendicular to wing direction (for wall thickness)
    perp = (-d[1], d[0])
    half_t = thickness / 2

    # Create parallelogram
    p1 = (start_pt[0] + perp[0]*half_t, start_pt[1] + perp[1]*half_t)
    p2 = (start_pt[0] - perp[0]*half_t, start_pt[1] - perp[1]*half_t)
    p3 = (end_pt[0] - perp[0]*half_t, end_pt[1] - perp[1]*half_t)
    p4 = (end_pt[0] + perp[0]*half_t, end_pt[1] + perp[1]*half_t)

    return (f'  <path d="M {fmt(p1)} L {fmt(p2)} L {fmt(p3)} L {fmt(p4)} Z" fill="#000"/>')

# =====================================================================
# RING GEOMETRY — 3 rings, all band=23, with tighter spacing
# =====================================================================
gap = 14  # gap between rings (passage width)
h = band / 2  # 11.5

outer_out = 229.5
outer_in = 206.5  # outer ring

mid_out = outer_in - gap   # 192.5
mid_in = mid_out - band    # 169.5

inner_out = mid_in - gap   # 155.5
inner_in = inner_out - band # 132.5

dot_r = 38  # larger center dot

print(f'<!-- Ring geometry: outer={outer_out}/{outer_in}, mid={mid_out}/{mid_in}, inner={inner_out}/{inner_in}, dot={dot_r} -->', file=sys.stderr)
print(f'<!-- Band={band}, gap={gap} -->', file=sys.stderr)

lines = []
lines.append(f'  <!-- Ring geometry: outer={outer_out}/{outer_in}, mid={mid_out}/{mid_in}, inner={inner_out}/{inner_in}, dot={dot_r} -->')
lines.append(f'  <!-- Band={band}, gap={gap}, all consistent -->')

# =====================================================================
# OUTER RING — top and bottom arcs, cut at wing edges
# =====================================================================
lines.append('')
lines.append('  <!-- === OUTER RING === -->')
# Top arc: from top-left cut to top-right cut
lines.append(arc_band(outer_out, outer_in, cut_tl, cut_tr, 'upper', 'upper'))
# Bottom arc: from bottom-right cut to bottom-left cut
lines.append(arc_band(outer_out, outer_in, cut_br, cut_bl, 'lower', 'lower'))

# =====================================================================
# MIDDLE RING — top and bottom arcs with asymmetric maze gap
# Gap in the TOP arc at ~335° (upper-left quadrant)
# =====================================================================
maze_gap = 14  # degrees of maze opening
mid_gap_angle = 335  # asymmetric — left of center top
mid_gap_s = mid_gap_angle - maze_gap/2  # 328
mid_gap_e = mid_gap_angle + maze_gap/2  # 342

lines.append('')
lines.append(f'  <!-- === MIDDLE RING — maze gap at {mid_gap_angle}° === -->')
# Top arc split into two segments around the gap
lines.append(arc_band(mid_out, mid_in, cut_tl, mid_gap_s, 'upper', None))
lines.append(arc_band(mid_out, mid_in, mid_gap_e, cut_tr, None, 'upper'))
# Bottom arc: solid
lines.append(arc_band(mid_out, mid_in, cut_br, cut_bl, 'lower', 'lower'))

# =====================================================================
# INNER RING — top and bottom arcs with asymmetric maze gap
# Gap in the BOTTOM arc at ~170° (lower-right quadrant)
# =====================================================================
inner_gap_angle = 170  # asymmetric — right of center bottom
inner_gap_s = inner_gap_angle - maze_gap/2  # 163
inner_gap_e = inner_gap_angle + maze_gap/2  # 177

lines.append('')
lines.append(f'  <!-- === INNER RING — maze gap at {inner_gap_angle}° === -->')
# Top arc: solid
lines.append(arc_band(inner_out, inner_in, cut_tl, cut_tr, 'upper', 'upper'))
# Bottom arc split into two segments around the gap
lines.append(arc_band(inner_out, inner_in, cut_br, inner_gap_s, 'lower', None))
lines.append(arc_band(inner_out, inner_in, inner_gap_e, cut_bl, None, 'lower'))

# =====================================================================
# WING-EDGE CONNECTING WALLS — bridge all gaps between rings at wing cuts
# These walls follow the wing edge direction so they align with the angled cuts
# All walls use band thickness for visual consistency
# =====================================================================
lines.append('')
lines.append('  <!-- === WING-EDGE CONNECTING WALLS (outer→mid→inner) === -->')

# At each of the 4 cut positions, connect outer_in → mid_out and mid_in → inner_out
for label, angle, is_upper in [
    ('top-right', cut_tr, True),
    ('bottom-right', cut_br, False),
    ('bottom-left', cut_bl, False),
    ('top-left', cut_tl, True),
]:
    lines.append(f'  <!-- {label} ({angle}°) -->')
    wall1 = wing_edge_wall(outer_in, mid_out, angle, is_upper, thickness=band)
    wall2 = wing_edge_wall(mid_in, inner_out, angle, is_upper, thickness=band)
    if wall1:
        lines.append(wall1)
    if wall2:
        lines.append(wall2)

# =====================================================================
# RADIAL WALLS at maze gap edges — connect adjacent rings
# These must be band-width to match line thickness
# =====================================================================
# Compute angular width that corresponds to band width at given radius
def angular_width(r, linear_width):
    return math.degrees(linear_width / r)

lines.append('')
lines.append('  <!-- === RADIAL WALLS at maze gap edges === -->')

# Middle ring gap edges → connect outer to middle
aw_outer = angular_width((outer_in + mid_out) / 2, band)
lines.append(f'  <!-- Mid gap edges: walls from outer_in to mid_out -->')
lines.append(radial_wall(outer_in, mid_out, mid_gap_s, aw_outer))
lines.append(radial_wall(outer_in, mid_out, mid_gap_e, aw_outer))

# Inner ring gap edges → connect middle to inner
aw_mid = angular_width((mid_in + inner_out) / 2, band)
lines.append(f'  <!-- Inner gap edges: walls from mid_in to inner_out -->')
lines.append(radial_wall(mid_in, inner_out, inner_gap_s, aw_mid))
lines.append(radial_wall(mid_in, inner_out, inner_gap_e, aw_mid))

# =====================================================================
# DEAD-END WALLS for visual interest (asymmetric)
# These create the maze feel — stubs that don't go anywhere
# =====================================================================
lines.append('')
lines.append('  <!-- === DEAD-END / INTEREST WALLS === -->')

# Between outer and mid: wall at ~25° (right side, top arc)
aw_deadend = angular_width((outer_in + mid_out) / 2, band)
lines.append(radial_wall(outer_in, mid_out, 25, aw_deadend))

# Between outer and mid: wall at ~240° (left side, bottom arc)
lines.append(radial_wall(outer_in, mid_out, 240, aw_deadend))

# Between mid and inner: wall at ~200° (left, bottom arc)
aw_deadend2 = angular_width((mid_in + inner_out) / 2, band)
lines.append(radial_wall(mid_in, inner_out, 200, aw_deadend2))

# Between mid and inner: wall at ~70° (right, top arc) — shifted for asymmetry
lines.append(radial_wall(mid_in, inner_out, 70, aw_deadend2))

# =====================================================================
# CENTER DOT
# =====================================================================
lines.append('')
lines.append('  <!-- === CENTER DOT === -->')
lines.append(f'  <circle cx="{cx}" cy="{cy}" r="{dot_r}" fill="#000"/>')

print('\n'.join(lines))
