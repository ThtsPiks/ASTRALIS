import { saveSlotKey } from '../game/career.js?v=omega14';

function nativeUrl(slot) {
  return `/__save/${slot | 0}`;
}

function nativePost(msg) {
  try { window.webkit?.messageHandlers?.astralis?.postMessage(msg); } catch { /* mac */ }
  try { window.chrome?.webview?.postMessage(msg); } catch { /* WebView2 */ }
  try { window.external?.sendMessage?.(msg); } catch { /* Photino */ }
}

export async function pullNativeSaves() {
  for (let i = 0; i < 3; i++) {
    let local = null;
    try { local = localStorage.getItem(saveSlotKey(i)); } catch { /* quota / private */ }
    try {
      const r = await fetch(nativeUrl(i), { cache: 'no-store' });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text.length < 8) continue;
      const disk = JSON.parse(text);
      const loc = local ? JSON.parse(local) : null;
      if (!loc || (disk.ts || 0) >= (loc.ts || 0)) {
        try { localStorage.setItem(saveSlotKey(i), text); } catch { /* ignore */ }
      }
    } catch { /* static server has no /__save */ }
  }
}

export function pushNativeSave(slot, json) {
  const n = slot | 0;
  const body = json;
  const send = () => {
    nativePost(`career:put:${n}:${body}`);
    try {
      fetch(nativeUrl(n), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch { /* ignore */ }
  };
  try { queueMicrotask(send); } catch { send(); }
}

export function wipeNativeSaves() {
  for (let i = 0; i < 3; i++) {
    nativePost(`career:del:${i}`);
    try { fetch(nativeUrl(i), { method: 'DELETE', keepalive: true }).catch(() => {}); } catch { /* ignore */ }
  }
}
