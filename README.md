# Radar Araras

O favicon usa o desenho fornecido pelo idealizador, com mestre de 512 pixels em `assets/favicon-radar-araras.png`. A exportação automática produz ICO com quatro tamanhos internos, PNGs de 16 a 512 pixels e ícone de atalho Apple. Os links de todas as páginas levam a uma revisão do mestre para evitar o ícone antigo no cache.

A abertura entrega o conteúdo no HTML, calcula o contador com as mesmas funções puras testadas da interface e busca o relatório real da coleta. A base das consultas interativas é carregada quando a pessoa se aproxima da busca ou dos filtros. Retratos oficiais só começam a carregar perto da tela. Isso evita baixar as fotos de vereadores que ainda não aparecem para o leitor.

`scripts/otimizar-imagens.py` gera versões WebP do logotipo e do retrato para os tamanhos exibidos na tela. Os PNG originais são preservados e seus hashes conferidos. O logotipo usa compressão sem perdas após o redimensionamento. As imagens geradas têm nomes com hash e cache de um ano; o HTML informa `srcset`, `sizes` e prioridade para o logotipo da abertura.

As páginas públicas são geradas por `scripts/gerar-seo.mjs`, com a mesma base de dados aprovada da interface. Incluem perfis, grupos paginados de propostas, sessões, despesas, locais citados, guias, fontes, contato e privacidade. O gerador não faz consultas de rede. `scripts/conferir-seo.mjs` bloqueia páginas sem conteúdo, links internos quebrados, títulos repetidos, divergência no sitemap e perda de perfis. As regras de preservação dos dados continuam em vigor.

O robô diário gera e confere o HTML antes da validação final. O workflow `publicar-seo.yml` permite atualizar a apresentação sobre a coleta já aprovada, preservando `concluidoEm` e o período dos dados. Pushes com `[publicar-seo]` acionam esse fluxo; a rotina diária não faz uma coleta paralela nesse mesmo push. Atualizações de código não podem ser exibidas como uma nova conferência das fontes.

O arquivo `config/seo.json` mantém o domínio canônico e o identificador público do Analytics. O sitemap usa endereços sem fragmentos, com datas de alteração de conteúdo. Páginas de grupos vazios ou sem coleta de propostas são `noindex`. As páginas de lugares identificados automaticamente informam os limites da extração; outros termos continuam disponíveis na busca. Redirecionamentos e erro 404 são definidos em `dist/.htaccess`.

O Analytics e o AdSense só são carregados após a escolha de serviços opcionais no aviso de privacidade. A preferência pode ser revista no rodapé. A medição exclui os parâmetros da busca local, desativa sinais do Google e a personalização de anúncios do Analytics; a medição otimizada foi desativada no fluxo Web. A aprovação do AdSense e eventuais configurações de consentimento regional no painel do Google são independentes da publicação do código.

Site com dados oficiais da Câmara Municipal de Araras/SP desde 1º de janeiro de 2025.

A rotina em `.github/workflows/atualizar-site.yml` coleta sessões, presença, votos, propostas de cada autor, atas, contratos, execução de despesas e os arquivos mensais do TCE-SP. A coleta diária está agendada para as 05h00 no horário de São Paulo. Às 07h17, o robô consulta o relatório no domínio público. Se a entrega da coleta aprovada do dia ainda estiver pendente ou a consulta falhar, ele tenta novamente em ambiente novo. O horário efetivo depende da fila do GitHub Actions e a publicação depende da validação. A coleta também pode ser iniciada em Actions pelo botão Run workflow.

O GitHub Pages precisa estar configurado para publicar por GitHub Actions nas configurações do repositório. A publicação usa a pasta candidata produzida pela coleta. O endereço segue o padrão do GitHub Pages para este repositório.

O workflow manual Publicar a última versão boa permite a primeira publicação ou a restauração dos arquivos de referência já conferidos. Ele utiliza `dist`. A rotina diária utiliza exclusivamente a nova coleta aprovada. Assim, uma fonte temporariamente incompleta preserva a publicação anterior.

Uma falha de rede, página incompleta, perda de documentos anteriores, aumento inesperado ou divergência entre os arquivos interrompe a execução antes do envio ao Pages. O site publicado continua com a versão anterior. O relatório de cada tentativa fica nos artefatos da execução por 30 dias. A versão publicada também inclui `atualizacao.json`, com datas, totais e hashes dos arquivos conferidos.

As regras de bloqueio estão em `scripts/validar-atualizacao.py`. A conferência compara a coleta com a versão de referência em `dist`. Recuos de valores exigem investigação porque também podem resultar de retificações oficiais. Documentos isolados não localizados ficam preservados no histórico; quedas grandes e fontes incompletas continuam bloqueadas. Quando a lista de um autor perde muitos registros, o coletor confere a pesquisa oficial paginada antes da validação. A rotina só substitui a referência depois que a publicação termina com sucesso.

A exportação Betha repete falhas temporárias de rede, espera a geração do arquivo e identifica conjunto e exercício em cada falha. `raw/diagnostico-financeiro.json` e `raw/atas/diagnostico.json` acompanham o relatório nos artefatos do GitHub. Não são registrados tokens ou URLs de download assinadas. A conferência financeira passa a guardar os pagamentos por empenho: campos sem valor e sem parcelas ficam identificados, sem serem convertidos em zero. Perda de pagamentos anteriores, soma divergente ou parcela sem valor consolidado continuam impedindo a publicação. O primeiro ciclo com essa conferência também preserva as verificações dos totais da referência anterior.

As páginas Siscam são solicitadas com compressão gzip para reduzir a transferência dos perfis integrais. A pesquisa geral por autor não conta emendas e substitutivos como resultados principais. Por isso, quando usada como alternativa, ela é complementada pelas listas menores de emendas e substitutivos, seguindo os links publicados na página oficial de contagem do autor. Cada lista é conferida contra o total do próprio cabeçalho. A indisponibilidade dessas fontes mantém o bloqueio para autores em exercício ou com documentos relacionados anteriores conhecidos, sem presumir retirada.

O tipo já registrado é mantido quando a única diferença é singular ou plural entre fontes oficiais, como “Indicação” e “Indicações”. Isso evita criar eventos falsos de alteração ao trocar o caminho de consulta. O HTML original de cada fonte continua arquivado na coleta.

Para parlamentares fora de exercício cuja página integral não está publicada e sem emendas ou substitutivos na referência anterior, a pesquisa oficial de matérias principais pode ser usada. O índice marca `relacionadosNaoConferidos` e a página Fontes mostra o nome e o limite: novos documentos relacionados desse perfil não foram confirmados. Isso não é uma contagem zero de emendas. Documentos relacionados anteriores conhecidos continuam impedindo que uma lista parcial seja aceita. A mesma regra vale para todos os autores.

Uma base aprovada recebe URLs de dados versionadas para evitar que o navegador exiba arquivos de uma coleta anterior. A data da consulta é separada da data do último pagamento ou documento efetivamente publicado pela fonte.

Na Hostinger, `dist/.htaccess` impede que a página de abertura e o relatório de atualização sejam guardados como uma versão antiga. Os dados recebem uma revisão nova a cada coleta; imagens e fontes podem continuar aceleradas pelo CDN. A conferência da entrega aguarda até 20 minutos, com novas tentativas, para acomodar a fila de implantação e a propagação da hospedagem.

Para executar a mesma coleta localmente, instale Python 3.12, Node.js 24 e as bibliotecas de `requirements.txt`. Execute `python scripts/testar-validacao.py` e `python scripts/atualizar-site.py`. A coleta candidata e o relatório ficam em `.build/atualizacao`. Esses comandos preservam os arquivos de referência.

O projeto também mantém o servidor utilizado na hospedagem Sites. Para montar esse servidor, execute `node scripts/montar-servidor.mjs`. O GitHub Pages utiliza os arquivos estáticos da coleta validada.

Para preparar o pacote da Hostinger, execute `python scripts/empacotar-hostinger.py`. O arquivo `.build/hostinger/radar-araras.zip` contém os arquivos públicos de `dist`, com `index.html` na raiz e sem o servidor da hospedagem Sites. O pacote usa a última versão de referência; uma coleta rejeitada não substitui esses dados. Extraia o conteúdo na pasta pública do domínio `radarararas.com.br`.

O código do AdSense com o identificador `ca-pub-2804798076254345` fica uma única vez no `<head>` de `dist/index.html`, compartilhado por todas as telas do site.

Após uma coleta aprovada, a rotina diária também atualiza a branch `codex/site-publicado` com somente os arquivos públicos de `dist`. Essa branch deve ser selecionada na integração Git da Hostinger, com destino `public_html` e publicação automática ativa. Uma coleta rejeitada não altera essa branch. A conexão oficial da Hostinger com o GitHub deve estar autorizada somente para o repositório Radar-Araras.

A execução só termina com sucesso depois que `scripts/conferir-publicacao.py` confirma o relatório da mesma coleta e os hashes de treze arquivos de dados, scripts e estilos no domínio oficial. Se o GitHub receber os dados, mas a Hostinger não os entregar, a execução falha na etapa de entrega e registra o motivo no artefato `conferencia-da-entrega`. Esse erro é separado de uma coleta reprovada: a base de dados já aprovada permanece no repositório. O relatório não inclui o hash de si mesmo.

O selo da abertura usa `concluidoEm` do relatório aprovado, conferindo se sua revisão corresponde aos dados carregados. Mostra minutos, horas ou dias desde a conferência e renova o texto a cada minuto. Não usa a hora da visita como se fosse uma coleta nova. O período desde 01/01/2025 continua em Fontes e Transparência. Scripts e estilos também recebem a revisão da coleta para evitar versões antigas na abertura.
