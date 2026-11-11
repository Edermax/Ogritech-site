(() => {
  let installEvent = null, installed = false, busy = false, awaitingInstall = false, nativeFailed = false;
  let installButton, help, installNow, status, installTimer;
  let installRequested = false, promptTimer, requestVersion = 0;
  const unavailableMessage = 'A instalação direta não está disponível nesta janela. Confira as opções de instalação abaixo ou abra o site em uma janela normal do navegador.';
  const standalone = window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)');
  const nativeAvailable = () => !nativeFailed && typeof navigator.install === 'function';
  const isInstalled = () => installed || standalone.matches || navigator.standalone === true;
  const say = message => { if (status) status.textContent = message; };
  function update() {
    if (!installButton) return;
    const direct = Boolean(installEvent) || nativeAvailable();
    installButton.hidden = isInstalled();
    installButton.dataset.installMode = direct ? 'direct' : 'help';
    installButton.setAttribute('aria-disabled', String(busy || awaitingInstall));
    const label = awaitingInstall ? 'Instalando o app...' : 'Instalar o app';
    if (!installButton.classList.contains('pwa-install-button')) installButton.textContent = label;
    installButton.setAttribute('aria-label', label + ' Ogritech neste dispositivo');
    if (installNow) {
      installNow.hidden = !direct || isInstalled();
      installNow.setAttribute('aria-disabled', String(busy || awaitingInstall));
    }
  }
  // Capture readiness before the long authenticated panel finishes loading.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installEvent = event; nativeFailed = false;
    const requested = installRequested && help?.open;
    say('Instalação disponível. Toque em Instalar o app para confirmar.'); update();
    if (requested) {
      if (navigator.userActivation?.isActive) { void install(); }
      else showHelp('A instalação está pronta. Toque em Instalar o app abaixo e confirme no navegador.');
    }
  });
  window.addEventListener('appinstalled', () => {
    installed = true; installEvent = null; awaitingInstall = false; installRequested = false; busy = false; requestVersion++;
    clearTimeout(promptTimer); clearTimeout(installTimer); help?.close(); say('Ogritech instalado. Abra pelo ícone no seu dispositivo.'); update();
  });
  standalone.addEventListener('change', update);
  const registerWorker = async () => { try { await navigator.serviceWorker.register('/sw.js'); } catch { /* Installation remains optional. */ } };
  if ('serviceWorker' in navigator) {
    if (document.readyState === 'complete') registerWorker();
    else window.addEventListener('load', registerWorker, { once: true });
  }
  function showHelp(message) {
    if (message) help.querySelector('[data-install-explanation]').textContent = message;
    if (!help.open) help.showModal();
  }
  async function install() {
    if (busy || awaitingInstall || isInstalled()) return;
    if (!installEvent && !nativeAvailable()) {
      installRequested = true;
      // An event-handler property does not mean an installer will be provided.
      // Offer a concrete alternative instead of inventing installation progress.
      say(unavailableMessage); showHelp(unavailableMessage);
      help.querySelector('.pwa-install-alternatives').open = true;
      update();
      return;
    }
    installRequested = false;
    const prompt = installEvent;
    const requestId = ++requestVersion;
    installEvent = null; busy = true; update(); help.close();
    say('Confirme a instalação na janela do navegador.');
    promptTimer = setTimeout(() => {
      if (requestId !== requestVersion || isInstalled()) return;
      requestVersion++; busy = false;
      say('A confirmação do navegador não chegou. Verifique a janela de instalação ou tente novamente.');
      update();
    }, 30000);
    try {
      // No await before these calls: installation requires the original click.
      const request = prompt ? prompt.prompt() : navigator.install();
      const result = await request;
      if (requestId !== requestVersion || isInstalled()) return;
      const outcome = result?.outcome || (prompt ? (await prompt.userChoice)?.outcome : 'accepted');
      if (requestId !== requestVersion || isInstalled()) return;
      clearTimeout(promptTimer);
      if (outcome === 'dismissed') { say('Instalação cancelada. Nenhuma alteração foi feita.'); return; }
      if (!isInstalled()) {
        awaitingInstall = true;
        say('Instalação solicitada. Aguarde a confirmação do navegador.');
        installTimer = setTimeout(() => {
          awaitingInstall = false;
          say('O navegador não confirmou a conclusão. Verifique se o ícone foi criado ou tente novamente.'); update();
        }, 30000);
      }
    } catch (error) {
      if (requestId !== requestVersion || isInstalled()) return;
      if (error?.name === 'AbortError' || error?.name === 'NotAllowedError') {
        say('A instalação foi cancelada ou não foi autorizada pelo navegador.');
      } else {
        if (!prompt) nativeFailed = true;
        const message = 'O navegador não conseguiu abrir o instalador agora. Use as opções de instalação abaixo ou tente novamente depois.';
        say(message); showHelp(message);
      }
    } finally { if (requestId === requestVersion) { clearTimeout(promptTimer); busy = false; update(); } }
  }
  function initialize() {
    installButton = document.getElementById('panelInstallApp');
    if (!installButton && !document.body.classList.contains('login-page')) return;
    if (!installButton) {
      const styles = document.createElement('link'); styles.rel = 'stylesheet'; styles.href = '/pwa.css?v=20261111.2'; document.head.appendChild(styles);
      installButton = document.createElement('button'); installButton.type = 'button'; installButton.hidden = true;
      installButton.className = 'pwa-install-button'; installButton.innerHTML = '<img src="/ogritech-app-192.png" alt="" width="52" height="52">';
      document.body.appendChild(installButton);
    }
    installButton.setAttribute('aria-haspopup', 'dialog');
    help = document.getElementById('panelInstallHelp') || document.createElement('dialog');
    help.id = 'panelInstallHelp'; help.className = 'panel-install-help'; help.setAttribute('aria-labelledby', 'ogritechInstallTitle');
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const macSafari = /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
    const instructions = ios
      ? 'No iPhone ou iPad, abra no Safari e toque em Compartilhar → Adicionar à Tela de Início. Se aparecer, ative Abrir como app e toque em Adicionar.'
      : macSafari ? 'No Safari do Mac, use Arquivo → Adicionar ao Dock e confirme Adicionar.'
      : /Android/.test(ua) ? 'Abra este endereço no Chrome ou Edge. Toque em Instalar o app e confirme. Pelo menu do navegador, você também pode escolher Adicionar à tela inicial → Instalar.'
      : 'Abra este endereço no Chrome ou Edge. Clique em Instalar o app e confirme. Pelo menu do navegador, você também pode escolher Apps → Instalar este site como aplicativo.';
    help.innerHTML = '<h2 id="ogritechInstallTitle">Instalar Ogritech</h2>' +
      '<p>O app fica com ícone próprio na tela inicial ou no computador e abre em uma janela própria.</p>' +
      '<p data-install-explanation role="status" aria-live="polite">Confirme a instalação para adicionar o ícone da Ogritech ao seu dispositivo.</p>' +
      '<form method="dialog"><button class="table-button edit panel-install-button" type="button" data-install-now hidden>Instalar o app</button><button class="table-button edit panel-install-button" type="submit">Fechar</button></form>' +
      '<details class="pwa-install-alternatives"><summary>Outras opções de instalação</summary><p>' + instructions + '</p></details>';
    if (!help.parentNode) document.body.appendChild(help);
    help.addEventListener('close', () => {
      if (!installRequested || busy || awaitingInstall) return;
      installRequested = false; say(''); update();
    });
    installNow = help.querySelector('[data-install-now]'); installNow.addEventListener('click', install);
    status = document.createElement('p'); status.className = 'pwa-install-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    if (installButton.classList.contains('pwa-install-button')) help.appendChild(status);
    else installButton.insertAdjacentElement('afterend', status);
    installButton.addEventListener('click', install); update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
