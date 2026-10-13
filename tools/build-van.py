# Builds assets/van.png (the Reboot Van) from tools/reboot-van.png.
# The source is a ChatGPT image with a checkerboard drawn in as "transparency".
# Run from the repo root: python3 tools/build-van.py
from PIL import Image

src = open('tools/build-hero.py').read()
ROOF_Y = 330  # source pixels
ns = {'ROOF_Y': ROOF_Y}
# Reuse the hero sheet's checkerboard remover, but only clear enclosed pockets of
# background above the roof (inside the hologram): lower down, light grey pockets
# are the van's own paint.
helpers = src.split('\nim = clear_checker')[0].replace(
    'if len(comp) >= 40:', 'if len(comp) >= 40 and max(cy for _, cy in comp) < ROOF_Y:')
exec(helpers, ns)
clear_checker = ns['clear_checker']

im = clear_checker(Image.open('tools/reboot-van.png'))
px = im.load(); W, H = im.size
# Keep the van and hologram (big pieces) and the sparkles near them.
def components(im, min_px):
    px = im.load(); W, H = im.size
    seen = bytearray(W * H); out = []
    for y0 in range(H):
        for x0 in range(W):
            if seen[y0 * W + x0] or not px[x0, y0][3]: continue
            st = [(x0, y0)]; seen[y0 * W + x0] = 1; comp = []
            while st:
                x, y = st.pop(); comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and px[nx, ny][3]:
                        seen[ny * W + nx] = 1; st.append((nx, ny))
            out.append(comp)
    return out
comps = components(im, 0)
big = max(comps, key=len)
bx0 = min(x for x, _ in big); bx1 = max(x for x, _ in big)
by0 = min(y for _, y in big); by1 = max(y for _, y in big)
for c in comps:
    if c is big: continue
    cx = sum(x for x, _ in c) / len(c); cy = sum(y for _, y in c) / len(c)
    near = bx0 - 40 < cx < bx1 + 40 and by0 - 120 < cy < by1
    if len(c) < 60 or not near:
        for x, y in c: px[x, y] = (0, 0, 0, 0)

im = im.crop(im.getbbox())
K = 1 / 8  # the art is drawn with ~8px pixels
sm = im.resize((round(im.width * K), round(im.height * K)), Image.BOX)
# BOX filtering leaves soft edges: make alpha hard.
p = sm.load()
for y in range(sm.height):
    for x in range(sm.width):
        r, g, b, a = p[x, y]
        p[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
sm = sm.crop(sm.getbbox())
# The hologram was drawn see-through over the checkerboard: tint what shows
# through its middle a pale holo-blue.
holo_h = round(sm.height * 0.3)
p = sm.load()
for y in range(holo_h):
    for x in range(sm.width):
        r, g, b, a = p[x, y]
        if a and max(r, g, b) - min(r, g, b) < 30 and min(r, g, b) > 150:
            p[x, y] = (150 + r // 6, 215 + g // 20, 255, 255)
sm.save('assets/van.png')
print('assets/van.png', sm.size)
