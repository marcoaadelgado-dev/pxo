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

  global.Store = { load, save, exportFile, importText, reset, get state() { return state; } };
})(window);
