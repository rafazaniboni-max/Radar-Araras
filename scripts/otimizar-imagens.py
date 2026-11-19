"""Gera tamanhos de entrega das imagens e preserva os PNG originais do idealizador."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dist', type=Path, default=RAIZ / 'dist')
args = parser.parse_args()
dist = args.dist.resolve()
if dist != RAIZ / 'dist' and not dist.is_relative_to(RAIZ / '.build'):
    raise ValueError('O destino precisa ficar dentro do projeto.')

manifesto = {}
for nome, larguras, sem_perda in (('logo-radar-araras', (360, 720, 1068), True),
                                  ('rafael-zaniboni', (640,), False)):
    original = dist / f'{nome}.png'
    assinatura = sha256(original.read_bytes()).hexdigest()
    variantes = []
    with Image.open(original) as fonte:
        imagem = ImageOps.exif_transpose(fonte).convert('RGBA' if 'A' in fonte.getbands() else 'RGB')
        for largura in larguras:
            altura = round(imagem.height * largura / imagem.width)
            reduzida = imagem.resize((largura, altura), Image.Resampling.LANCZOS)
            temporario = dist / f'{nome}-{largura}.webp'
            reduzida.save(temporario, 'WEBP', lossless=sem_perda, quality=90, method=6, exact=True)
            digesto = sha256(temporario.read_bytes()).hexdigest()[:12]
            arquivo = f'{nome}-{largura}-{digesto}.webp'
            alvo = dist / arquivo
            if alvo.exists():
                if alvo.read_bytes() != temporario.read_bytes():
                    raise ValueError('Colisão de nome de imagem.')
                temporario.unlink()
            else:
                temporario.rename(alvo)
            with Image.open(alvo) as conferir:
                conferir.load()
                if conferir.size != (largura, altura):
                    raise ValueError('Tamanho de imagem divergente.')
            variantes.append({'arquivo': arquivo, 'largura': largura, 'altura': altura, 'bytes': alvo.stat().st_size})
    if sha256(original.read_bytes()).hexdigest() != assinatura:
        raise ValueError('A imagem original foi alterada.')
    manifesto[nome] = {'original': original.name, 'sha256Original': assinatura, 'variantes': variantes}
    print(f"{nome}: original {original.stat().st_size} bytes; versões: {', '.join(str(v['bytes']) for v in variantes)} bytes.")
(dist / 'imagens.json').write_text(json.dumps(manifesto, ensure_ascii=False, indent=2), encoding='utf-8')
