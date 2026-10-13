# Builds assets/giant-sword.png (the Giant Sword) from tools/giant-sword.png.
# Keeps the biggest solid shape (the sword), drops the smudges around the edges and
# scales it so it's 2x the in-game length (it's drawn at half size on the detail canvas).
# Run from the repo root: python3 tools/build-sword.py
from PIL import Image

LENGTH = 9 * 16 * 2  # GIANT_LEN tiles * TILE px * detail

im = Image.open('tools/giant-sword.png').convert('RGBA')
W, H = im.size
px = im.load()
solid = lambda x, y: px[x, y][3] >= 128
seen = bytearray(W * H); best = []
for y0 in range(H):
    for x0 in range(W):
        if seen[y0 * W + x0] or not solid(x0, y0): continue
        st = [(x0, y0)]; seen[y0 * W + x0] = 1; comp = []
        while st:
            x, y = st.pop(); comp.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and solid(nx, ny):
                    seen[ny * W + nx] = 1; st.append((nx, ny))
        if len(comp) > len(best): best = comp
out = Image.new('RGBA', (W, H))
op = out.load()
for x, y in best: op[x, y] = px[x, y][:3] + (255,)
out = out.crop(out.getbbox())
k = LENGTH / out.width
sm = out.resize((LENGTH, max(1, round(out.height * k))), Image.BOX)
p = sm.load()
for y in range(sm.height):
    for x in range(sm.width):
        r, g, b, a = p[x, y]
        p[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
sm = sm.crop(sm.getbbox())
sm.save('assets/giant-sword.png')
print('assets/giant-sword.png', sm.size)
