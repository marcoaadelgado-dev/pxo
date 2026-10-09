/* Gravação dos dados no telemóvel (localStorage) e cópias de segurança. */
(function (global) {
  'use strict';

  const KEY = 'pxo-torneios-v1';

  const SEED_CLUBS = [
    'Turbolentos', 'Vitória FC', 'Calheta', 'Xavelhas', 'Fontainhas', 'E. J. Inácio',
    'Campanário', 'Mourisca', 'Bacchus', 'Canicense', 'Choupana', 'Andorinha', 'C. Lobos',
    'Brunch Ville', 'Vet. P. Santo', 'S. Serra', '1º Maio', 'Santana',
  ];

  let state = null;

  function fresh() {
    return {
      version: 1,
      clubs: SEED_CLUBS.map(name => ({ id: global.Rules.uid(), name })),
      comps: [],
    };
  }

  function valid(s) {
    return s && Array.isArray(s.clubs) && Array.isArray(s.comps);
  }

  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!valid(state)) { state = fresh(); save(); }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    return state;
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pxo-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importText(text) {
    const s = JSON.parse(text);
    if (!valid(s)) throw new Error('Ficheiro não é uma cópia de segurança desta app.');
    state = s;
    save();
    return state;
  }

  function reset() {
    state = fresh();
    save();
    return state;
  }

  // ---------- link de consulta (dados dentro do próprio link, depois do #) ----------
  function snapshot(comp, clubs) {
    const used = new Set();
    comp.concs.forEach(k => global.Rules.participants(k).forEach(id => used.add(id)));
    return { v: 1, at: new Date().toISOString(), comp, clubs: clubs.filter(c => used.has(c.id)) };
  }

  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }

  function toB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64url(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }

  // 'z' = comprimido; 'j' = sem compressão (browsers antigos)
  async function encodeLink(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'undefined') return 'j' + toB64url(bytes);
    return 'z' + toB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
  }

  async function decodeLink(str) {
    let snap;
    try {
      let bytes = fromB64url(str.slice(1));
      if (str[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
      else if (str[0] !== 'j') throw new Error();
      snap = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { snap = null; }
    if (!snap || !snap.comp || !Array.isArray(snap.comp.concs) || !Array.isArray(snap.clubs)) {
      throw new Error('Link de consulta inválido ou incompleto.');
    }
    return snap;
  }

  global.Store = { load, save, exportFile, importText, reset, snapshot, encodeLink, decodeLink, get state() { return state; } };
})(window);
