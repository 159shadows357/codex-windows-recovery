import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const subject = await import('../scripts/recover-renderer.mjs').catch(() => ({}));
const stalled = () => ({
  surface: 'app://-/index.html', bridge: true, composerVisible: false,
  gateFound: true, gatewayStatus: 'loading', accountStatus: 'allowed',
  contextStatus: 'success', workspaceStatus: 'success',
  authenticated: true, authLoading: false, localVersionMissing: true,
});

test('only the exact main renderer and loopback page endpoint are accepted', () => {
  assert.equal(typeof subject.selectTarget, 'function', 'safe target selection is implemented');
  const page = { id: 'abc', type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9337/devtools/page/abc' };
  assert.equal(subject.selectTarget([page], 9337), page);
  for (const changed of [
    { url: 'https://example.com/' }, { type: 'webview' },
    { webSocketDebuggerUrl: 'ws://192.168.1.1:9337/devtools/page/abc' },
    { webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/abc' },
    { webSocketDebuggerUrl: 'ws://user@127.0.0.1:9337/devtools/page/abc' },
    { webSocketDebuggerUrl: 'ws://127.0.0.1:9337/devtools/page/other' },
  ]) assert.throws(() => subject.selectTarget([{ ...page, ...changed }], 9337));
  assert.throws(() => subject.selectTarget([page, page], 9337));
});

test('recovery gate refuses every unsupported or partially initialized state', () => {
  assert.equal(typeof subject.isRecoverable, 'function');
  assert.equal(subject.isRecoverable(stalled()), true);
  for (const changed of [
    { surface: 'app://-/overlay.html' }, { bridge: false }, { composerVisible: true },
    { gateFound: false }, { gatewayStatus: 'ready' }, { accountStatus: 'loading' },
    { contextStatus: 'pending' }, { workspaceStatus: 'error' },
    { authenticated: false }, { authLoading: true }, { localVersionMissing: false },
  ]) assert.equal(subject.isRecoverable({ ...stalled(), ...changed }), false);
});

test('healthy and unsupported surfaces never receive initialization replay', async () => {
  assert.equal(typeof subject.recover, 'function');
  for (const [snapshot, expected] of [
    [{ ...stalled(), composerVisible: true }, 'healthy'],
    [{ ...stalled(), localVersionMissing: false }, 'unsupported'],
  ]) {
    let replays = 0;
    const result = await subject.recover({ inspect: async () => snapshot, replay: async () => { replays++; } }, { timeoutMs: 25 });
    assert.equal(result.status, expected);
    assert.equal(replays, 0);
  }
});

test('confirmed missing initialization recovers only with authentic local version and composer', async () => {
  assert.equal(typeof subject.recover, 'function');
  let replays = 0;
  const result = await subject.recover({
    inspect: async () => stalled(),
    replay: async () => { replays++; return { receivedLocalInitialization: true, version: '0.158.0-alpha.2.1', composerVisible: true }; },
  }, { timeoutMs: 50 });
  assert.equal(result.status, 'recovered');
  assert.equal(result.version, '0.158.0-alpha.2.1');
  assert.equal(replays, 1);
});

test('replays are bounded and stop if loading gate changes', async () => {
  assert.equal(typeof subject.recover, 'function');
  let replays = 0;
  const transport = {
    inspect: async () => replays === 0 ? stalled() : { ...stalled(), accountStatus: 'loading' },
    replay: async () => { replays++; return { receivedLocalInitialization: false, composerVisible: false }; },
  };
  assert.equal((await subject.recover(transport, { timeoutMs: 50 })).status, 'unsupported');
  assert.equal(replays, 1);
  replays = 0;
  transport.inspect = async () => stalled();
  assert.equal((await subject.recover(transport, { timeoutMs: 50 })).status, 'unresolved');
  assert.equal(replays, 2);
});

test('composer after replay without a verified local initialization is not reported as recovery success', async () => {
  let replayed = false;
  const result = await subject.recover({
    inspect: async () => ({ ...stalled(), composerVisible: replayed }),
    replay: async () => { replayed = true; return { receivedLocalInitialization: false, composerVisible: true }; },
  }, { timeoutMs: 100 });
  assert.equal(result.status, 'unverified');
  assert.equal(result.attempts, 1);
});

test('a stuck CDP operation returns within the recovery timeout', async () => {
  assert.equal(typeof subject.recover, 'function');
  const started = Date.now();
  await assert.rejects(subject.recover({ inspect: () => new Promise(() => {}) }, { timeoutMs: 30 }), /timeout/i);
  assert.ok(Date.now() - started < 1000);
});

test('late inspection cannot replay after the caller has timed out', async () => {
  let replays = 0;
  await assert.rejects(subject.recover({
    inspect: async () => { await new Promise(resolve => setTimeout(resolve, 60)); return stalled(); },
    replay: async () => { replays++; },
  }, { timeoutMs: 15 }), /timeout/i);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(replays, 0);
});

test('renderer preflight stops at its own deadline before loading the bridge dispatcher', async () => {
  assert.equal(typeof subject.rendererReplay, 'function');
  const started = Date.now();
  const result = await subject.rendererReplay(15,
    async function () { await new Promise(resolve => setTimeout(resolve, 80)); return {}; },
    function () { return true; });
  assert.equal(result.receivedLocalInitialization, false);
  assert.ok(Date.now() - started < 70);
});

test('cold startup waits without replay until the missing-initialization gate is confirmed', async () => {
  const states = [{ ...stalled(), gateFound: false }, { ...stalled(), contextStatus: 'pending' }, stalled()];
  let reads = 0, replays = 0;
  const result = await subject.recover({
    inspect: async () => states[Math.min(reads++, 2)],
    replay: async () => { replays++; return { receivedLocalInitialization: true, version: '0.158.0-alpha.2.1', composerVisible: true }; },
  }, { timeoutMs: 1500, startupWaitMs: 1000 });
  assert.equal(result.status, 'recovered');
  assert.equal(reads, 3);
  assert.equal(replays, 1);
});

test('an evaluation queued past the outer deadline never inspects or replays', async () => {
  const result = await subject.rendererReplay(1000, function () { throw new Error('must not inspect'); }, function () { return true; }, Date.now() - 1);
  assert.equal(result.receivedLocalInitialization, false);
});

test('renderer preflight works when nested string code generation is forbidden', async () => {
  const context = vm.createContext({ setTimeout, clearTimeout }, { codeGeneration: { strings: false, wasm: false } });
  const replay = vm.runInContext(`(${subject.rendererReplay.toString()})`, context);
  const result = await replay(100, async () => ({ state: 'unsupported' }), () => false);
  assert.equal(result.receivedLocalInitialization, false);
});
