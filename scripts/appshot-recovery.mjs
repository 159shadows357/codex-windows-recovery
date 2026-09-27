// This transaction lives only in the renderer. No feature payload leaves it.
export function createAppshotTransaction({ state, capture, send, cleanup, deadline, identity = () => '' }) {
  if (Date.now() >= deadline) return { status: 'cancelled' };
  if (state.supported === true && state.isActive === true && state.configuredHotkey === 'DoubleAlt') return { status: 'active' };
  if (state.supported !== false || state.isActive !== false || state.configuredHotkey !== 'DoubleAlt') return { status: 'skipped' };
  function validate(snapshot) {
    if (!snapshot || Object.keys(snapshot).length !== 50 || snapshot.type !== 'electron-desktop-features-changed' ||
      typeof snapshot.appshotsEnabled !== 'boolean' || !snapshot.bundledPluginEligibilityReasons) throw new Error('Unsupported feature snapshot.');
    return snapshot;
  }
  let original = structuredClone(validate(capture()));
  if (original.appshotsEnabled !== true) return { status: 'skipped' };
  let authIdentity = identity();
  let disabled = false, restored = false, cancelled = false, finished = false, concurrentChange = false, verifiedFeatures = true;
  let restoring;
  let restorationAttempts = 0;
  let changedFeatureFields = [];
  const changes = fresh => Object.keys(original).filter(key => JSON.stringify(original[key]) !== JSON.stringify(fresh[key]));
  const summary = () => ({ restored, cancelled, concurrentChange, verifiedFeatures, changedFeatureFields, transactionCleared: finished });
  async function sendBounded(payload) {
    let timer;
    try {
      await Promise.race([send(payload), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Appshot bridge timeout.')), 1500); })]);
    } finally { clearTimeout(timer); }
  }
  async function restore() {
    if (restoring) return restoring;
    if (!disabled || finished) return summary();
    if (restorationAttempts >= 2) throw new Error('Appshot restoration failed after two attempts.');
    restorationAttempts++;
    restoring = (async () => {
      let fresh;
      try {
        fresh = structuredClone(validate(capture()));
        changedFeatureFields = changes(fresh);
        concurrentChange ||= changedFeatureFields.length > 0;
        verifiedFeatures &&= !concurrentChange;
      } catch {
        // If the producer disappeared, compensate with the last authentic payload.
        fresh = original;
        verifiedFeatures = false;
      }
      try { concurrentChange ||= identity() !== authIdentity; } catch { concurrentChange = true; }
      verifiedFeatures &&= !concurrentChange;
      await sendBounded(fresh);
      restored = true;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => finish().catch(() => {}), 20000);
      return summary();
    })();
    try { return await restoring; } catch (error) { restoring = undefined; throw error; }
  }
  async function finish() {
    if (finished) return summary();
    try {
      try { await restore(); } catch { await restore(); }
      if (original) {
        try {
          const fresh = validate(capture());
          changedFeatureFields = changes(fresh);
          concurrentChange ||= changedFeatureFields.length > 0 || identity() !== authIdentity;
          verifiedFeatures &&= !concurrentChange;
        } catch { verifiedFeatures = false; }
      }
    } finally {
      finished = true;
      clearTimeout(watchdog);
      original = null;
      authIdentity = null;
      cleanup();
    }
    return summary();
  }
  let watchdog = setTimeout(() => {
    cancelled = true;
    finish().catch(() => {});
  }, Math.max(1, deadline - Date.now()));
  return {
    status: 'prepared',
    async disable() {
      if (finished || cancelled || restoring || Date.now() >= deadline) throw new Error('Appshot transaction cancelled or deadline passed.');
      const fresh = validate(capture());
      if (changes(fresh).length || identity() !== authIdentity) throw new Error('Authentic features or account changed before retry.');
      if (Date.now() >= deadline) throw new Error('Appshot transaction deadline passed.');
      disabled = true;
      await sendBounded({ ...fresh, appshotsEnabled: false });
      return { disabled: true };
    },
    restore,
    finish,
  };
}

// Empirical workaround for this incident, not a proven native warmup threshold.
export async function retryAppshotAfterStartup(first, {
  startup, startedAt, deadline, verify, retry, progress,
  now = Date.now, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
}) {
  const readOnlyFailure = first.stage === 'initial-helper' || first.stage === 'old-helper';
  const cleanRestoration = first.restored === true && first.verifiedFeatures === true && first.transactionCleared === true &&
    Array.isArray(first.changedFeatureFields) && first.changedFeatureFields.length === 0;
  if (!startup || first.status !== 'unverified' || first.concurrentChange === true || first.cancelled === true ||
    (!readOnlyFailure && !cleanRestoration)) return first;
  const retryAt = startedAt + 120000;
  if (deadline - Math.max(now(), retryAt) < 20000) return { ...first, delayedStartupRetry: false, delayedRetryReason: 'insufficient-time' };
  progress('Appshot is not verified. Waiting until launcher age 120 seconds for one final bounded retry.');
  while (now() < retryAt) {
    if (now() >= deadline) return { ...first, delayedStartupRetry: false, delayedRetryReason: 'deadline' };
    await sleep(Math.min(1000, retryAt - now(), deadline - now()));
  }
  try {
    if (now() >= deadline) throw new Error();
    await verify();
    if (now() >= deadline) throw new Error();
  } catch { return { ...first, delayedStartupRetry: false, delayedRetryReason: 'process-verification-failed' }; }
  try { return { ...await retry(), delayedStartupRetry: true }; }
  catch { return { status: 'unverified', restored: false, delayedStartupRetry: true, reason: 'delayed-retry-failed-or-unconfirmed' }; }
}

export async function recoverAppshot(transport, { deadline, stabilityMs = 7000 } = {}) {
  const id = crypto.randomUUID();
  let prepared = false;
  let stage = 'initial-state';
  let result = { status: 'unverified', restored: false };
  const remaining = () => {
    if (Date.now() >= deadline) throw new Error('Appshot recovery timeout.');
    return deadline - Date.now();
  };
  const call = (action, transactionDeadline = deadline) => {
    remaining();
    return transport.renderer(action, id, transactionDeadline);
  };
  const active = state => state.supported === true && state.isActive === true && state.configuredHotkey === 'DoubleAlt';
  const failed = state => state.supported === false && state.isActive === false && state.configuredHotkey === 'DoubleAlt';
  async function stable() {
    const end = Date.now() + stabilityMs;
    do {
      if (!active(await call('inspect'))) return false;
      if (Date.now() >= end) return true;
      await new Promise(resolve => setTimeout(resolve, Math.min(200, end - Date.now())));
    } while (remaining() > 0);
    return false;
  }
  try {
    let state = await call('inspect');
    const pendingUntil = Math.min(deadline, Date.now() + 8000);
    while (!active(state) && !failed(state) && state.configuredHotkey === 'DoubleAlt' && Date.now() < pendingUntil) {
      await new Promise(resolve => setTimeout(resolve, 200));
      state = await call('inspect');
    }
    if (active(state)) {
      stage = 'initial-helper';
      remaining();
      const before = await transport.helper('Inspect');
      stage = 'initial-stability';
      if (await stable()) {
        stage = 'initial-helper-confirmation';
        remaining();
        const after = await transport.helper('Inspect');
        return { status: before.ProcessId === after.ProcessId && before.CreatedAt === after.CreatedAt ? 'active' : 'unverified', changedFeatureFields: [], stableObservationMs: stabilityMs, transactionCleared: true };
      }
      state = await call('inspect');
    }
    if (!failed(state)) return { status: 'skipped', reason: 'state-not-eligible' };
    if (remaining() < 20000) return { status: 'unverified', reason: 'insufficient-time-for-safe-retry' };
    stage = 'old-helper';
    const oldHelper = await transport.helper('Inspect');
    const transactionDeadline = Math.min(deadline - 2000, Date.now() + 30000);
    stage = 'begin';
    const begin = await call('begin', transactionDeadline);
    if (begin.status !== 'prepared') return { status: begin.status, reason: 'features-not-eligible' };
    prepared = true;
    stage = 'disable';
    await call('disable', transactionDeadline);
    stage = 'wait-exit';
    remaining();
    const exited = await transport.helper('WaitExit', oldHelper);
    if (exited.exited !== true) throw new Error('Original helper exit was not verified.');
    stage = 'restore';
    const restoration = await call('restore');
    if (restoration.restored !== true || restoration.cancelled || restoration.concurrentChange || !restoration.verifiedFeatures) throw new Error('Feature restoration not verified.');
    remaining();
    stage = 'new-helper';
    const newHelper = await transport.helper('Inspect');
    stage = 'stable-state';
    const stableState = await stable();
    remaining();
    stage = 'final-helper';
    const finalHelper = await transport.helper('Inspect');
    stage = 'finish';
    const details = await call('finish');
    prepared = false;
    const helperChanged = newHelper.ProcessId !== oldHelper.ProcessId || newHelper.CreatedAt !== oldHelper.CreatedAt;
    const helperStable = newHelper.ProcessId === finalHelper.ProcessId && newHelper.CreatedAt === finalHelper.CreatedAt;
    result = { status: stableState && helperChanged && helperStable && details.restored && details.verifiedFeatures && !details.cancelled && !details.concurrentChange ? 'recovered' : 'unverified', ...details, oldHelperExited: true, newHelperVerified: helperChanged && helperStable, stableObservationMs: stabilityMs };
  } catch (error) {
    result = { status: 'unverified', reason: 'appshot-check-or-retry-failed', stage };
    if (['timeout', 'process-check-failed'].includes(error?.helperFailureKind)) result.helperFailureKind = error.helperFailureKind;
  } finally {
    if (prepared) {
      try {
        // Compensating restore is allowed after the operation deadline.
        Object.assign(result, await transport.renderer('finish', id, deadline));
      } catch { result.restored = false; result.reason = 'feature-restoration-failed-or-unconfirmed'; }
    }
  }
  return result;
}

// Evaluated over the already-verified CDP connection. Only metadata is returned.
export async function rendererAppshot(action, transactionId, deadline, factory) {
  if (location.href !== 'app://-/index.html') throw new Error('Wrong Appshot surface.');
  const key = '__codexRecoveryAppshotTransaction';
  if (action !== 'finish' && action !== 'restore' && Date.now() >= deadline) return { status: 'cancelled' };
  if (['disable', 'restore', 'finish'].includes(action)) {
    const entry = window[key];
    if (!entry || entry.id !== transactionId) return { status: 'cancelled', restored: false };
    return entry.transaction[action]();
  }
  const shared = await import('app://-/assets/app-shared-c568b0b98683.js');
  const rawState = await shared.nC.appshot.getState();
  const state = { supported: rawState.supported, isActive: rawState.isActive, configuredHotkey: rawState.configuredHotkey === 'DoubleAlt' ? 'DoubleAlt' : rawState.configuredHotkey == null ? null : 'other' };
  if (action === 'inspect') return state;
  if (action !== 'begin' || Date.now() >= deadline) return { status: 'cancelled' };
  if (window[key]) throw new Error('Appshot recovery is already running.');
  function producer() {
    const root = document.getElementById('root');
    const reactKey = root && Object.keys(root).find(name => name.startsWith('__reactContainer$'));
    const container = reactKey && root[reactKey];
    const stack = [container?.stateNode?.current ?? container?.current], found = [], seen = new Set();
    while (stack.length && seen.size < 10000) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      if (fiber.type?.name === 'j2a') found.push(fiber);
      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
    if (found.length !== 1) throw new Error('Feature producer is not unique.');
    return found[0];
  }
  function capture() {
    const effects = [];
    for (let hook = producer().memoizedState, count = 0; hook && count < 1500; hook = hook.next, count++) {
      const effect = hook.memoizedState?.create;
      if (typeof effect === 'function' && effect.toString().includes('electron-desktop-features-changed')) effects.push(effect);
    }
    if (effects.length !== 1) throw new Error('Feature effect is not unique.');
    const prior = shared.K1t.dispatchMessage, snapshots = [];
    try {
      shared.K1t.dispatchMessage = function (type, payload) {
        if (type === 'electron-desktop-features-changed') { snapshots.push(structuredClone({ ...payload, type })); return; }
        return prior.call(this, type, payload);
      };
      effects[0]();
    } finally { shared.K1t.dispatchMessage = prior; }
    if (snapshots.length !== 1) throw new Error('Feature snapshot is not unique.');
    return snapshots[0];
  }
  function identity() {
    for (let hook = producer().memoizedState, count = 0; hook && count < 1500; hook = hook.next, count++) {
      const scope = hook.memoizedState?.current;
      if (scope?.scope === shared.tSt && scope.node && typeof scope.get === 'function') {
        const auth = scope.get(shared.opt);
        if (!auth || auth.authLoading !== false) throw new Error('Account state is not ready.');
        return JSON.stringify([auth.authMethod, auth.authenticatedAccountId, auth.userId, auth.authLoading]);
      }
    }
    throw new Error('Authentic account scope is absent.');
  }
  if (typeof factory !== 'function') throw new Error('Appshot transaction function is required.');
  const transaction = factory({ state, capture, identity, deadline,
    send: payload => window.electronBridge.sendMessageFromView(payload),
    cleanup: () => { if (window[key]?.id === transactionId) delete window[key]; },
  });
  if (transaction.status === 'prepared') window[key] = { id: transactionId, transaction };
  return { status: transaction.status, fields: transaction.status === 'prepared' ? 50 : undefined };
}
