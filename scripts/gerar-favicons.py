"""Exporta o ícone fornecido pelo idealizador para abas e atalhos, preservando a transparência."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dist', type=Path, default=RAIZ / 'dist')
parser.add_argument('--origem', type=Path, help='Prepara o mestre local a partir do arquivo fornecido pelo idealizador.')
args = parser.parse_args()
dist = args.dist.resolve()
if dist != RAIZ / 'dist' and not dist.is_relative_to(RAIZ / '.build'):
    raise ValueError('Destino fora do projeto.')
mestre = RAIZ / 'assets' / 'favicon-radar-araras.png'
if args.origem:
    with Image.open(args.origem) as entrada:
        imagem = ImageOps.exif_transpose(entrada).convert('RGBA')
        # Retira só a margem totalmente transparente; não corta o desenho.
        limites = imagem.getchannel('A').getbbox()
        if limites:
            imagem = imagem.crop(limites)
        imagem.thumbnail((500, 500), Image.Resampling.LANCZOS)
        quadro = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
        quadro.alpha_composite(imagem, ((512-imagem.width)//2, (512-imagem.height)//2))
        mestre.parent.mkdir(parents=True, exist_ok=True)
        quadro.save(mestre, 'PNG', optimize=True)
with Image.open(mestre) as entrada:
    imagem = entrada.convert('RGBA')
    if imagem.size != (512, 512):
        raise ValueError('O mestre do favicon precisa ter 512 pixels quadrados.')
    arquivos = []
    for tamanho in (16, 32, 48, 96, 180, 192, 512):
        nome = 'apple-touch-icon.png' if tamanho == 180 else f'favicon-{tamanho}x{tamanho}.png'
        alvo = dist / nome
        imagem.resize((tamanho, tamanho), Image.Resampling.LANCZOS).save(alvo, 'PNG', optimize=True)
        arquivos.append({'arquivo': nome, 'largura': tamanho, 'altura': tamanho, 'bytes': alvo.stat().st_size})
    imagem.save(dist / 'favicon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64)])
    with Image.open(dist / 'favicon.ico') as conferir:
        if conferir.ico.sizes() != {(16,16),(32,32),(48,48),(64,64)}:
            raise ValueError('Tamanhos internos do favicon ICO divergentes.')
manifesto = {'mestreSha256': sha256(mestre.read_bytes()).hexdigest(), 'arquivos': arquivos}
(dist / 'favicon.json').write_text(json.dumps(manifesto, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Favicon: mestre {mestre.stat().st_size} bytes; ICO e sete tamanhos PNG conferidos.')
