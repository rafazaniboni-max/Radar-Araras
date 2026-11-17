"""Testa se arquivos incompletos e valores anormais são recusados sem alterar a referência."""

import hashlib
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import shutil
import tempfile
import unittest

RAIZ = Path(__file__).resolve().parents[1]
spec = spec_from_file_location('validacao', RAIZ / 'scripts' / 'validar-atualizacao.py')
validacao = module_from_spec(spec)
spec.loader.exec_module(validacao)


def assinatura(pasta):
    return {str(p.relative_to(pasta)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in pasta.rglob('*') if p.is_file()}


class BloqueioDeColeta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (RAIZ / '.build').mkdir(exist_ok=True)
        cls.base = RAIZ / 'dist'
        cls.original = assinatura(cls.base)
        cls.dados = validacao.carregar(cls.base)
        cls.fim = cls.dados['legislativo']['fim']

    def setUp(self):
        self.temporario = tempfile.TemporaryDirectory(dir=RAIZ / '.build')
        self.candidata = Path(self.temporario.name) / 'dist'
        shutil.copytree(self.base, self.candidata, ignore=shutil.ignore_patterns('server'))
        self.addCleanup(self.temporario.cleanup)

    def alterar(self, nome, operacao):
        arquivo, variavel = validacao.ARQUIVOS[nome]
        dados = validacao.ler_dados(self.candidata, arquivo, variavel)
        operacao(dados)
        (self.candidata / arquivo).write_text(f'globalThis.{variavel} = {json.dumps(dados, ensure_ascii=False)};\n', encoding='utf-8')

    def reprovar(self):
        with self.assertRaises(ValueError):
            validacao.validar(self.base, self.candidata, self.fim)
        self.assertEqual(assinatura(self.base), self.original)

    def test_versao_completa_e_aceita(self):
        resultado = validacao.validar(self.base, self.candidata, self.fim)
        self.assertEqual(resultado['propostas'], self.dados['territorio']['total'])

    def test_sessao_ausente_e_bloqueada(self):
        self.alterar('legislativo', lambda dados: dados['sessoes'].pop())
        self.reprovar()

    def test_proposta_ausente_e_bloqueada(self):
        arquivo = next((self.candidata / 'propostas').glob('*.json'))
        linhas = json.loads(arquivo.read_text(encoding='utf-8'))
        linhas.pop()
        arquivo.write_text(json.dumps(linhas, ensure_ascii=False), encoding='utf-8')
        self.reprovar()

    def test_valor_financeiro_exagerado_e_bloqueado(self):
        self.alterar('pagamentos', lambda dados: dados['totais'].__setitem__('vereadores', 10**15))
        self.reprovar()

    def test_valor_financeiro_menor_e_bloqueado(self):
        self.alterar('pagamentos', lambda dados: dados['totais'].__setitem__('vereadores', 0))
        self.reprovar()

    def test_data_incorreta_e_bloqueada(self):
        self.alterar('propostas', lambda dados: dados.__setitem__('fim', '2024-12-31'))
        self.reprovar()

    def test_ata_anterior_ausente_e_bloqueada(self):
        self.alterar('auditoria', lambda dados: dados['sessoes'].pop(next(iter(dados['sessoes']))))
        self.reprovar()


if __name__ == '__main__':
    unittest.main(verbosity=2)
