"""Prepara somente os arquivos públicos do site para a hospedagem Hostinger."""

from hashlib import sha256
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import html


raiz = Path(__file__).resolve().parents[1]
dist = raiz / "dist"
pagina = html.fromstring((dist / "index.html").read_bytes())
endereco = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2804798076254345"
anuncios = pagina.xpath("//head/script[contains(@src, 'adsbygoogle.js')]")
if len(anuncios) != 1 or anuncios[0].get("src") != endereco:
    raise ValueError("O código do AdSense precisa aparecer uma vez no cabeçalho.")
if anuncios[0].get("async") is None or anuncios[0].get("crossorigin") != "anonymous":
    raise ValueError("Os atributos do código do AdSense não correspondem ao solicitado.")

permitidas = {".html", ".css", ".js", ".json", ".png", ".svg", ".jpg", ".webp", ".ico", ".txt"}
arquivos = sorted(p for p in dist.rglob("*") if p.is_file()
                  and p.relative_to(dist).parts[0] not in {"server", ".openai"})
for arquivo in arquivos:
    if (arquivo.suffix not in permitidas and arquivo.relative_to(dist).as_posix() != '.htaccess') or arquivo.is_symlink():
        raise ValueError(f"Arquivo inesperado na publicação: {arquivo.relative_to(dist)}")

destino = raiz / ".build" / "hostinger" / "radar-araras.zip"
destino.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(destino, "w", ZIP_DEFLATED) as pacote:
    for arquivo in arquivos:
        pacote.write(arquivo, arquivo.relative_to(dist).as_posix())
with ZipFile(destino) as pacote:
    if pacote.testzip() is not None or "index.html" not in pacote.namelist():
        raise ValueError("O pacote de publicação não passou na verificação.")

print(f"Pacote: {destino}")
print(f"Arquivos públicos: {len(arquivos)}")
print(f"SHA-256: {sha256(destino.read_bytes()).hexdigest()}")
