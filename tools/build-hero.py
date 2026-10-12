"""Builds the hero sprite atlas from tools/hero-sheet.png: cuts out the frames we use,
shrinks them to game size and marks which pixels can be recoloured."""
import sys, json, colorsys
from PIL import Image
# Usage: python3 tools/build-hero.py   (run from the repo root)
im = Image.open('tools/hero-sheet.png').convert('RGBA')
F = {
 'front': [(60,390,152,545),(185,391,273,545),(305,391,397,545),(432,390,525,545)],
 'side':  [(37,579,144,732),(169,580,270,731),(298,580,400,732),(434,580,535,732)],
 'back':  [(54,768,150,924),(180,768,272,920),(305,768,400,925),(434,767,530,925)],
 'atk':   [(635,409,798,552),(815,405,995,552),(1011,390,1209,552)],
 'hurt':  [(641,786,747,926)],
 'down':  [(1076,840,1222,909)],
}
K = 0.2
ROLE = {'keep': 255, 'cloak': 254, 'hair': 253, 'skin': 252, 'tunic': 251}

def classify(r, g, b, x, y, w, h, name):
    hh, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    hue = hh * 360
    if l < 0.13: return 'keep'                       # outlines / deep shadow
    if s < 0.16: return 'keep'                       # greys, steel, white slash trails
    if 75 < hue < 170 and g > r: return 'cloak'
    if 8 < hue < 42 and l >= 0.5 and s > 0.3: return 'skin'   # face and hands, lit and shaded
    if 8 < hue < 45 and l < 0.5:
        if name == 'down': return 'hair' if x < w * 0.45 else 'tunic'
        head = 0.45 if name != 'atk' else 0.42
        return 'hair' if y < h * head else 'tunic'
    return 'keep'

frames = []
for name, boxes in F.items():
    for (x0, y0, x1, y1) in boxes:
        c = im.crop((x0 - 2, y0 - 2, x1 + 3, y1 + 3))
        sm = c.resize((max(1, round(c.width * K)), max(1, round(c.height * K))), Image.BOX)
        px = sm.load()
        for y in range(sm.height):
            for x in range(sm.width):
                r, g, b, a = px[x, y]
                if a <= 140: px[x, y] = (0, 0, 0, 0); continue
                role = classify(r, g, b, x, y, sm.width, sm.height, name)
                px[x, y] = (r, g, b, ROLE[role])
        frames.append((name, sm))

# pack into one strip, bottoms aligned; record each frame's foot anchor
def anchor(f, name):
    px = f.load(); xs = []
    rows = range(f.height - 4, f.height) if name != 'down' else range(f.height)
    for y in rows:
        for x in range(f.width):
            if px[x, y][3]: xs.append(x)
    if name == 'atk':  # the body, not the sword: use the left part of the feet
        xs = [x for x in xs if x < f.width * 0.6] or xs
    fx = round(sum(xs) / len(xs)) if xs else f.width // 2
    return fx

Wt = sum(f.width + 1 for _, f in frames); Ht = max(f.height for _, f in frames)
atlas = Image.new('RGBA', (Wt, Ht), (0, 0, 0, 0)); meta = {}; x = 0
for name, f in frames:
    atlas.paste(f, (x, Ht - f.height))
    meta.setdefault(name, []).append([x, Ht - f.height, f.width, f.height, anchor(f, name)])
    x += f.width + 1
atlas.save('assets/hero.png')
open('js/hero-frames.js', 'w').write(
    '// Generated from the hero sprite sheet: [x, y, w, h, footX] per frame.\n'
    '// Alpha encodes recolour roles: 255 keep, 254 cloak, 253 hair, 252 skin, 251 tunic.\n'
    'export const HERO_FRAMES = ' + json.dumps(meta) + ';\n')
print('wrote assets/hero.png and js/hero-frames.js', {k: len(v) for k, v in meta.items()})
