/* 6.0.5-signin: one startup overlay, one Tableau iframe.
 * No credentials, iframe-DOM inspection or authentication API is implemented.
 * main() signals readiness only after the provider's interactive event and
 * complete index validation. The timer alone can NEVER unlock the application.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const ACTIVE = 'rwa-splash-active', EXITING = 'rwa-splash-exiting';
  const savedAttributes = [];
  let screen, title, message, errorBox, retry, titleObserver;
  let mounted = false, finished = false, exiting = false, failed = false;
  let ready = root.dataset.rwaAppReady === 'true', startedAt = 0, minimumMs = 5000;
  let minimumTimer, watchdogTimer, exitTimer;
  const messages = Object.freeze({
    loading_sdk: 'Loading the Tableau connection...',
    waiting_for_tableau: 'If prompted, select Sign In in the Tableau panel below. Waiting for the view to become ready...',
    checking_index: 'Tableau is interactive. Checking the available group index...',
    loading_sample: 'Loading the synthetic sample...',
    ready: 'Ready. Opening RWA Reports...'
  });
  // Runs synchronously in <head>; prevents a flash of the main screen.
  root.dataset.rwaSplashController = '6.0.5-signin';
  root.classList.add(ACTIVE);

  function emit(name, reason) {
    document.dispatchEvent(new CustomEvent(name, {detail: {
      reason, elapsedMs: mounted ? performance.now() - startedAt : 0
    }}));
  }
  function syncTitle() {
    const heading = document.querySelector('body > header h1');
    if (!heading || !title) return;
    const copy = heading.cloneNode(true);
    copy.querySelectorAll('.badge, [aria-hidden="true"]').forEach(node => node.remove());
    const text = copy.textContent.trim();
    if (text) title.textContent = text;
  }
  function renderPhase(phase) {
    if (message && !failed && !finished && messages[phase]) message.textContent = messages[phase];
  }
  function onProgress(event) {
    if (failed || finished || ready) return;
    const phase = event.detail?.phase;
    if (Object.hasOwn(messages, phase || '')) renderPhase(phase);
  }
  function fail(text) {
    if (finished || failed) return;
    failed = true; ready = false; exiting = false;
    clearTimeout(minimumTimer); clearTimeout(watchdogTimer); clearTimeout(exitTimer);
    root.classList.remove(EXITING);
    root.dataset.rwaLoadingState = 'failed';
    root.dataset.rwaAppReady = 'false';
    const value = typeof text === 'string' && text.trim()
      ? text : 'The connection could not be completed. Check the deployment and reload.';
    root.dataset.rwaStartupError = value;
    if (message) message.textContent = 'Setup could not be completed. No report has run.';
    if (errorBox) {errorBox.textContent = value; errorBox.hidden = false;}
    if (retry) retry.hidden = false;
    // The provider already closes on initialisation failure. Leave the failure
    // message visible; do not expose a non-operational chat behind the cover.
    const panel = document.getElementById('tableau-panel');
    if (panel) panel.hidden = true;
    emit('rwa:splash-failed', 'startup-failure');
  }
  function onFailure(event) {fail(event.detail?.message || root.dataset.rwaStartupError);}
  function finish() {
    if (finished || failed || !ready) return;
    finished = true;
    clearTimeout(minimumTimer); clearTimeout(watchdogTimer); clearTimeout(exitTimer);
    titleObserver?.disconnect();
    document.removeEventListener('rwa:startup-progress', onProgress);
    document.removeEventListener('rwa:startup-ready', onReady);
    document.removeEventListener('rwa:startup-failed', onFailure);
    document.removeEventListener('rwa:initialization-settled', onSettled);
    window.removeEventListener('error', onScriptError, true);
    const wasFocused = screen?.contains(document.activeElement);
    if (screen) {
      screen.removeEventListener('transitionend', onTransitionEnd);
      // Do NOT remove/reparent this node: it owns the live Tableau iframe.
      screen.hidden = true;
      screen.setAttribute('inert', '');
      screen.setAttribute('aria-hidden', 'true');
    }
    for (const entry of savedAttributes) for (const [key, value] of Object.entries(entry.attributes)) {
      if (value === null) entry.element.removeAttribute(key);
      else entry.element.setAttribute(key, value);
    }
    root.classList.remove(ACTIVE, EXITING);
    root.dataset.rwaLoadingState = 'done';
    emit('rwa:splash-hidden', 'ready');
    if (wasFocused) {
      // Move focus out of the now-hidden iframe, without opening a mobile keyboard.
      const heading = document.querySelector('body > header h1');
      if (heading) {
        const prior = heading.getAttribute('tabindex');
        heading.setAttribute('tabindex', '-1');heading.focus({preventScroll: true});
        if (prior === null) heading.removeAttribute('tabindex'); else heading.setAttribute('tabindex', prior);
      }
    }
  }
  function onTransitionEnd(event) {
    if (event.target === screen && ['transform', 'opacity'].includes(event.propertyName)) finish();
  }
  function transitionMs(element) {
    const style = getComputedStyle(element);
    const parse = value => value.trim().endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
    const times = style.transitionDuration.split(',').map(parse);
    const delays = style.transitionDelay.split(',').map(parse);
    return Math.max(0, ...times.map((time, i) => time + delays[i % delays.length]));
  }
  function exit() {
    if (!mounted || exiting || finished || failed || !ready) return;
    const remaining = minimumMs - (performance.now() - startedAt);
    if (remaining > 0) {
      clearTimeout(minimumTimer);minimumTimer = setTimeout(exit, remaining + 1);return;
    }
    exiting = true;clearTimeout(watchdogTimer);
    root.dataset.rwaLoadingState = 'exiting';root.dataset.rwaLoadingExitReason = 'ready';
    screen.addEventListener('transitionend', onTransitionEnd);
    root.classList.add(EXITING);emit('rwa:splash-exiting', 'ready');
    exitTimer = setTimeout(finish, transitionMs(screen) + 120);
  }
  function onReady() {
    // An arbitrary "settled" event, iframe load or user click is not sufficient.
    if (root.dataset.rwaAppReady !== 'true' || failed || finished) return;
    ready = true;renderPhase('ready');
    if (retry) retry.hidden = true;
    if (mounted) exit();
  }
  function onSettled() {
    if (root.dataset.rwaAppReady === 'true') onReady();
    else if (root.dataset.rwaStartupError) fail(root.dataset.rwaStartupError);
  }
  function onScriptError(event) {
    const script = event.target;
    if (script?.tagName === 'SCRIPT' && /(^|\/)bootstrap\.js(?:[?#]|$)/.test(script.getAttribute('src') || ''))
      fail('Initialization failed: the application script could not be loaded. Check the deployment and reload this page.');
  }
  function mount() {
    if (mounted || finished) return;
    screen = document.getElementById('rwa-loading-screen');title = document.getElementById('rwa-loading-title');
    message = document.getElementById('rwa-loading-message');errorBox = document.getElementById('rwa-loading-error');
    retry = document.getElementById('rwa-loading-retry');
    if (!screen) {root.classList.remove(ACTIVE, EXITING);return;}
    mounted = true;startedAt = performance.now();
    const configured = Number(screen.dataset.minimumMs);
    minimumMs = Number.isFinite(configured) && configured >= 0 && configured <= 60000 ? configured : 5000;
    root.dataset.rwaLoadingState = 'waiting';syncTitle();
    const heading = document.querySelector('body > header h1');
    if (heading) {titleObserver = new MutationObserver(syncTitle);titleObserver.observe(heading, {childList:true,subtree:true,characterData:true});}
    // Only the chat is inert; the sign-in panel is a sibling of the main screen,
    // inside this overlay and remains accessible to pointer AND keyboard input.
    for (const element of document.querySelectorAll('body > header, body > main, body > footer')) {
      savedAttributes.push({element,attributes:{inert:element.getAttribute('inert'),'aria-hidden':element.getAttribute('aria-hidden')}});
      element.setAttribute('inert','');element.setAttribute('aria-hidden','true');
    }
    if (retry) retry.onclick = () => window.location.reload();
    emit('rwa:splash-shown','mounted');
    if (root.dataset.rwaStartupError) {failed = false;fail(root.dataset.rwaStartupError);return;}
    renderPhase(root.dataset.rwaStartupPhase);
    // Unlike the old 45-second watchdog, this NEVER removes the login surface.
    // API/view startup have their own time budgets; here we only offer a reload.
    watchdogTimer = setTimeout(() => {
      if (ready || failed || finished) return;
      if (message) message.textContent = 'Still waiting for Tableau or application startup. Complete sign-in below when prompted. If the panel is blocked or blank, check the existing SSO/embedding policy.';
      if (retry) retry.hidden = false;
    }, Math.max(45000, minimumMs + 5000));
    if (root.dataset.rwaAppReady === 'true') onReady();
  }
  document.addEventListener('rwa:startup-progress', onProgress);
  document.addEventListener('rwa:startup-ready', onReady);
  document.addEventListener('rwa:startup-failed', onFailure);
  document.addEventListener('rwa:initialization-settled', onSettled);
  window.addEventListener('error', onScriptError, true);
  function onDocumentReady() {
    if (document.readyState !== 'loading') {document.removeEventListener('readystatechange',onDocumentReady);mount();}
  }
  if (document.readyState === 'loading') document.addEventListener('readystatechange',onDocumentReady);
  else mount();
})();
