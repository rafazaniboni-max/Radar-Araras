"""Verifica preservação de versões, reaparecimento e os limites contra coletas parciais."""

from contextlib import redirect_stdout
from copy import deepcopy
from importlib.util import module_from_spec, spec_from_file_location
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

RAIZ = Path(__file__).resolve().parents[1]


def modulo(nome):
    spec = spec_from_file_location(nome.replace('-', '_'), RAIZ / 'scripts' / f'{nome}.py')
    resultado = module_from_spec(spec)
    spec.loader.exec_module(resultado)
    return resultado


historico = modulo('historico-documentos')
classificacao = modulo('classificar-propostas')
atualizador = modulo('atualizar-site')


class HistoricoDocumentos(unittest.TestCase):
    def setUp(self):
        (RAIZ / '.build').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=RAIZ / '.build')
        self.addCleanup(self.temp.cleanup)
        self.raiz = Path(self.temp.name)
        self.base = self.raiz / 'base'
        self.origem = self.raiz / 'origem'
        self.destino = self.raiz / 'destino'
        self.origem.mkdir()
        self.destino.mkdir()
        self.perfil = {'id': '1', 'fonte': 'https://araras.siscam.com.br/Vereadores/Proposituras/1',
                       'completo': True, 'registros': [dict(id=str(id), titulo=f'Indicação Nº {id}/2026',
                       data='2026-11-13', assunto=f'Pedido de poda na Rua {id}', tipo='Indicações',
                       url=f'https://araras.siscam.com.br/Documentos/Documento/{id}') for id in range(10, 20)]}
        self.gravar(self.perfil)
        self.publicar(self.base, '2026-11-16')

    def gravar(self, perfil):
        (self.origem / '1.json').write_text(json.dumps(perfil, ensure_ascii=False), encoding='utf-8')

    def publicar(self, destino, fim):
        with redirect_stdout(StringIO()):
            classificacao.publicar(self.origem, destino, '2025-01-01', fim)

    def reconciliar(self, perfil):
        self.gravar(perfil)
        return historico.reconciliar(self.base, self.origem, self.destino, '2026-11-18')

    def test_ausente_preserva_registro_sem_inventar_retirada(self):
        perfil = deepcopy(self.perfil)
        removido = perfil['registros'].pop()
        resultado = self.reconciliar(perfil)
        self.assertEqual(resultado['naoLocalizados'], ['19'])
        restaurado = json.loads((self.origem / '1.json').read_text(encoding='utf-8'))['registros'][-1]
        self.assertEqual({k: restaurado[k] for k in historico.CAMPOS}, removido)
        self.assertEqual(restaurado['acompanhamento']['estado'], 'nao_localizado')
        self.publicar(self.destino, '2026-11-18')
        self.assertEqual(historico.validar_historico(self.base, self.destino), 1)

    def test_alteracao_guarda_ambas_as_versoes(self):
        perfil = deepcopy(self.perfil)
        perfil['registros'][0]['assunto'] = 'Pedido de limpeza na Rua 10'
        self.reconciliar(perfil)
        item = historico.ler_historico(self.destino)['documentos']['10']
        self.assertEqual(len(item['versoes']), 2)
        self.assertEqual(item['versoes'][0]['dados']['assunto'], self.perfil['registros'][0]['assunto'])
        self.assertIn('assunto', item['eventos'][-1]['campos'])

    def test_reaparecimento_e_nova_alteracao_nao_apagam_passado(self):
        perfil = deepcopy(self.perfil)
        perfil['registros'].pop()
        self.reconciliar(perfil)
        self.publicar(self.destino, '2026-11-18')
        self.base = self.destino
        self.destino = self.raiz / 'segunda'
        novo = deepcopy(self.perfil)
        novo['registros'][-1]['assunto'] = 'Novo texto oficial'
        self.reconciliar(novo)
        item = historico.ler_historico(self.destino)['documentos']['19']
        self.assertEqual(item['estado'], 'localizado')
        self.assertEqual(len(item['versoes']), 2)
        self.assertEqual(item['eventos'][0]['tipo'], 'nao_localizado')
        self.publicar(self.destino, '2026-11-18')
        historico.validar_historico(self.base, self.destino)

    def test_ausencia_persistente_nao_duplica_evento(self):
        perfil = deepcopy(self.perfil)
        perfil['registros'].pop()
        self.reconciliar(perfil)
        self.publicar(self.destino, '2026-11-18')
        self.base = self.destino
        self.destino = self.raiz / 'segunda'
        self.reconciliar(perfil)
        self.assertEqual(len(historico.ler_historico(self.destino)['documentos']['19']['eventos']), 1)

    def test_coleta_vazia_ou_queda_grande_continua_bloqueada(self):
        for quantidade in (0, 4):
            perfil = deepcopy(self.perfil)
            perfil['registros'] = perfil['registros'][:quantidade]
            with self.assertRaises(ValueError):
                self.reconciliar(perfil)

    def test_tipos_no_singular_e_plural_preservam_a_fonte_de_cada_coautor(self):
        perfis = {'1': deepcopy(self.perfil['registros']), '2': deepcopy(self.perfil['registros'])}
        perfis['2'][0]['tipo'] = 'Indicação'
        documento = historico.agrupar(perfis)['10']
        self.assertEqual(documento['autores'], ['1', '2'])
        self.assertEqual(documento['registrosPorAutor']['2']['tipo'], 'Indicação')

    def test_reaparecimento_sem_mudanca_tem_evento_proprio(self):
        perfil = deepcopy(self.perfil)
        perfil['registros'].pop()
        self.reconciliar(perfil)
        self.publicar(self.destino, '2026-11-18')
        self.base = self.destino
        self.destino = self.raiz / 'segunda'
        self.reconciliar(deepcopy(self.perfil))
        item = historico.ler_historico(self.destino)['documentos']['19']
        self.assertEqual(item['eventos'][-1]['tipo'], 'reapareceu')
        self.assertEqual(len(item['versoes']), 1)

    def test_perfil_incompleto_continua_bloqueado(self):
        perfil = deepcopy(self.perfil)
        perfil['completo'] = False
        with self.assertRaises(ValueError):
            self.reconciliar(perfil)

    def test_historico_antigo_nao_pode_ser_reescrito(self):
        perfil = deepcopy(self.perfil)
        perfil['registros'].pop()
        self.reconciliar(perfil)
        self.publicar(self.destino, '2026-11-18')
        self.base = self.destino
        self.destino = self.raiz / 'segunda'
        self.reconciliar(perfil)
        self.publicar(self.destino, '2026-11-18')
        arquivo = self.destino / 'historico-documentos.json'
        dados = historico.ler_historico(self.destino)
        dados['documentos']['19']['versoes'][0]['dados']['assunto'] = 'Texto adulterado'
        arquivo.write_text(json.dumps(dados), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'Histórico anterior foi alterado'):
            historico.validar_historico(self.base, self.destino)

    def test_diagnostico_de_atas_guarda_sessao_e_pdf_da_falha(self):
        pagina = atualizador.html.fromstring('<div><h4><a href="/Sessoes/Documento/1">Ata</a></h4><a href="/arquivo?Id=123"><i class="file-pdf"></i></a></div>')
        sessoes = [dict(id='1',titulo='Sessão de teste',data='2026-11-16',url='https://araras.siscam.com.br/Sessoes/Sessao/1')]
        with patch.object(atualizador.coletor, 'buscar', return_value=pagina), patch.object(atualizador, 'baixar_bytes', side_effect=TimeoutError('tempo esgotado')):
            with redirect_stdout(StringIO()), self.assertRaisesRegex(ValueError, 'Sessões: 1'):
                atualizador.coletar_atas(sessoes, self.raiz / 'cache', self.raiz / 'raw')
        dados = json.loads((self.raiz / 'raw/atas/diagnostico.json').read_text(encoding='utf-8'))
        self.assertEqual(dados[0]['situacao'], 'falha')
        self.assertEqual(dados[0]['pdf'], 'https://araras.siscam.com.br/arquivo?Id=123')


if __name__ == '__main__':
    unittest.main(verbosity=2)
