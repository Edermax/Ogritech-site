(() => {
  let installEvent = null, installed = false, busy = false, awaitingInstall = false, nativeFailed = false;
  let installButton, help, installNow, status, installTimer;
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
    const label = awaitingInstall ? 'Instalando app...' : direct ? 'Instalar app' : 'Como instalar o app';
    if (!installButton.classList.contains('pwa-install-button')) installButton.textContent = label;
    installButton.setAttribute('aria-label', label + ' Ogritech neste dispositivo');
    if (installNow) {
      installNow.hidden = !direct || isInstalled();
      installNow.setAttribute('aria-disabled', String(busy || awaitingInstall));
    }
  }
  // Capture readiness before the long authenticated panel finishes loading.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installEvent = event; nativeFailed = false; update();
  });
  window.addEventListener('appinstalled', () => {
    installed = true; installEvent = null; awaitingInstall = false;
    clearTimeout(installTimer); help?.close(); say('Ogritech instalado. Abra pelo ícone no seu dispositivo.'); update();
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
    if (!installEvent && !nativeAvailable()) { showHelp(); return; }
    const prompt = installEvent;
    installEvent = null; busy = true; update(); help.close();
    try {
      // No await before these calls: installation requires the original click.
      const request = prompt ? prompt.prompt() : navigator.install();
      const result = await request;
      const outcome = result?.outcome || (prompt ? (await prompt.userChoice)?.outcome : 'accepted');
      if (outcome === 'dismissed') { say('Instalação cancelada. Nenhuma alteração foi feita.'); return; }
      if (!isInstalled()) {
        awaitingInstall = true;
        say('Instalação solicitada. Aguarde a confirmação do navegador.');
        installTimer = setTimeout(() => {
          awaitingInstall = false;
          say('Se concluiu a instalação, abra a Ogritech pelo ícone no seu dispositivo.'); update();
        }, 30000);
      }
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'NotAllowedError') {
        say('A instalação foi cancelada ou não foi autorizada pelo navegador.');
      } else {
        if (!prompt) nativeFailed = true;
        showHelp('O navegador não conseguiu abrir o instalador agora. Use a opção de instalação no menu do navegador ou tente novamente depois.');
      }
    } finally { busy = false; update(); }
  }
  function initialize() {
    installButton = document.getElementById('panelInstallApp');
    if (!installButton && !document.body.classList.contains('login-page')) return;
    if (!installButton) {
      const styles = document.createElement('link'); styles.rel = 'stylesheet'; styles.href = '/pwa.css?v=20261111.1'; document.head.appendChild(styles);
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
      : /Android/.test(ua) ? 'Abra este endereço no Chrome ou Edge. Quando Instalar app aparecer, toque nele e confirme. Pelo menu do navegador, você também pode escolher Adicionar à tela inicial → Instalar.'
      : 'Abra este endereço no Chrome ou Edge. Quando Instalar app aparecer, clique nele e confirme. Pelo menu do navegador, você também pode escolher Apps → Instalar este site como aplicativo.';
    help.innerHTML = '<h2 id="ogritechInstallTitle">Instalar Ogritech</h2>' +
      '<p>O app fica com ícone próprio na tela inicial ou no computador e abre em uma janela própria.</p>' +
      '<p data-install-explanation>Este navegador ainda não disponibilizou a instalação direta por botão. Em navegadores internos de outros aplicativos, abra o site no navegador do dispositivo.</p>' +
      '<p>' + instructions + '</p><p class="pwa-install-status" role="status" aria-live="polite"></p>' +
      '<form method="dialog"><button class="table-button edit panel-install-button" type="button" data-install-now hidden>Instalar agora</button><button class="table-button edit panel-install-button" type="submit">Fechar</button></form>';
    if (!help.parentNode) document.body.appendChild(help);
    installNow = help.querySelector('[data-install-now]'); installNow.addEventListener('click', install);
    status = document.createElement('p'); status.className = 'pwa-install-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    if (installButton.classList.contains('pwa-install-button')) help.appendChild(status);
    else installButton.insertAdjacentElement('afterend', status);
    installButton.addEventListener('click', install); update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
