'use strict';

(() => {
  const chave = 'radar-araras-preferencias-v1';
  const configuracao = document.documentElement.dataset;
  let preferencia = null;
  try { preferencia = JSON.parse(localStorage.getItem(chave)); } catch {}
  const scripts = new Set();
  let googlePreparado = false;
  let analyticsCarregado = false;
  function carregar(url, atributos = {}) {
    if (scripts.has(url)) return;
    scripts.add(url);
    const script = document.createElement('script');
    script.async = true;
    script.src = url;
    Object.assign(script, atributos);
    document.head.append(script);
  }
  function carregarAnalytics() {
    if (!configuracao.analytics || analyticsCarregado || !preferencia?.opcionais) return;
    analyticsCarregado = true;
    gtag('js', new Date());
    // Não enviar os termos digitados na busca nem os parâmetros de diagnóstico.
    gtag('config', configuracao.analytics, {
      page_location: location.origin + location.pathname,
      page_referrer: document.referrer ? new URL(document.referrer).origin : '',
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    carregar('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(configuracao.analytics));
  }
  function aplicarSinaisGoogle() {
    if (!preferencia?.opcionais || typeof googlefc.getGoogleConsentModeValues !== 'function') return;
    const sinais = googlefc.getGoogleConsentModeValues();
    // Valores documentados pela API: 1 concedido, 2 negado, 3 não aplicável,
    // 4 finalidade não configurada. Valor desconhecido permanece bloqueado.
    const permite = valor => [1, 3, 4].includes(valor);
    const podeMedir = permite(sinais.analyticsStoragePurposeConsentStatus);
    gtag('consent', 'update', {
      ad_storage: permite(sinais.adStoragePurposeConsentStatus) ? 'granted' : 'denied',
      ad_user_data: permite(sinais.adUserDataPurposeConsentStatus) ? 'granted' : 'denied',
      ad_personalization: permite(sinais.adPersonalizationPurposeConsentStatus) ? 'granted' : 'denied',
      analytics_storage: podeMedir ? 'granted' : 'denied'
    });
    configuracao.cmpAnalytics = podeMedir ? 'permitido' : 'bloqueado';
    if (podeMedir) carregarAnalytics();
    else if (analyticsCarregado) {
      // Na retirada do consentimento, a próxima página não carrega a medição.
      analyticsCarregado = false;
      location.reload();
    }
  }
  function prepararGoogle() {
    if (googlePreparado) return;
    googlePreparado = true;
    globalThis.googlefc ||= {};
    googlefc.callbackQueue ||= [];
    globalThis.dataLayer ||= [];
    globalThis.gtag ||= function() { dataLayer.push(arguments); };
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied'
    });
    configuracao.cmpStatus = 'aguardando';
    // Modo básico: o Analytics só é carregado depois da decisão da CMP,
    // ou da confirmação do Google de que a regra regional não se aplica.
    googlefc.callbackQueue.push({ CONSENT_MODE_DATA_READY: aplicarSinaisGoogle });
    googlefc.callbackQueue.push({
      CONSENT_API_READY: () => {
        if (typeof globalThis.__tcfapi !== 'function') return;
        __tcfapi('addEventListener', 0, (dados, sucesso) => {
          if (!sucesso || !dados) return;
          configuracao.cmpStatus = dados.gdprApplies === true ? 'europeu'
            : dados.gdprApplies === false ? 'nao-aplicavel' : 'aguardando';
          document.querySelectorAll('[data-preferencias-google]').forEach(botao => {
            botao.hidden = dados.gdprApplies !== true;
            botao.style.display = botao.hidden ? 'none' : '';
          });
          if (['tcloaded', 'useractioncomplete'].includes(dados.eventStatus)) {
            googlefc.callbackQueue.push({ CONSENT_MODE_DATA_READY: aplicarSinaisGoogle });
          }
        });
      }
    });
  }
  function aplicar() {
    if (!preferencia?.opcionais) return;
    if (!['radarararas.com.br', 'www.radarararas.com.br'].includes(location.hostname)) return;
    prepararGoogle();
    const anuncio = document.querySelector('script[data-publicidade]');
    if (anuncio) {
      const origem = anuncio.getAttribute('src');
      // A tag oficial do AdSense entrega a mensagem certificada publicada.
      // Remover o marcador inerte evita atributos estranhos à biblioteca.
      anuncio.remove();
      carregar(origem, { crossOrigin: 'anonymous' });
    }
  }
  function escolher(opcionais) {
    const anterior = preferencia?.opcionais;
    preferencia = { opcionais, atualizadoEm: new Date().toISOString() };
    try { localStorage.setItem(chave, JSON.stringify(preferencia)); } catch {}
    document.querySelector('.consentimento')?.remove();
    if (anterior && !opcionais) location.reload();
    else aplicar();
  }
  function abrir() {
    if (document.querySelector('.consentimento')) return;
    const aviso = document.createElement('aside');
    aviso.className = 'consentimento';
    aviso.setAttribute('aria-label', 'Preferências de privacidade');
    aviso.innerHTML = '<p><strong>Sua privacidade</strong><br>Com sua permissão, usamos Google Analytics para medir visitas e Google AdSense para publicidade. Você pode continuar consultando todos os dados sem ativar esses serviços. Onde as regras europeias se aplicam, o Google também apresenta as escolhas de consentimento da sua plataforma certificada.</p><div><button type="button" data-permitir>Permitir serviços opcionais</button><button type="button" data-recusar>Continuar sem opcionais</button><a href="/privacidade/">Entender o uso dos dados</a></div>';
    aviso.querySelector('[data-permitir]').onclick = () => escolher(true);
    aviso.querySelector('[data-recusar]').onclick = () => escolher(false);
    document.body.append(aviso);
  }
  document.querySelectorAll('[data-preferencias]').forEach(botao => botao.addEventListener('click', abrir));
  document.querySelectorAll('[data-preferencias-google]').forEach(botao => botao.addEventListener('click', () => {
    if (!preferencia?.opcionais || !googlePreparado) return;
    googlefc.callbackQueue.push({
      CONSENT_API_READY: () => googlefc.showRevocationMessage()
    });
  }));
  if (preferencia && typeof preferencia.opcionais === 'boolean') aplicar();
  else abrir();
})();
