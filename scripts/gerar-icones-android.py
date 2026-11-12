"""Gera os ícones e a tela de abertura do app Android a partir do logo.

Uso (na raiz do projeto, precisa do Pillow: pip install pillow):
    python3 scripts/gerar-icones-android.py assets/logo.png android/app/src/main/res

Rodar de novo sempre que o logo mudar. Gera: ícone do app (quadrado, redondo,
adaptativo e monocromático do Android 13+), ícone da barra de avisos do push
(ic_stat_soliv, só a silhueta) e a imagem da tela de abertura (Android 11 ou
anterior). O iOS usa ios/App/App/Assets.xcassets.
"""
import sys, os
from PIL import Image, ImageDraw
logo_path, res = sys.argv[1], sys.argv[2]
logo = Image.open(logo_path).convert('RGBA')
logo = logo.crop(logo.getbbox())
WHITE = (255, 255, 255, 255)

def fit(img, box):
    im = img.copy(); im.thumbnail((box, box), Image.LANCZOS); return im

def centered(canvas, img):
    canvas.alpha_composite(img, ((canvas.width - img.width) // 2, (canvas.height - img.height) // 2))
    return canvas

dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in dens.items():
    out = f'{res}/mipmap-{d}'
    # Ícone antigo (quadrado arredondado) e redondo: 48dp, logo com margem.
    n = round(48 * k)
    sq = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ImageDraw.Draw(sq).rounded_rectangle([0, 0, n - 1, n - 1], radius=round(n * 0.18), fill=WHITE)
    centered(sq, fit(logo, round(n * 0.72))).save(f'{out}/ic_launcher.png')
    rd = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ImageDraw.Draw(rd).ellipse([0, 0, n - 1, n - 1], fill=WHITE)
    centered(rd, fit(logo, round(n * 0.62))).save(f'{out}/ic_launcher_round.png')
    # Ícone adaptativo (Android 8+): 108dp, logo dentro da zona segura de 66dp.
    f = round(108 * k)
    centered(Image.new('RGBA', (f, f), (0, 0, 0, 0)), fit(logo, round(f * 0.56))).save(f'{out}/ic_launcher_foreground.png')
    # Ícone monocromático (ícones temáticos do Android 13+) e da barra de avisos: só a silhueta.
    sil = Image.new('RGBA', logo.size, WHITE); sil.putalpha(logo.getchannel('A'))
    centered(Image.new('RGBA', (f, f), (0, 0, 0, 0)), fit(sil, round(f * 0.56))).save(f'{out}/ic_launcher_monochrome.png')
    s = round(24 * k)
    os.makedirs(f'{res}/drawable-{d}', exist_ok=True)
    centered(Image.new('RGBA', (s, s), (0, 0, 0, 0)), fit(sil, round(s * 0.92))).save(f'{res}/drawable-{d}/ic_stat_soliv.png')

# Tela de abertura (Android 11 ou anterior; no 12+ o sistema usa o ícone).
for name in os.listdir(res):
    p = f'{res}/{name}/splash.png'
    if name.startswith('drawable') and os.path.exists(p):
        w, h = Image.open(p).size
        centered(Image.new('RGBA', (w, h), WHITE), fit(logo, round(min(w, h) * 0.32))).convert('RGB').save(p, optimize=True)
