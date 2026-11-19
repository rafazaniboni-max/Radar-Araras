"""Testa a detecção de coleta antiga ou arquivos misturados na hospedagem."""

import hashlib
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import tempfile
import unittest

spec = spec_from_file_location('entrega', Path(__file__).with_name('conferir-publicacao.py'))
entrega = module_from_spec(spec)
spec.loader.exec_module(entrega)


class ConferenciaDaEntrega(unittest.TestCase):
    def setUp(self):
        self.temporario = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporario.cleanup)
        self.pasta = Path(self.temporario.name)
        self.revisao = 'a' * 20
        self.arquivos = {nome: f'conteudo de {nome}'.encode() for nome in entrega.ARQUIVOS}
        self.arquivos['index.html'] = f'<html data-coleta="{self.revisao}"></html>'.encode()
        self.relatorio = {'aprovado': True, 'fim': '2026-11-19', 'concluidoEm': '2026-11-19T09:35:00-03:00',
                          'verificacoes': {'sha256': {nome: hashlib.sha256(dados).hexdigest()
                                                     for nome, dados in self.arquivos.items()}}}
        (self.pasta / 'index.html').write_bytes(self.arquivos['index.html'])
        (self.pasta / 'atualizacao.json').write_text(json.dumps(self.relatorio), encoding='utf-8')
        self.publicado = json.loads(json.dumps(self.relatorio))

    def ler(self, url):
        nome = entrega.urlsplit(url).path.strip('/') or 'index.html'
        if nome == 'atualizacao.json':
            return json.dumps(self.publicado).encode()
        return self.arquivos[nome]

    def test_arquivos_da_coleta_aprovada_confirmam_a_entrega(self):
        resultado = entrega.conferir(self.pasta, self.ler)
        self.assertTrue(resultado['aprovado'])
        self.assertEqual(resultado['arquivosConferidos'], 9)

    def test_relatorio_da_coleta_anterior_nao_confirma_entrega(self):
        self.publicado['concluidoEm'] = '2026-11-16T09:35:00-03:00'
        with self.assertRaisesRegex(ValueError, 'outra coleta'):
            entrega.conferir(self.pasta, self.ler)

    def test_relatorio_novo_com_arquivo_antigo_nao_confirma_entrega(self):
        self.arquivos['pagamentos.js'] = b'pagamentos anteriores'
        with self.assertRaisesRegex(ValueError, 'pagamentos.js'):
            entrega.conferir(self.pasta, self.ler)


if __name__ == '__main__':
    unittest.main(verbosity=2)
