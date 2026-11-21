'use strict';

(() => {
  const chave = 'radar-araras-preferencias-v1';
  const configuracao = document.documentElement.dataset;
  let preferencia = null;
  try { preferencia = JSON.parse(localStorage.getItem(chave)); } catch {}
  const scripts = new Set();
  function carregar(url, atributos = {}) {
    if (scripts.has(url)) return;
    scripts.add(url);
    const script = document.createElement('script');
    script.async = true;
    script.src = url;
    Object.assign(script, atributos);
    document.head.append(script);
  }
  function aplicar() {
    if (!preferencia?.opcionais) return;
    if (!['radarararas.com.br', 'www.radarararas.com.br'].includes(location.hostname)) return;
    if (configuracao.analytics) {
      globalThis.dataLayer ||= [];
      globalThis.gtag ||= function() { dataLayer.push(arguments); };
      gtag('js', new Date());
      // Os termos de busca digitados e dados de contato não são enviados pelo site.
      gtag('config', configuracao.analytics, {
        page_location: location.origin + location.pathname,
        page_referrer: document.referrer ? new URL(document.referrer).origin : '',
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
      carregar(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(configuracao.analytics)}`);
    }
    const anuncio = document.querySelector('script[data-publicidade]');
    if (anuncio) {
      const origem = anuncio.getAttribute('src');
      // Remover o marcador inerte antes de carregar a tag oficial do AdSense.
      // A biblioteca também inspeciona tags inertes com o mesmo endereço.
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
    aviso.innerHTML = '<p><strong>Sua privacidade</strong><br>Com sua permissão, usamos Google Analytics para medir visitas e Google AdSense para publicidade. Você pode continuar consultando todos os dados sem ativar esses serviços.</p><div><button type="button" data-permitir>Permitir serviços opcionais</button><button type="button" data-recusar>Continuar sem opcionais</button><a href="/privacidade/">Entender o uso dos dados</a></div>';
    aviso.querySelector('[data-permitir]').onclick = () => escolher(true);
    aviso.querySelector('[data-recusar]').onclick = () => escolher(false);
    document.body.append(aviso);
  }
  document.querySelectorAll('[data-preferencias]').forEach(botao => botao.addEventListener('click', abrir));
  if (preferencia && typeof preferencia.opcionais === 'boolean') aplicar();
  else abrir();
})();
