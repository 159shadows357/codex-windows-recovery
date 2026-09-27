import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAppshotTransaction, rendererAppshot, recoverAppshot, retryAppshotAfterStartup } from './appshot-recovery.mjs';

const runFile = promisify(execFile);
const MAIN_SURFACE = 'app://-/index.html';

export function selectTarget(targets, port) {
  const pages = targets.filter(target => target.type === 'page' && target.url === MAIN_SURFACE);
  if (pages.length !== 1) throw new Error('Refused: exact main renderer is absent or ambiguous.');
  const target = pages[0];
  const url = new URL(target.webSocketDebuggerUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.port !== String(port) ||
      url.username || url.password || url.search || url.hash || !/^[\w-]+$/.test(target.id) ||
      url.pathname !== `/devtools/page/${target.id}`) throw new Error('Refused: unsafe CDP endpoint.');
  return target;
}

export function isRecoverable(state) {
  return state.surface === MAIN_SURFACE && state.bridge === true && state.composerVisible === false &&
    state.gateFound === true && state.gatewayStatus === 'loading' && state.accountStatus === 'allowed' &&
    state.contextStatus === 'success' && state.workspaceStatus === 'success' &&
    state.authenticated === true && state.authLoading === false && state.localVersionMissing === true;
}

async function within(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Recovery timeout.')), Math.max(1, milliseconds));
    })]);
  } finally { clearTimeout(timer); }
}

export async function recover(transport, { timeoutMs = 30000, startupWaitMs = 0 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const startupDeadline = Math.min(deadline, Date.now() + startupWaitMs);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (Date.now() >= deadline) throw new Error('Recovery timeout.');
    let state = await within(transport.inspect(), deadline - Date.now());
    while (attempt === 0 && state.surface === MAIN_SURFACE && !state.composerVisible &&
      !isRecoverable(state) && Date.now() < startupDeadline) {
      await new Promise(resolve => setTimeout(resolve, Math.min(250, startupDeadline - Date.now())));
      if (Date.now() >= deadline) throw new Error('Recovery timeout.');
      state = await within(transport.inspect(), deadline - Date.now());
    }
    if (state.surface === MAIN_SURFACE && state.composerVisible) return { status: attempt === 0 ? 'healthy' : 'unverified', attempts: attempt };
    if (!isRecoverable(state)) return { status: 'unsupported', attempts: attempt };
    if (Date.now() >= deadline) throw new Error('Recovery timeout.');
    const result = await within(transport.replay(Math.min(8000, deadline - Date.now())), deadline - Date.now());
    if (result.receivedLocalInitialization === true && typeof result.version === 'string' && result.version.length > 0 && result.composerVisible === true) {
      return { status: 'recovered', attempts: attempt + 1, version: result.version };
    }
  }
  return { status: 'unresolved', attempts: 2 };
}

// Executed in the renderer. Return only booleans/statuses, never chat/account data.
export async function inspectRenderer() {
  const visible = element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  };
  const state = {
    surface: location.href, bridge: typeof window.electronBridge?.sendMessageFromView === 'function',
    composerVisible: [...document.querySelectorAll('[contenteditable="true"],textarea')].some(visible),
    gateFound: false,
  };
  if (state.surface !== 'app://-/index.html' || state.composerVisible) return state;
  const root = document.getElementById('root');
  const key = root && Object.keys(root).find(name => name.startsWith('__reactContainer$'));
  const container = key && root[key];
  const current = container?.stateNode?.current ?? container?.current;
  if (!current) return state;
  const queue = [current];
  let gate;
  for (let visited = 0; queue.length && visited < 10000; visited++) {
    const fiber = queue.pop();
    if ((fiber.type?.name ?? fiber.elementType?.name) === 'Jui') {
      if (gate) return state;
      gate = fiber;
    }
    if (fiber.child) queue.push(fiber.child);
    if (fiber.sibling) queue.push(fiber.sibling);
  }
  if (!gate) return state;
  const hooks = [];
  for (let hook = gate.memoizedState; hook && hooks.length < 100; hook = hook.next) hooks.push(hook.memoizedState);
  state.gateFound = true;
  state.gatewayStatus = typeof hooks[9] === 'string' ? hooks[9] : undefined;
  state.accountStatus = hooks[13]?.status;
  state.contextStatus = hooks[17]?.status;
  state.workspaceStatus = Array.isArray(hooks[45]?.roots) ? hooks[42]?.status : undefined;
  const shared = await import('app://-/assets/app-shared-c568b0b98683.js');
  const scope = hooks[0]?.current;
  if (!scope || scope.scope !== shared.tSt || !scope.node || typeof scope.get !== 'function') return state;
  state.localVersionMissing = scope.get(shared.yit, 'local') == null;
  const auth = scope.get(shared.opt);
  state.authLoading = auth?.authLoading;
  state.authenticated = Boolean(auth && (auth.authMethod != null || auth.requiresAuth === false) &&
    (auth.authMethod !== 'chatgpt' || auth.hasChatGptToken !== false));
  return state;
}

export async function rendererReplay(timeoutMs, inspect, allowed, outerDeadline = Date.now() + timeoutMs) {
  const deadline = Math.min(Date.now() + timeoutMs, outerDeadline);
  const noReplay = { receivedLocalInitialization: false, composerVisible: false };
  if (Date.now() >= deadline) return noReplay;
  async function bounded(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Renderer recovery timeout.')), Math.max(1, deadline - Date.now()));
      })]);
    } finally { clearTimeout(timer); }
  }
  if (typeof inspect !== 'function' || typeof allowed !== 'function') throw new Error('Renderer preflight functions are required.');
  let preflightTimer;
  let preflight;
  try {
    preflight = await Promise.race([inspect(), new Promise(resolve => {
      preflightTimer = setTimeout(() => resolve(null), Math.max(1, deadline - Date.now()));
    })]);
  } finally { clearTimeout(preflightTimer); }
  if (!preflight || Date.now() >= deadline || !allowed(preflight)) return noReplay;
  const shared = await bounded(import('app://-/assets/app-shared-c568b0b98683.js'));
  if (Date.now() >= deadline || typeof shared.K1t?.subscribe !== 'function') return noReplay;
  let version = null;
  const unsubscribe = shared.K1t.subscribe('codex-app-server-initialized', event => {
    if (event.hostId === 'local' && typeof event.appServerVersion === 'string' && /^[0-9][0-9A-Za-z.+-]{0,79}$/.test(event.appServerVersion)) version = event.appServerVersion;
  });
  const cleanupTimer = setTimeout(unsubscribe, Math.max(1, deadline - Date.now()));
  try {
    if (Date.now() >= deadline) return noReplay;
    // Send through the existing bridge; no version, auth, feature or readiness writes.
    await bounded(window.electronBridge.sendMessageFromView({ type: 'ready', initializationOnly: true }));
    do {
      if (Date.now() >= deadline) return { receivedLocalInitialization: Boolean(version), version, composerVisible: false };
      const state = await bounded(inspect());
      if (version && state.composerVisible) return { receivedLocalInitialization: true, version, composerVisible: true };
      await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    return { receivedLocalInitialization: Boolean(version), version, composerVisible: false };
  } finally { clearTimeout(cleanupTimer); unsubscribe(); }
}

async function connect(url, timeoutMs) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    message.error ? request.reject(new Error('CDP request failed.')) : request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('CDP connection closed.')); }
    pending.clear();
  });
  try {
    await within(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP connection failed.')), { once: true });
    }), timeoutMs);
  } catch (error) { socket.close(); throw error; }
  return {
    evaluate(expression, milliseconds) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP evaluation timeout.')); }, milliseconds);
        pending.set(id, { timer, reject, resolve: result => {
          result.exceptionDetails ? reject(new Error('Renderer inspection failed; unsupported build/state.')) : resolve(result.result?.value);
        } });
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
      });
    },
    close() { socket.close(); },
  };
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  if ((args.length !== 6 && !(args.length === 7 && args[6] === '--startup')) || args[0] !== '--port' || args[2] !== '--pid' || args[4] !== '--timeout-ms') throw new Error('Run recover-codex.ps1; invalid helper arguments.');
  const startup = args[6] === '--startup';
  const port = Number(args[1]), processId = Number(args[3]), timeoutMs = Number(args[5]);
  if (![port, processId, timeoutMs].every(Number.isInteger) || port < 1024 || port > 65535 || processId < 1 || timeoutMs < 1000 || timeoutMs > 240000) throw new Error('Invalid diagnostic bounds.');
  if (process.versions.node.split('.')[0] !== '24') throw new Error('Node.js 24 required.');
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const milliseconds = deadline - Date.now();
    if (milliseconds <= 0) throw new Error('Recovery timeout.');
    return milliseconds;
  };
  const verify = async () => {
    const script = fileURLToPath(new URL('./recover-codex.ps1', import.meta.url));
    try {
      const { stdout } = await runFile('pwsh', ['-NoLogo', '-NoProfile', '-File', script, '-Mode', 'CheckEndpoint', '-Port', String(port), '-ExpectedProcessId', String(processId)], { timeout: remaining(), windowsHide: true, maxBuffer: 8192 });
      const endpoint = JSON.parse(stdout.trim());
      if (endpoint.ProcessId !== processId || endpoint.Port !== port || endpoint.Version !== '26.924.2738.0') throw new Error();
    } catch { throw new Error('Refused: installed package/process/loopback ownership could not be verified.'); }
  };
  await verify();
  let target;
  const discoveryDeadline = Math.min(deadline, Date.now() + (startup ? 10000 : 0));
  do {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { redirect: 'error', signal: AbortSignal.timeout(Math.min(5000, remaining())) });
    if (!response.ok) throw new Error('CDP target discovery failed.');
    const targets = await response.json();
    if (targets.some(entry => entry.type === 'page' && entry.url === MAIN_SURFACE) || Date.now() >= discoveryDeadline) {
      target = selectTarget(targets, port);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  if (!target) throw new Error('Main renderer startup timeout.');
  await verify();
  const client = await connect(target.webSocketDebuggerUrl, Math.min(5000, remaining()));
  try {
    const inspector = inspectRenderer.toString();
    const predicate = isRecoverable.toString().replaceAll('MAIN_SURFACE', JSON.stringify(MAIN_SURFACE));
    const result = await recover({
      inspect: () => client.evaluate(`(${inspector})()`, remaining()),
      replay: milliseconds => client.evaluate(`(${rendererReplay.toString()})(${milliseconds},(${inspector}),(${predicate}),${deadline})`, remaining()),
    }, { timeoutMs: remaining(), startupWaitMs: startup ? 12000 : 0 });
    if (result.status === 'healthy' || result.status === 'recovered') {
      const appshotTransport = {
        renderer: (action, id, transactionDeadline) => client.evaluate(`(${rendererAppshot.toString()})(${JSON.stringify(action)},${JSON.stringify(id)},${transactionDeadline},(${createAppshotTransaction.toString()}))`, action === 'finish' ? 3000 : remaining()),
        helper: async (mode, original) => {
          const helperScript = fileURLToPath(new URL('./appshot-helper.ps1', import.meta.url));
          const helperArgs = ['-NoLogo', '-NoProfile', '-File', helperScript, '-Mode', mode, '-MainProcessId', String(processId), '-Port', String(port)];
          if (original) helperArgs.push('-HelperProcessId', String(original.ProcessId), '-HelperCreatedAt', original.CreatedAt);
          try {
            const { stdout } = await runFile('pwsh', helperArgs, { timeout: Math.min(12000, remaining()), windowsHide: true, maxBuffer: 8192 });
            return JSON.parse(stdout.trim());
          } catch (error) {
            const failure = new Error('Appshot helper identity or exit check failed.');
            failure.helperFailureKind = error.killed === true || error.code === 'ETIMEDOUT' ? 'timeout' : 'process-check-failed';
            throw failure;
          }
        },
      };
      result.appshot = await recoverAppshot(appshotTransport, { deadline });
      result.appshot = await retryAppshotAfterStartup(result.appshot, {
        startup, startedAt, deadline, verify,
        retry: () => recoverAppshot(appshotTransport, { deadline }),
        progress: message => console.log(message),
      });
    }
    console.log(JSON.stringify(result));
    return (result.status === 'healthy' || result.status === 'recovered') && ['active', 'recovered'].includes(result.appshot?.status) ? 0 : 2;
  } finally { client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => process.exit(code), error => { console.error(error.message); process.exit(1); });
}
