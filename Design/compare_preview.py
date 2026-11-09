"""Side-by-side: Figma screen (1000×1400) vs Lens Studio preview capture, both cropped to the
canvas region the preview camera shows. Usage: compare.py figma.png preview.png out.png label"""
import sys
from PIL import Image, ImageDraw, ImageFont
fig_p, ls_p, out_p, label = sys.argv[1:5]
font_p = "/Users/guest2026/Desktop/freelance/KineSpace/Assets/Fonts/Inter-SemiBold.ttf"
ls = Image.open(ls_p).convert("RGB"); W, H = ls.size
# Preview camera (measured): vertical FoV 36.59°, canvas centre on screen centre, canvas = 1000 × 1400 px at 1.1 m.
import math
# The panel keeps the camera's horizontal FoV (aspect 0.875 × tan(36.59°/2)) and extends vertically;
# Lens content renders only inside the display band (camera vertical FoV 36.59°).
tan_h = 0.875 * math.tan(math.radians(36.59 / 2))
px_per_canvas = W / (2 * tan_h * 110 / 0.053)            # screen px per canvas px
display_half = math.tan(math.radians(36.59 / 2)) * 110 / 0.053  # canvas px above/below centre on display
cx, cy = W / 2, H / 2
x0, x1 = cx - 500 * px_per_canvas, cx + 500 * px_per_canvas
top_canvas = 700 - display_half
bottom_canvas = 700 + display_half
ls_crop = ls.crop((int(x0), int(cy - display_half * px_per_canvas), int(x1), int(cy + display_half * px_per_canvas)))
fig = Image.open(fig_p).convert("RGB").resize((1000, 1400))
fig_crop = fig.crop((0, int(max(0, top_canvas)), 1000, int(min(1400, bottom_canvas))))
h = 1200
a = fig_crop.resize((int(fig_crop.width * h / fig_crop.height), h), Image.LANCZOS)
b = ls_crop.resize((int(ls_crop.width * h / ls_crop.height), h), Image.LANCZOS)
pad = 50
out = Image.new("RGB", (a.width + b.width + 3 * 20, h + pad), (18, 18, 18))
out.paste(a, (20, pad)); out.paste(b, (a.width + 40, pad))
d = ImageDraw.Draw(out); f = ImageFont.truetype(font_p, 24)
d.text((20, 12), f"Figma {label}", fill=(230, 230, 230), font=f)
d.text((a.width + 40, 12), f"Lens Studio preview {label} (additive)", fill=(230, 230, 230), font=f)
out.save(out_p); print(out.size, "canvas rows", round(top_canvas), round(bottom_canvas))
