import assert from 'node:assert/strict';
import test from 'node:test';

const subject = await import('../scripts/appshot-recovery.mjs').catch(() => ({}));
const failed = { supported: false, configuredHotkey: 'DoubleAlt', isActive: false };
function snapshot(enabled = true) {
  const value = { type: 'electron-desktop-features-changed', appshotsEnabled: enabled, bundledPluginEligibilityReasons: { browser: 'fixture' } };
  for (let index = 0; index < 47; index++) value[`fixture${index}`] = index % 2 === 0;
  return value;
}
function fixture(overrides = {}) {
  const sent = [];
  let latest = snapshot();
  let cleaned = false;
  const options = { state: failed, capture: () => structuredClone(latest), send: message => { sent.push(structuredClone(message)); }, cleanup: () => { cleaned = true; }, deadline: Date.now() + 1000, ...overrides };
  return { options, sent, setLatest: value => { latest = value; }, cleaned: () => cleaned };
}

test('Appshot wrong states and false eligibility never disable features', async () => {
  assert.equal(typeof subject.createAppshotTransaction, 'function');
  for (const state of [
    { supported: true, configuredHotkey: 'DoubleAlt', isActive: true },
    { supported: false, configuredHotkey: null, isActive: false },
    { supported: false, configuredHotkey: 'Ctrl+Alt+A', isActive: false },
    { supported: true, configuredHotkey: 'DoubleAlt', isActive: false },
  ]) {
    const item = fixture({ state });
    const transaction = subject.createAppshotTransaction(item.options);
    assert.notEqual(transaction.status, 'prepared');
    assert.equal(item.sent.length, 0);
  }
  const item = fixture({ capture: () => snapshot(false) });
  assert.equal(subject.createAppshotTransaction(item.options).status, 'skipped');
  assert.equal(item.sent.length, 0);
});

test('Appshot preserves every authentic field and restores exactly after a helper failure', async () => {
  assert.equal(typeof subject.createAppshotTransaction, 'function');
  const item = fixture();
  const transaction = subject.createAppshotTransaction(item.options);
  try {
    await transaction.disable();
    throw new Error('old helper exit timeout');
  } catch {} finally { await transaction.restore(); }
  assert.equal(item.sent.length, 2);
  assert.deepEqual(item.sent[0], { ...snapshot(), appshotsEnabled: false });
  assert.deepEqual(item.sent[1], snapshot());
  const result = await transaction.finish();
  assert.equal(result.restored, true);
  assert.deepEqual(result.changedFeatureFields, []);
  assert.equal(item.cleaned(), true);
});

test('Appshot concurrent eligibility change restores freshest full snapshot and cannot claim verification', async () => {
  assert.equal(typeof subject.createAppshotTransaction, 'function');
  const item = fixture();
  const transaction = subject.createAppshotTransaction(item.options);
  await transaction.disable();
  const changed = snapshot(false);
  changed.fixture0 = false;
  item.setLatest(changed);
  await transaction.restore();
  assert.deepEqual(item.sent[1], changed);
  const result = await transaction.finish();
  assert.equal(result.concurrentChange, true);
  assert.equal(result.verifiedFeatures, false);
});

test('Appshot watchdog restores on host loss and permanently cancels any delayed disable', async () => {
  assert.equal(typeof subject.createAppshotTransaction, 'function');
  const item = fixture({ deadline: Date.now() + 35 });
  const transaction = subject.createAppshotTransaction(item.options);
  await transaction.disable();
  await new Promise(resolve => setTimeout(resolve, 75));
  await assert.rejects(transaction.disable(), /cancel|deadline|finished/i);
  assert.deepEqual(item.sent, [{ ...snapshot(), appshotsEnabled: false }, snapshot()]);
  assert.equal(item.cleaned(), true);
});

test('Appshot late preparation and changed feature snapshots refuse to disable', async () => {
  assert.equal(typeof subject.createAppshotTransaction, 'function');
  const late = fixture({ deadline: Date.now() - 1 });
  assert.equal(subject.createAppshotTransaction(late.options).status, 'cancelled');
  assert.equal(late.sent.length, 0);
  const item = fixture();
  const transaction = subject.createAppshotTransaction(item.options);
  const changed = snapshot(); changed.fixture2 = false; item.setLatest(changed);
  await assert.rejects(transaction.disable(), /changed/i);
  await transaction.finish();
  assert.equal(item.sent.length, 0);
});

test('Appshot rejects partial feature payloads before any mutation', () => {
  assert.equal(typeof subject.createAppshotTransaction, 'function');
  for (const partial of [{ appshotsEnabled: true }, { ...snapshot(), type: 'other' }]) {
    const item = fixture({ capture: () => partial });
    assert.throws(() => subject.createAppshotTransaction(item.options), /snapshot/i);
    assert.equal(item.sent.length, 0);
  }
});

test('Appshot host always finishes the renderer transaction when helper exit times out', async () => {
  assert.equal(typeof subject.recoverAppshot, 'function');
  const actions = [];
  const result = await subject.recoverAppshot({
    renderer: async action => {
      actions.push(action);
      if (action === 'inspect') return failed;
      if (action === 'begin') return { status: 'prepared' };
      if (action === 'finish') return { restored: true, verifiedFeatures: true, changedFeatureFields: [] };
      return { disabled: true };
    },
    helper: async mode => {
      if (mode === 'WaitExit') throw Object.assign(new Error('helper exit timed out'), { helperFailureKind: 'timeout' });
      return { ProcessId: 123, CreatedAt: 'fixture' };
    },
  }, { deadline: Date.now() + 30000 });
  assert.equal(result.status, 'unverified');
  assert.equal(result.stage, 'wait-exit');
  assert.equal(result.helperFailureKind, 'timeout');
  assert.equal(result.restored, true);
  assert.equal(actions.at(-1), 'finish');
});

test('Appshot auth loading during restore never replaces fresh eligibility with the old snapshot', async () => {
  let authLoading = false;
  const item = fixture({ identity: () => { if (authLoading) throw new Error('account loading'); return 'same-account'; } });
  const transaction = subject.createAppshotTransaction(item.options);
  await transaction.disable();
  const fresh = snapshot(false); item.setLatest(fresh); authLoading = true;
  await transaction.restore();
  assert.deepEqual(item.sent[1], fresh);
  const result = await transaction.finish();
  assert.equal(result.verifiedFeatures, false);
  assert.equal(result.transactionCleared, true);
});

test('Appshot cleanup retries one rejected restoration and then clears private state', async () => {
  let restores = 0;
  const item = fixture({ send: payload => {
    if (payload.appshotsEnabled && ++restores === 1) return Promise.reject(new Error('transient bridge rejection'));
  } });
  const transaction = subject.createAppshotTransaction(item.options);
  await transaction.disable();
  await assert.rejects(transaction.restore(), /bridge/);
  const result = await transaction.finish();
  assert.equal(restores, 2);
  assert.equal(result.restored, true);
  assert.equal(result.transactionCleared, true);
});

test('startup delay never retries an initial success, RecoverOnly, or unsafe restoration', async () => {
  assert.equal(typeof subject.retryAppshotAfterStartup, 'function');
  const cleanFailure = { status: 'unverified', restored: true, verifiedFeatures: true, transactionCleared: true, changedFeatureFields: [] };
  for (const [first, startup] of [
    [{ ...cleanFailure, status: 'recovered' }, true], [cleanFailure, false],
    [{ ...cleanFailure, restored: false }, true], [{ ...cleanFailure, verifiedFeatures: false }, true],
    [{ ...cleanFailure, transactionCleared: false }, true], [{ ...cleanFailure, changedFeatureFields: ['appshotsEnabled'] }, true],
  ]) {
    const result = await subject.retryAppshotAfterStartup(first, {
      startup, startedAt: 0, deadline: 180000, now: () => 10000,
      sleep: () => { throw new Error('must not wait'); }, verify: () => { throw new Error('must not verify'); },
      retry: () => { throw new Error('must not retry'); }, progress: () => {},
    });
    assert.equal(result, first);
  }
});

test('startup waits until Node age 120 seconds, verifies the same process, and retries only once', async () => {
  assert.equal(typeof subject.retryAppshotAfterStartup, 'function');
  const cleanFailure = { status: 'unverified', restored: true, verifiedFeatures: true, transactionCleared: true, changedFeatureFields: [] };
  let time = 30000, retries = 0;
  const events = [];
  const result = await subject.retryAppshotAfterStartup(cleanFailure, {
    startup: true, startedAt: 0, deadline: 180000, now: () => time,
    sleep: async milliseconds => { assert.ok(milliseconds <= 1000); time += milliseconds; },
    verify: async () => { assert.ok(time >= 120000); events.push('verify'); },
    retry: async () => { retries++; events.push('retry'); return cleanFailure; },
    progress: () => events.push('progress'),
  });
  assert.equal(time, 120000);
  assert.equal(retries, 1);
  assert.deepEqual(events, ['progress', 'verify', 'retry']);
  assert.equal(result.status, 'unverified');
  assert.equal(result.delayedStartupRetry, true);
});

test('startup delayed retry refuses an expired budget or changed process', async () => {
  assert.equal(typeof subject.retryAppshotAfterStartup, 'function');
  const first = { status: 'unverified', restored: true, verifiedFeatures: true, transactionCleared: true, changedFeatureFields: [] };
  let retries = 0;
  const base = { startup: true, startedAt: 0, now: () => 120000, sleep: async () => {}, retry: async () => { retries++; }, progress: () => {} };
  const expired = await subject.retryAppshotAfterStartup(first, { ...base, deadline: 120000, verify: async () => {} });
  assert.equal(expired.status, 'unverified');
  const changed = await subject.retryAppshotAfterStartup(first, { ...base, deadline: 180000, verify: async () => { throw new Error('process changed'); } });
  assert.equal(changed.status, 'unverified');
  assert.equal(retries, 0);
});

test('startup retries only the two read-only helper failure stages without restoration metadata', async () => {
  for (const stage of ['initial-helper', 'old-helper', 'begin', 'disable', 'wait-exit', 'final-helper']) {
    const first = { status: 'unverified', stage, helperFailureKind: 'timeout' };
    let retries = 0;
    const result = await subject.retryAppshotAfterStartup(first, {
      startup: true, startedAt: 0, deadline: 180000, now: () => 120000, sleep: async () => {},
      verify: async () => {}, progress: () => {},
      retry: async () => { retries++; return { status: 'recovered' }; },
    });
    if (stage === 'initial-helper' || stage === 'old-helper') {
      assert.equal(retries, 1);
      assert.equal(result.status, 'recovered');
    } else {
      assert.equal(retries, 0);
      assert.equal(result, first);
    }
  }
});
