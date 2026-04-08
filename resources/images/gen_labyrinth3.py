"""
Generate icon-draft-labyrinth.svg using the noun project labyrinth,
scaled and clipped at the wing edges.
"""
import math

cx, cy = 500, 500

# The noun project labyrinth: center at (45,45), outermost extent r≈42.5
# Outer wall band: r=35.5 to 42.5 (thickness 7.0)
# Inner wall band: r=19.5 to 26.5 (thickness 7.0)
# Center dot: r=10.375
lab_cx, lab_cy = 45, 45
lab_r_max = 42.5  # outermost extent from center

# Our outer ring: outer_out=229.5, outer_in=206.5, band=23
outer_out = 229.5

# Scale so labyrinth outer edge = our outer_out
scale = outer_out / lab_r_max
print(f"Scale factor: {scale:.4f}")
print(f"Wall thickness at this scale: {7.0 * scale:.1f}px (target: 23px)")
print(f"Passage width at this scale: {9.0 * scale:.1f}px")
print(f"Center dot r at this scale: {10.375 * scale:.1f}px")

# Transform: translate(cx - lab_cx*scale, cy - lab_cy*scale) scale(s)
tx = cx - lab_cx * scale
ty = cy - lab_cy * scale
print(f"Transform: translate({tx:.2f}, {ty:.2f}) scale({scale:.4f})")

# Wing edge directions
wux, wuy = -0.3282, 0.9446   # upper wing inner edge (right side)
wlx, wly = 0.3029, 0.9530    # lower wing inner edge (right side)

# Cut angles (CW from top)
cut_tr = 45.5
cut_br = 140.1
cut_bl = 360 - cut_br  # 219.9
cut_tl = 360 - cut_tr  # 314.5

def pt(r, angle_deg):
    a = math.radians(angle_deg)
    return (cx + r * math.sin(a), cy - r * math.cos(a))

# Cut points on outer circle
ptr = pt(outer_out, cut_tr)
pbr = pt(outer_out, cut_br)
pbl = pt(outer_out, cut_bl)
ptl = pt(outer_out, cut_tl)

print(f"\nCut points on outer circle:")
print(f"  TR: ({ptr[0]:.1f}, {ptr[1]:.1f})")
print(f"  BR: ({pbr[0]:.1f}, {pbr[1]:.1f})")
print(f"  BL: ({pbl[0]:.1f}, {pbl[1]:.1f})")
print(f"  TL: ({ptl[0]:.1f}, {ptl[1]:.1f})")

# Wing edge lines extended to SVG boundaries
# Top-right upper wing edge: through ptr, direction (wux, wuy)
def line_at_y(px, py, dx, dy, target_y):
    t = (target_y - py) / dy
    return (px + dx * t, target_y)

# Top-right wing edge
tr_top = line_at_y(ptr[0], ptr[1], wux, wuy, 0)
tr_bot = line_at_y(ptr[0], ptr[1], wux, wuy, 1000)
print(f"\nTR wing edge: ({tr_top[0]:.1f}, 0) → ({tr_bot[0]:.1f}, 1000)")

# Top-left wing edge (mirror: direction is positive wux)
tl_top = line_at_y(ptl[0], ptl[1], -wux, wuy, 0)
tl_bot = line_at_y(ptl[0], ptl[1], -wux, wuy, 1000)
print(f"TL wing edge: ({tl_top[0]:.1f}, 0) → ({tl_bot[0]:.1f}, 1000)")

# Bottom-right lower wing edge: through pbr, direction (wlx, wly)
br_top = line_at_y(pbr[0], pbr[1], wlx, wly, 0)
br_bot = line_at_y(pbr[0], pbr[1], wlx, wly, 1000)
print(f"BR wing edge: ({br_top[0]:.1f}, 0) → ({br_bot[0]:.1f}, 1000)")

# Bottom-left lower wing edge (mirror)
bl_top = line_at_y(pbl[0], pbl[1], -wlx, wly, 0)
bl_bot = line_at_y(pbl[0], pbl[1], -wlx, wly, 1000)
print(f"BL wing edge: ({bl_top[0]:.1f}, 0) → ({bl_bot[0]:.1f}, 1000)")

# Intersection of right wing edges (TR and BR lines)
# TR: P = tr_top + t*(tr_bot - tr_top), parametric with t in [0,1] mapping y=[0,1000]
# BR: P = br_top + s*(br_bot - br_top)
# y: 1000*t = 1000*s → t = s
# x: tr_top.x + t*(tr_bot.x - tr_top.x) = br_top.x + t*(br_bot.x - br_top.x)
tr_dx = tr_bot[0] - tr_top[0]
br_dx = br_bot[0] - br_top[0]
t_right = (br_top[0] - tr_top[0]) / (tr_dx - br_dx)
right_intersection = (tr_top[0] + t_right * tr_dx, 1000 * t_right)
left_intersection = (1000 - right_intersection[0], right_intersection[1])  # mirror

print(f"\nRight wing edges intersect at: ({right_intersection[0]:.1f}, {right_intersection[1]:.1f})")
print(f"Left wing edges intersect at: ({left_intersection[0]:.1f}, {left_intersection[1]:.1f})")

# Clip hexagon (visible region — top and bottom between wings)
clip_points = [
    (tl_top[0], 0),           # 1: top edge, left upper wing line
    (tr_top[0], 0),           # 2: top edge, right upper wing line
    right_intersection,        # 3: right wing edges cross
    (br_bot[0], 1000),         # 4: bottom edge, right lower wing line
    (bl_bot[0], 1000),         # 5: bottom edge, left lower wing line
    left_intersection,         # 6: left wing edges cross
]

print(f"\nClip hexagon points:")
for i, p in enumerate(clip_points):
    print(f"  {i+1}: ({p[0]:.1f}, {p[1]:.1f})")

# Build clip-path polygon string
clip_d = "M " + " L ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in clip_points) + " Z"
print(f"\nClip path: {clip_d}")

# Output the complete SVG
labyrinth_path = 'M77.418,17.531l-4.976,4.976C77.475,28.635,80.5,36.47,80.5,45c0,8.529-3.027,16.362-8.059,22.49l-6.395-6.395C69.465,56.633,71.5,51.056,71.5,45c0-13.448-10.021-24.549-23.001-26.263l0.001-9.06c7.165,0.705,13.713,3.544,18.992,7.879l4.976-4.976C65.059,6.297,55.475,2.5,45,2.5C21.528,2.5,2.5,21.528,2.5,45c0,22.293,17.167,40.563,39,42.345v-7.019C23.562,78.562,9.5,63.395,9.5,45c0-18.393,14.062-33.562,31.999-35.326v9.059C29.667,20.296,20.3,29.666,18.737,41.5h7.095c1.656-9.085,9.612-16,19.168-16c10.752,0,19.5,8.748,19.5,19.5c0,10.752-8.748,19.5-19.5,19.5c-9.556,0-17.512-6.915-19.168-16h-7.095c1.714,12.98,12.815,23,26.263,23c6.057,0,11.635-2.036,16.097-5.454l6.394,6.393c-5.28,4.335-11.824,7.183-18.99,7.888v7.019c21.833-1.781,39-20.052,39-42.345C87.5,34.524,83.702,24.94,77.418,17.531z'

wing_path = 'M 861.578 -98.713 L 563.415 27.001 L 506.665 190.535 L 505.339 245.337 L 506.665 304.623 L 561.925 478.568 C 563.395 481.868 692.759 425.398 692.759 425.398 L 715.449 353.554 L 596.985 403.418 L 596.985 380.027 L 723.969 326.579 L 750.602 242.257 L 596.985 306.917 L 596.985 283.529 L 759.122 215.283 L 786.5 128.605 L 596.985 208.373 L 596.985 184.984 L 795.021 101.627 L 821.117 18.997 L 596.985 113.34 L 596.985 89.95 L 829.777 -8.038 L 861.578 -98.713 Z'

svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">

  <defs>
    <!-- Clip path: hexagon between wing edges -->
    <clipPath id="wing-clip">
      <path d="{clip_d}"/>
    </clipPath>
  </defs>

  <!-- Labyrinth from noun project, scaled to fit: outer edge at r={outer_out} -->
  <!-- Scale={scale:.4f}, wall thickness={7.0*scale:.1f}px (original 7.0 × scale) -->
  <g clip-path="url(#wing-clip)">
    <g transform="translate({tx:.2f}, {ty:.2f}) scale({scale:.4f})">
      <circle fill="#000" cx="45" cy="45" r="10.375"/>
      <path fill="#000" d="{labyrinth_path}"/>
    </g>
  </g>

  <!-- Right wing -->
  <g transform="translate(31.32, 36.62) scale(2)">
    <g transform="matrix(0.427557, 0, 0, 0.427557, 81.181313, 139.319397)">
      <path style="fill: rgb(0, 0, 0);" d="{wing_path}"/>
    </g>
  </g>

  <!-- Left wing — exact mirror of right wing around x=500 -->
  <g transform="translate(1000, 0) scale(-1, 1)">
    <g transform="translate(31.32, 36.62) scale(2)">
      <g transform="matrix(0.427557, 0, 0, 0.427557, 81.181313, 139.319397)">
        <path style="fill: rgb(0, 0, 0);" d="{wing_path}"/>
      </g>
    </g>
  </g>
</svg>'''

with open('icon-draft-labyrinth.svg', 'w') as f:
    f.write(svg)
print("\nWrote icon-draft-labyrinth.svg")
