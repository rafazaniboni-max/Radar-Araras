# Radar Araras

Site com dados oficiais da Câmara Municipal de Araras/SP desde 1º de janeiro de 2025.

A rotina em `.github/workflows/atualizar-site.yml` coleta sessões, presença, votos, propostas de cada autor, atas, contratos, execução de despesas e os arquivos mensais do TCE-SP. A publicação diária está programada para 03h17 no horário de São Paulo. Também pode ser iniciada em Actions, pelo botão Run workflow.

O GitHub Pages precisa estar configurado para publicar por GitHub Actions nas configurações do repositório. A publicação usa a pasta candidata produzida pela coleta. O endereço segue o padrão do GitHub Pages para este repositório.

O workflow manual Publicar a última versão boa permite a primeira publicação ou a restauração dos arquivos de referência já conferidos. Ele utiliza `dist`. A rotina diária utiliza exclusivamente a nova coleta aprovada. Assim, uma fonte temporariamente incompleta preserva a publicação anterior.

Uma falha de rede, página incompleta, perda de documentos anteriores, aumento inesperado ou divergência entre os arquivos interrompe a execução antes do envio ao Pages. O site publicado continua com a versão anterior. O relatório de cada tentativa fica nos artefatos da execução por 30 dias. A versão publicada também inclui `atualizacao.json`, com datas, totais e hashes dos arquivos conferidos.

As regras de bloqueio estão em `scripts/validar-atualizacao.py`. A conferência compara a coleta com a versão de referência em `dist`. Recuos de valores e documentos removidos exigem investigação porque também podem resultar de retificações oficiais. A rotina só substitui a referência depois que a publicação termina com sucesso.

Para executar a mesma coleta localmente, instale Python 3.12, Node.js 24 e as bibliotecas de `requirements.txt`. Execute `python scripts/testar-validacao.py` e `python scripts/atualizar-site.py`. A coleta candidata e o relatório ficam em `.build/atualizacao`. Esses comandos preservam os arquivos de referência.

O projeto também mantém o servidor utilizado na hospedagem Sites. Para montar esse servidor, execute `node scripts/montar-servidor.mjs`. O GitHub Pages utiliza os arquivos estáticos da coleta validada.
