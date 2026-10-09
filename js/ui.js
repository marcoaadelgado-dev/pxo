/* Ecrãs e interação. */
(function () {
  'use strict';

  const R = window.Rules, S = window.Store;
  const app = document.getElementById('app');
  const titleEl = document.getElementById('title');
  const backBtn = document.getElementById('back');

  const VKEY = 'pxo-ver'; // sessionStorage: dados do link de consulta aberto
  const isViewLink = () => location.hash.startsWith('#/ver/');
  let viewer = null; // snapshot em modo consulta (só leitura)
  // em modo consulta não se toca nos dados guardados de quem abre o link
  let state = isViewLink() || sessionStorage.getItem(VKEY) ? { clubs: [], comps: [] } : S.load();
  let current = null; // { comp, conc } do ecrã aberto
  let draft = null; // assistente de nova concentração
  const pendingDraw = {}; // ordens de sorteio ainda não confirmadas

  // ---------- utilitários ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clubName = id => { const c = state.clubs.find(c => c.id === id); return c ? c.name : '?'; };
  const getComp = id => state.comps.find(c => c.id === id);
  const sortedClubs = () => state.clubs.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  const letter = i => String.fromCharCode(65 + i);
  const opt = (value, label, sel) => `<option value="${esc(value)}" ${String(value) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;
  const save = () => { if (!viewer) S.save(); };
  const fmtAt = iso => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const clubUsed = id => state.comps.some(c => c.concs.some(k => R.participants(k).includes(id)));

  function findMatch(conc, id) {
    for (const g of conc.groups) { const m = g.matches.find(m => m.id === id); if (m) return m; }
    return [].concat(conc.ko.semis, [conc.ko.final, conc.ko.third]).find(m => m && m.id === id);
  }

  function share(text) {
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => alert('Copiado. Pode colar no WhatsApp.'));
    else prompt('Copie o texto:', text);
  }

  // ---------- render / router ----------
  function parseHash() {
    return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  }

  function render(keep) {
    const y = window.scrollY;
    const open = keep ? [...app.querySelectorAll('details[open][data-key]')].map(d => d.dataset.key) : [];
    current = null;
    let v;
    try { v = dispatch(parseHash()); } catch (e) {
      console.error(e);
      v = { title: 'Erro', back: '#/', html: `<div class="notice warn">${esc(e.message)}</div>` };
    }
    titleEl.textContent = v.title;
    document.title = v.title;
    backBtn.hidden = !v.back;
    backBtn.dataset.href = v.back || '';
    document.body.classList.toggle('ro', !!viewer);
    const bar = viewer ? `<div class="viewbar">👁 Consulta só de leitura · dados de ${esc(fmtAt(viewer.at))}
      <button class="mini ro-keep" data-act="exitViewer">Sair</button></div>` : '';
    app.innerHTML = bar + v.html;
    if (viewer) app.querySelectorAll('input, select').forEach(el => { el.disabled = true; });
    open.forEach(k => { const d = app.querySelector(`details[data-key="${k}"]`); if (d) d.open = true; });
    window.scrollTo(0, keep ? y : 0);
  }

  // volta a desenhar mantendo o foco no campo para onde o utilizador passou
  function renderKeepFocus() {
    setTimeout(() => {
      const a = document.activeElement;
      let sel = null;
      if (a && a.dataset && a.dataset.f && a.closest('.match')) sel = `.match[data-mid="${a.closest('.match').dataset.mid}"] [data-f="${a.dataset.f}"]`;
      render(true);
      if (sel) { const n = app.querySelector(sel); if (n) n.focus(); }
    }, 0);
  }

  function dispatch(p) {
    if (viewer && (!p.length || p[0] !== 'c' || p[2] === 'new' || p[2] === 'settings')) return viewComp(viewer.comp);
    if (!p.length) return viewHome();
    if (p[0] === 'clubs') return viewClubs();
    if (p[0] === 'backup') return viewBackup();
    if (p[0] === 'c') {
      const comp = getComp(p[1]);
      if (!comp) return notFound();
      if (!p[2]) return viewComp(comp);
      if (p[2] === 'settings') return viewSettings(comp);
      if (p[2] === 'table') return viewTable(comp);
      if (p[2] === 'new') return viewNewConc(comp);
      if (p[2] === 'k') {
        const conc = comp.concs.find(k => k.id === p[3]);
        if (conc) return viewConc(comp, conc, p[4] || 'g0');
      }
    }
    return notFound();
  }

  function notFound() {
    return { title: 'Não encontrado', back: '#/', html: '<p class="muted">Esta página não existe.</p>' };
  }

  // ---------- início ----------
  function viewHome() {
    let h = '<div class="list">';
    state.comps.forEach(c => {
      h += `<a class="card link" href="#/c/${c.id}"><div class="card-title">${esc(c.name)}</div>
        <div class="muted">${c.type === 'circuito' ? 'Circuito' : 'Concentração única'} · ${c.concs.length} concentração(ões)</div></a>`;
    });
    if (!state.comps.length) h += '<p class="muted">Ainda não há competições. Crie a primeira abaixo.</p>';
    h += `</div>
      <div class="card"><h3>Nova competição</h3>
        <label>Nome<input id="nc-name" placeholder="ex.: PXO +45 2026/27"></label>
        <label>Tipo<select id="nc-type">
          <option value="circuito">Circuito (várias concentrações + tabela geral)</option>
          <option value="unica">Concentração única</option>
        </select></label>
        <button class="btn primary" data-act="newComp">Criar</button>
      </div>
      <div class="row"><a class="btn" href="#/clubs">Clubes</a><a class="btn" href="#/backup">Cópia de segurança</a></div>`;
    return { title: 'PXO Torneios', html: h };
  }

  // ---------- competição ----------
  function viewComp(comp) {
    let h = `<div class="sub">${comp.type === 'circuito' ? 'Circuito' : 'Concentração única'}</div><div class="list">`;
    comp.concs.forEach(k => {
      const sum = R.summarize(k, comp.settings);
      const status = sum.fr.complete ? '✅ Terminada · 1º ' + esc(clubName(sum.fr.places[0])) : 'Em curso';
      h += `<a class="card link" href="#/c/${comp.id}/k/${k.id}"><div class="card-title">${esc(k.name)}</div>
        <div class="muted">${esc([k.date, k.place].filter(Boolean).join(' · '))}</div>
        <div class="muted">${k.groups.length} série(s) · ${R.participants(k).length} equipas · ${status}</div></a>`;
    });
    if (!comp.concs.length) h += '<p class="muted">Sem concentrações.</p>';
    h += '</div>';
    if (!viewer && (comp.type === 'circuito' || !comp.concs.length)) h += `<a class="btn primary block" href="#/c/${comp.id}/new">+ Nova concentração</a>`;
    if (comp.type === 'circuito') h += `<a class="btn block" href="#/c/${comp.id}/table">🏆 Tabela geral</a>`;
    current = { comp };
    if (viewer) return { title: comp.name, html: h };
    if (comp.concs.length) h += `<button class="btn block" data-act="shareLink">🔗 Partilhar link de consulta</button>`;
    h += `<a class="btn block" href="#/c/${comp.id}/settings">⚙️ Regras e pontuação</a>
      <button class="btn danger block" data-act="delComp">Apagar competição</button>`;
    return { title: comp.name, back: '#/', html: h };
  }

  function viewSettings(comp) {
    const s = R.withDefaults(comp.settings);
    current = { comp };
    const num = (key, label) => `<label>${label}<input type="number" inputmode="numeric" data-set="${key}" value="${s[key]}"></label>`;
    let h = `<div class="card"><h3>Competição</h3>
      <label>Nome<input data-comp="name" value="${esc(comp.name)}"></label>
      <label>Tipo<select data-comp="type">${opt('circuito', 'Circuito', comp.type)}${opt('unica', 'Concentração única', comp.type)}</select></label></div>
      <div class="card"><h3>Pontos por jogo</h3><div class="grid3">${num('win', 'Vitória')}${num('draw', 'Empate')}${num('loss', 'Derrota')}</div></div>
      <div class="card"><h3>Disciplina (pontos por cartão)</h3><div class="grid3">${num('yellow', '🟨 Amarelo')}${num('red', '🟥 Vermelho')}</div>
        <p class="muted small">Quem tem menos pontos de disciplina fica à frente.</p></div>
      <div class="card"><h3>Critérios de classificação</h3><ol class="tb"><li>Pontos</li>`;
    s.tiebreak.forEach((c, i) => {
      h += `<li><span>${esc(R.CRITERIA[c].label)}</span><span class="nowrap">
        <button class="mini" data-act="tb" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'}>▲</button>
        <button class="mini" data-act="tb" data-i="${i}" data-d="1" ${i < s.tiebreak.length - 1 ? '' : 'disabled'}>▼</button></span></li>`;
    });
    h += `<li>Sorteio</li></ol></div>`;
    if (comp.type === 'circuito') {
      h += `<div class="card"><h3>Pontos do circuito por concentração</h3>
        <label>Pontos por lugar (1º, 2º, 3º, …)<input data-set="circuitPts" value="${esc(s.circuitPts.join(', '))}"></label>
        ${num('participantPts', 'Restantes participantes')}
        <p class="muted small">Tabela geral: total = soma das concentrações; em empate, menos disciplina fica à frente.</p></div>`;
    }
    h += '<p class="muted small">As alterações aplicam-se a todas as concentrações desta competição.</p>';
    return { title: 'Regras', back: `#/c/${comp.id}`, html: h };
  }

  // ---------- nova concentração ----------
  function initDraft(comp) {
    const prev = comp.concs[comp.concs.length - 1];
    const n = prev ? prev.groups.length : 3;
    draft = {
      compId: comp.id,
      name: 'Concentração ' + (comp.concs.length + 1),
      date: new Date().toISOString().slice(0, 10),
      place: '',
      nGroups: n,
      interval: 30,
      assign: {}, // clubId -> índice da série
      order: [], // ordem em que as equipas foram escolhidas (= numeração na série)
      groupOpts: [],
      koType: prev ? prev.ko.type : 'semis',
      template: prev ? prev.ko.template : '',
      thirdMode: prev ? prev.ko.thirdMode : 'grupos',
      koDuration: prev ? prev.ko.duration : '2 x 10 min (sem intervalo)',
    };
    if (prev) prev.groups.forEach((g, i) => { draft.groupOpts[i] = { start: '', fields: '1', duration: g.duration }; });
    fixDraft();
  }

  function fixDraft() {
    while (draft.groupOpts.length < draft.nGroups) draft.groupOpts.push({ start: '', fields: '1', duration: '2 x 12,5 min (sem intervalo)' });
    Object.keys(draft.assign).forEach(id => { if (draft.assign[id] >= draft.nGroups || !state.clubs.some(c => c.id === id)) delete draft.assign[id]; });
    draft.order = draft.order.filter(id => id in draft.assign);
    if (draft.koType !== 'none' && R.validateTemplate(draftConc(), draft.template, draft.koType)) {
      const p = R.templatePresets(draft.nGroups, draft.koType)[0];
      if (p && !R.validateTemplate(draftConc(), p, draft.koType)) draft.template = p;
    }
  }

  function draftConc() {
    const groups = [];
    for (let i = 0; i < draft.nGroups; i++) {
      groups.push({ name: letter(i), teams: draft.order.filter(id => draft.assign[id] === i), matches: [] });
    }
    return { groups };
  }

  function viewNewConc(comp) {
    if (!draft || draft.compId !== comp.id) initDraft(comp);
    current = { comp };
    const d = draft, dc = draftConc();
    const prev = comp.concs[comp.concs.length - 1];
    let h = `<div class="card"><h3>Dados</h3>
      <label>Nome<input data-dr="name" value="${esc(d.name)}"></label>
      <div class="grid2"><label>Data<input type="date" data-dr="date" value="${esc(d.date)}"></label>
      <label>Local<input data-dr="place" value="${esc(d.place)}"></label></div></div>
      <div class="card"><h3>Séries</h3>
      <div class="grid2"><label>Nº de séries<select data-dr="nGroups">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => opt(n, n, d.nGroups)).join('')}</select></label>
      <label>Minutos entre jogos<input type="number" inputmode="numeric" data-dr="interval" value="${d.interval}"></label></div>`;
    dc.groups.forEach((g, i) => {
      const o = d.groupOpts[i];
      h += `<div class="gopt"><b>Série ${g.name}</b> <span class="muted">(${g.teams.length} equipas)</span>
        <div class="grid3"><label>1º jogo<input type="time" data-dg="start" data-i="${i}" value="${esc(o.start)}"></label>
        <label>Campos<input data-dg="fields" data-i="${i}" value="${esc(o.fields)}" placeholder="1 ou 1,2"></label>
        <label>Duração<input data-dg="duration" data-i="${i}" value="${esc(o.duration)}"></label></div></div>`;
    });
    h += `</div><div class="card"><h3>Equipas</h3>`;
    if (prev) h += `<button class="btn small" data-act="copyTeams">Copiar equipas da concentração anterior</button>`;
    h += '<div class="assign">';
    sortedClubs().forEach(c => {
      const v = c.id in d.assign ? d.assign[c.id] : '';
      h += `<div class="arow ${v === '' ? '' : 'on'}"><span>${esc(c.name)}</span><select data-assign="${c.id}">${opt('', '—', v)}${dc.groups.map((g, i) => opt(i, 'Série ' + g.name, v)).join('')}</select></div>`;
    });
    h += `</div><div class="addrow"><input id="dr-club" placeholder="Novo clube"><button class="btn small" data-act="draftAddClub">Adicionar</button></div></div>`;
    h += `<div class="card"><h3>Fase final</h3>
      <label>Formato<select data-dr="koType">${opt('semis', 'Meias-finais + final', d.koType)}${opt('final', 'Só final', d.koType)}${opt('none', 'Sem fase final (classificação da série)', d.koType)}</select></label>`;
    if (d.koType !== 'none') {
      h += templateEditor(R.templatePresets(d.nGroups, d.koType), d.template, 'data-dr="template"');
      const err = R.validateTemplate(dc, d.template, d.koType);
      if (err) h += `<div class="notice warn small">${esc(err)}</div>`;
      if (d.koType === 'semis') h += `<label>3º e 4º lugar<select data-dr="thirdMode">${opt('grupos', 'Pela fase de grupos (vencidos das meias)', d.thirdMode)}${opt('jogo', 'Jogo de 3º/4º lugar', d.thirdMode)}</select></label>`;
      h += `<label>Duração dos jogos<input data-dr="koDuration" value="${esc(d.koDuration)}"></label>`;
    }
    h += `</div><button class="btn primary block" data-act="createConc">Criar concentração</button>`;
    return { title: 'Nova concentração', back: `#/c/${comp.id}`, html: h };
  }

  function templateEditor(presets, tpl, attr) {
    return `<label>Cruzamentos<select ${attr}>${presets.map(p => opt(p, R.templateLabel(p), tpl)).join('')}
        <option value="" ${presets.includes(tpl) ? '' : 'selected'}>Personalizado…</option></select></label>
      <label>Código do modelo<input ${attr} value="${esc(tpl)}"></label>
      <p class="muted small">1A = 1º da série A · M2 = melhor 2º · M2.2 = 2º melhor 2º · jogos separados por | <br>${esc(R.templateLabel(tpl))}</p>`;
  }

  // ---------- concentração ----------
  function viewConc(comp, conc, tab) {
    current = { comp, conc };
    const sum = R.summarize(conc, comp.settings);
    const tabs = conc.groups.map((g, i) => ['g' + i, 'Série ' + g.name]);
    if (conc.ko.type !== 'none') tabs.push(['ko', 'Fase final']);
    tabs.push(['cl', 'Classificação']);
    const base = `#/c/${comp.id}/k/${conc.id}/`;
    let h = `<nav class="tabs">${tabs.map(([k, l]) => `<a href="${base}${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
    if (tab[0] === 'g') h += groupTab(conc, sum, +tab.slice(1));
    else if (tab === 'ko') h += koTab(conc, sum);
    else h += classTab(comp, conc, sum);
    return { title: conc.name, back: `#/c/${comp.id}`, html: h };
  }

  function standings(ranking) {
    let h = `<div class="tablewrap"><table class="std"><thead><tr><th>#</th><th class="l">Equipa</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th><th>DG</th><th>Disc</th><th>Pts</th></tr></thead><tbody>`;
    ranking.forEach(r => {
      h += `<tr class="${r.tied ? 'tied' : ''}"><td>${r.pos}º</td><td class="l">${esc(clubName(r.id))}</td><td>${r.j}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td>${r.gm}</td><td>${r.gs}</td><td>${r.dg > 0 ? '+' : ''}${r.dg}</td><td>${r.disc}</td><td><b>${r.pts}</b></td></tr>`;
    });
    return h + '</tbody></table></div>';
  }

  function tieBox(ties, scope) {
    return ties.map(cl => {
      const key = scope + '|' + cl.slice().sort().join(',');
      const p = pendingDraw[key];
      const seq = p && p.length === cl.length && p.every(id => cl.includes(id)) ? p : cl;
      const items = seq.map((id, i) => `<li>${esc(clubName(id))}${i ? ` <button class="mini" data-act="drawUp" data-key="${key}" data-cl="${seq.join(',')}" data-id="${id}">▲</button>` : ''}</li>`).join('');
      return `<div class="notice warn"><b>Empate em todos os critérios.</b> Ordene conforme o sorteio:
        <ol class="draw">${items}</ol>
        <button class="btn small primary" data-act="drawOk" data-scope="${scope}" data-cl="${seq.join(',')}">Confirmar sorteio</button></div>`;
    }).join('');
  }

  function groupTab(conc, sum, gi) {
    const x = sum.ctx.groups[gi];
    if (!x) return '';
    const g = x.g;
    let h = `<div class="sub">Série ${esc(g.name)} · ${g.teams.length} equipas · ${esc(g.duration || '')}</div>`;
    h += standings(x.ranking);
    if (x.allPlayed) h += tieBox(R.collectTies(x.ranking), 'g:' + g.id);
    h += `<button class="btn small" data-act="shareGroup" data-gi="${gi}">Partilhar</button>
      <h3>Jogos</h3><button class="btn small" data-act="sortTime" data-gi="${gi}">Ordenar pela hora</button>`;
    g.matches.forEach((m, i) => { h += matchCard(m, { label: 'J' + (i + 1), move: { gi, i, n: g.matches.length } }); });

    const others = sortedClubs().filter(c => !R.participants(conc).includes(c.id));
    h += `<details class="card" data-key="gcfg-${g.id}"><summary>Configurar série</summary>
      <label>Duração dos jogos<input data-gcfg="duration" data-gi="${gi}" value="${esc(g.duration || '')}"></label>
      <h4>Equipas</h4><ul class="plain">${g.teams.map(id => `<li>${esc(clubName(id))} <button class="mini danger" data-act="gRemove" data-gi="${gi}" data-id="${id}">✕</button></li>`).join('')}</ul>
      <label>Adicionar equipa<select data-gadd="${gi}">${opt('', '—', '')}${others.map(c => opt(c.id, c.name, '')).join('')}</select></label>
      <h4>Gerar calendário de novo</h4>
      <div class="grid3"><label>1º jogo<input type="time" id="rg-start-${gi}"></label>
      <label>Intervalo (min)<input type="number" id="rg-int-${gi}" value="30"></label>
      <label>Campos<input id="rg-fields-${gi}" value="1"></label></div>
      <button class="btn small" data-act="regen" data-gi="${gi}">Gerar jogos (apaga resultados da série)</button>
      ${(g.drawOrder || []).length ? `<button class="btn small" data-act="clearDraw" data-gi="${gi}">Anular sorteios da série</button>` : ''}
    </details>`;
    return h;
  }

  function matchCard(m, o) {
    o = o || {};
    const ready = m.a != null && m.b != null;
    const dis = ready ? '' : 'disabled';
    const val = v => Number.isInteger(v) ? v : '';
    const nm = (id, label) => id != null ? esc(clubName(id)) : `<i class="muted">${esc(label || 'Por definir')}</i>`;
    const meta = [o.label || m.code, m.time, m.field ? 'Campo ' + m.field : '', m.ref ? 'Arb: ' + m.ref : ''].filter(Boolean).map(esc).join(' · ');
    const step = (f, icon) => `<span class="step">${icon}<button data-step="${f}" data-d="-1" ${dis}>−</button><b>${m[f] || 0}</b><button data-step="${f}" data-d="1" ${dis}>+</button></span>`;
    const mv = o.move;
    const arrows = mv ? `<span class="nowrap">
        <button class="mini" data-act="moveMatch" data-gi="${mv.gi}" data-i="${mv.i}" data-d="-1" ${mv.i ? '' : 'disabled'}>▲</button>
        <button class="mini" data-act="moveMatch" data-gi="${mv.gi}" data-i="${mv.i}" data-d="1" ${mv.i < mv.n - 1 ? '' : 'disabled'}>▼</button></span>` : '';
    let h = `<div class="match ${R.isPlayed(m) ? 'played' : ''}" data-mid="${m.id}">
      <div class="meta"><span>${meta}</span>${arrows}</div>
      <div class="score">
        <div class="tn a">${nm(m.a, m.labelA)}</div>
        <input class="goal" type="number" inputmode="numeric" min="0" data-f="sa" value="${val(m.sa)}" ${dis}>
        <span class="dash">–</span>
        <input class="goal" type="number" inputmode="numeric" min="0" data-f="sb" value="${val(m.sb)}" ${dis}>
        <div class="tn b">${nm(m.b, m.labelB)}</div>
      </div>`;
    if (o.ko && R.isPlayed(m) && m.sa === m.sb) {
      h += `<div class="score pens"><div class="tn a muted">Penáltis</div>
        <input class="goal" type="number" inputmode="numeric" min="0" data-f="pa" value="${val(m.pa)}">
        <span class="dash">–</span>
        <input class="goal" type="number" inputmode="numeric" min="0" data-f="pb" value="${val(m.pb)}"><div class="tn b"></div></div>`;
      if (R.koWinner(m) == null) h += '<div class="notice warn small">Empate: introduza o resultado dos penáltis.</div>';
    }
    h += `<div class="cards"><span>${step('ya', '🟨')}${step('ra', '🟥')}</span><span>${step('yb', '🟨')}${step('rb', '🟥')}</span></div>
      <details data-key="d-${m.id}"><summary>Hora, campo, árbitro${o.ko ? ', equipas' : ''}</summary>
      <div class="grid3"><label>Hora<input data-f="time" value="${esc(m.time)}" placeholder="13:30"></label>
      <label>Campo<input data-f="field" value="${esc(m.field)}"></label>
      <label>Árbitro<input data-f="ref" value="${esc(m.ref)}"></label></div>`;
    if (o.ko) {
      const teamSel = (f, label) => `<label>${label}<select data-f="${f}">${opt('', 'Automático', m[f] || '')}${o.teams.map(id => opt(id, clubName(id), m[f] || '')).join('')}</select></label>`;
      h += `<div class="grid2">${teamSel('manA', 'Equipa A')}${teamSel('manB', 'Equipa B')}</div>`;
    } else {
      h += `<button class="btn small" data-act="swapSides">⇄ Trocar casa/fora</button> `;
    }
    h += `<button class="btn small" data-act="clearMatch">Limpar resultado e cartões</button></details></div>`;
    return h;
  }

  function koTab(conc, sum) {
    const ko = conc.ko, ctx = sum.ctx;
    const err = R.validateTemplate(conc, ko.template, ko.type);
    let h = `<details class="card" data-key="kocfg" ${err ? 'open' : ''}><summary>Configurar fase final</summary>
      <label>Formato<select data-ko="type">${opt('semis', 'Meias-finais + final', ko.type)}${opt('final', 'Só final', ko.type)}${opt('none', 'Sem fase final', ko.type)}</select></label>`;
    h += templateEditor(R.templatePresets(conc.groups.length, ko.type), ko.template, 'data-ko="template"');
    if (ko.type === 'semis') h += `<label>3º e 4º lugar<select data-ko="thirdMode">${opt('grupos', 'Pela fase de grupos (vencidos das meias)', ko.thirdMode)}${opt('jogo', 'Jogo de 3º/4º lugar', ko.thirdMode)}</select></label>`;
    h += `<label>Duração dos jogos<input data-ko="duration" value="${esc(ko.duration)}"></label></details>`;
    if (err) h += `<div class="notice warn">${esc(err)}</div>`;
    h += `<div class="sub">${esc(ko.duration)}</div>`;

    // ranking dos melhores Xº usados nos cruzamentos
    const best = {};
    R.parseTemplate(ko.template).forEach(p => p.forEach(t => {
      const q = R.parseToken(t);
      if (q && q.kind === 'best') best[q.pos] = Math.max(best[q.pos] || 0, q.nth);
    }));
    Object.keys(best).forEach(pos => {
      h += `<h3>Melhores ${pos}ºs classificados</h3>`;
      if (!ctx.allFinished) { h += '<p class="muted small">Disponível quando todas as séries terminarem.</p>'; return; }
      const list = R.bestOf(ctx, +pos);
      h += `<div class="tablewrap"><table class="std"><thead><tr><th>#</th><th class="l">Equipa</th><th>Série</th><th>J</th><th>Pts</th><th>Disc</th><th>DG</th><th>GM</th><th>GS</th></tr></thead><tbody>
        ${list.map((r, i) => `<tr class="${r.tied ? 'tied' : ''}"><td>${i + 1}º</td><td class="l">${esc(clubName(r.id))}</td><td>${esc(r.group)}</td><td>${r.j}</td><td><b>${r.pts}</b></td><td>${r.disc}</td><td>${r.dg}</td><td>${r.gm}</td><td>${r.gs}</td></tr>`).join('')}
        </tbody></table></div>`;
      if (conc.groups.some(g => g.teams.length > Math.min(...conc.groups.map(g => g.teams.length)))) {
        h += '<p class="muted small">Nas séries com mais equipas não contam os jogos contra o(s) último(s) classificado(s).</p>';
      }
      h += tieBox(R.collectTies(list).filter(cl => list.findIndex(r => cl.includes(r.id)) < best[pos]), 'k');
    });

    const teams = R.participants(conc);
    if (ko.type === 'semis') {
      h += '<h3>Meias-finais</h3>';
      sum.ko.semis.forEach(m => { h += matchCard(m, { ko: true, teams }); });
    }
    h += '<h3>Final</h3>' + matchCard(sum.ko.final, { ko: true, teams });
    if (sum.ko.third) h += '<h3>3º / 4º lugar</h3>' + matchCard(sum.ko.third, { ko: true, teams });
    return h;
  }

  function classTab(comp, conc, sum) {
    const { fr, pts, disc } = sum;
    const circuit = comp.type === 'circuito';
    let h = '';
    if (!fr.complete) h += '<div class="notice">Classificação provisória — faltam resultados.</div>';
    h += tieBox(fr.ties, 'k');
    h += `<div class="tablewrap"><table class="std"><thead><tr><th>Lugar</th><th class="l">Equipa</th><th>Disc</th>${circuit ? '<th>Pts</th>' : ''}</tr></thead><tbody>`;
    fr.places.forEach((id, i) => {
      h += `<tr class="${i < 3 && id ? 'medal m' + (i + 1) : ''}"><td>${i + 1}º</td><td class="l">${id ? esc(clubName(id)) : '<i class="muted">por decidir</i>'}</td>
        <td>${id ? disc[id] : ''}</td>${circuit ? `<td><b>${pts && id ? pts[id] : '…'}</b></td>` : ''}</tr>`;
    });
    h += `</tbody></table></div>
      <p class="muted small">Disciplina inclui todos os jogos (séries e fase final).${circuit ? ' Pts = pontos para a tabela geral do circuito.' : ''}</p>
      <button class="btn small" data-act="shareClass">Partilhar</button>
      <details class="card" data-key="kdata"><summary>Dados da concentração</summary>
        <label>Nome<input data-conc="name" value="${esc(conc.name)}"></label>
        <div class="grid2"><label>Data<input type="date" data-conc="date" value="${esc(conc.date)}"></label>
        <label>Local<input data-conc="place" value="${esc(conc.place)}"></label></div>
        ${(conc.drawOrder || []).length ? '<button class="btn small" data-act="clearConcDraw">Anular sorteios entre séries</button>' : ''}
        <button class="btn danger small" data-act="delConc">Apagar concentração</button>
      </details>`;
    return h;
  }

  // ---------- tabela geral ----------
  function viewTable(comp) {
    current = { comp };
    const rows = R.circuitTable(comp);
    const cell = v => v == null ? '<span class="muted">–</span>' : v === 'pend' ? '<span class="muted">…</span>' : v;
    let h = `<div class="tablewrap"><table class="std"><thead><tr><th>#</th><th class="l">Clube</th>
      ${comp.concs.map((k, i) => `<th title="${esc(k.name)}">C${i + 1}</th>`).join('')}<th>Disc</th><th>Total</th></tr></thead><tbody>`;
    rows.forEach(r => {
      h += `<tr><td>${r.pos}º</td><td class="l">${esc(clubName(r.id))}</td>${r.per.map(v => `<td>${cell(v)}</td>`).join('')}<td>${r.disc}</td><td><b>${r.total}</b></td></tr>`;
    });
    h += `</tbody></table></div><ul class="plain small">${comp.concs.map((k, i) => `<li><b>C${i + 1}</b> – ${esc(k.name)} ${esc(k.date || '')}</li>`).join('')}</ul>
      <p class="muted small">– não participou · … concentração por terminar. Empate em pontos: menos disciplina fica à frente.</p>
      <button class="btn small" data-act="shareTable">Partilhar</button>`;
    if (!rows.length) h = '<p class="muted">Ainda não há concentrações.</p>';
    return { title: 'Tabela geral', back: `#/c/${comp.id}`, html: h };
  }

  // ---------- clubes e cópias ----------
  function viewClubs() {
    let h = '<div class="card"><ul class="plain clubs">';
    sortedClubs().forEach(c => {
      h += `<li><input data-club="${c.id}" value="${esc(c.name)}">${clubUsed(c.id) ? '' : `<button class="mini danger" data-act="delClub" data-id="${c.id}">✕</button>`}</li>`;
    });
    h += `</ul><div class="addrow"><input id="new-club" placeholder="Novo clube"><button class="btn small" data-act="addClub">Adicionar</button></div></div>
      <p class="muted small">Clubes já usados em concentrações não podem ser apagados (mas podem mudar de nome).</p>`;
    return { title: 'Clubes', back: '#/', html: h };
  }

  function viewBackup() {
    const h = `<div class="card"><h3>Exportar</h3><p class="muted small">Guarda todos os dados num ficheiro .json (ex.: para o Google Drive).</p>
      <button class="btn primary" data-act="export">Exportar cópia</button></div>
      <div class="card"><h3>Importar</h3><p class="muted small">Substitui todos os dados atuais pelos do ficheiro.</p>
      <input type="file" id="import-file" accept=".json,application/json"></div>
      <div class="card"><h3>Apagar tudo</h3><button class="btn danger" data-act="reset">Apagar todos os dados</button></div>`;
    return { title: 'Cópia de segurança', back: '#/', html: h };
  }

  // ---------- textos para partilhar ----------
  function groupText(conc, x) {
    let t = `${conc.name} – Série ${x.g.name}\n`;
    x.ranking.forEach(r => { t += `${r.pos}º ${clubName(r.id)} – ${r.pts} pts (J${r.j}, DG ${r.dg}, Disc ${r.disc})\n`; });
    t += '\nResultados:\n';
    x.g.matches.forEach(m => { t += `${clubName(m.a)} ${R.isPlayed(m) ? m.sa + '-' + m.sb : 'x'} ${clubName(m.b)}\n`; });
    return t;
  }

  // ---------- ações (botões) ----------
  const actions = {
    newComp() {
      const name = document.getElementById('nc-name').value.trim();
      if (!name) return alert('Indique o nome da competição.');
      const comp = { id: R.uid(), name, type: document.getElementById('nc-type').value, settings: R.withDefaults(), concs: [] };
      state.comps.push(comp); save();
      location.hash = '#/c/' + comp.id;
    },
    delComp() {
      if (!confirm(`Apagar "${current.comp.name}" e todas as suas concentrações?`)) return;
      state.comps = state.comps.filter(c => c !== current.comp); save();
      location.hash = '#/';
    },
    tb(d) {
      const s = R.withDefaults(current.comp.settings);
      const i = +d.i, j = i + +d.d;
      [s.tiebreak[i], s.tiebreak[j]] = [s.tiebreak[j], s.tiebreak[i]];
      current.comp.settings = s; save(); render(true);
    },
    copyTeams() {
      const prev = current.comp.concs[current.comp.concs.length - 1];
      draft.nGroups = prev.groups.length;
      draft.assign = {};
      draft.order = [];
      prev.groups.forEach((g, i) => g.teams.forEach(id => { draft.assign[id] = i; draft.order.push(id); }));
      fixDraft(); render(true);
    },
    draftAddClub() {
      const name = document.getElementById('dr-club').value.trim();
      if (!name) return;
      state.clubs.push({ id: R.uid(), name }); save(); render(true);
    },
    createConc() {
      const comp = current.comp, d = draft, dc = draftConc();
      for (const g of dc.groups) if (g.teams.length < 2) return alert(`A série ${g.name} precisa de pelo menos 2 equipas.`);
      const err = d.koType === 'none' ? '' : R.validateTemplate(dc, d.template, d.koType);
      if (err) return alert(err);
      const conc = {
        id: R.uid(), name: d.name.trim() || 'Concentração', date: d.date, place: d.place, drawOrder: [],
        groups: dc.groups.map((g, i) => {
          const o = d.groupOpts[i];
          return { id: R.uid(), name: g.name, teams: g.teams, duration: o.duration, drawOrder: [],
            matches: R.generateMatches(g.teams, { start: o.start, fields: o.fields, interval: d.interval }) };
        }),
        ko: R.newKO({ type: d.koType, template: d.template, thirdMode: d.thirdMode, duration: d.koDuration }),
      };
      comp.concs.push(conc); save();
      draft = null;
      location.hash = `#/c/${comp.id}/k/${conc.id}`;
    },
    clearMatch(d, b) {
      const m = findMatch(current.conc, b.closest('.match').dataset.mid);
      Object.assign(m, { sa: null, sb: null, pa: null, pb: null, ya: 0, ra: 0, yb: 0, rb: 0 });
      save(); render(true);
    },
    moveMatch(d) {
      R.moveMatch(current.conc.groups[+d.gi].matches, +d.i, +d.d);
      save(); render(true);
    },
    swapSides(d, b) {
      R.swapSides(findMatch(current.conc, b.closest('.match').dataset.mid));
      save(); render(true);
    },
    sortTime(d) {
      const g = current.conc.groups[+d.gi];
      g.matches = R.sortByTime(g.matches);
      save(); render(true);
    },
    drawUp(d) {
      const seq = d.cl.split(','), i = seq.indexOf(d.id);
      [seq[i - 1], seq[i]] = [seq[i], seq[i - 1]];
      pendingDraw[d.key] = seq; render(true);
    },
    drawOk(d) {
      const seq = d.cl.split(',');
      let holder = current.conc;
      if (d.scope !== 'k') holder = current.conc.groups.find(g => 'g:' + g.id === d.scope);
      holder.drawOrder = (holder.drawOrder || []).filter(x => !seq.includes(x)).concat(seq);
      save(); render(true);
    },
    clearDraw(d) { current.conc.groups[+d.gi].drawOrder = []; save(); render(true); },
    clearConcDraw() { current.conc.drawOrder = []; save(); render(true); },
    gRemove(d) {
      const g = current.conc.groups[+d.gi];
      if (g.teams.length <= 2) return alert('A série precisa de pelo menos 2 equipas.');
      if (!confirm(`Retirar ${clubName(d.id)} da série? Os seus jogos são apagados.`)) return;
      g.teams = g.teams.filter(id => id !== d.id);
      g.matches = g.matches.filter(m => m.a !== d.id && m.b !== d.id);
      save(); render(true);
    },
    regen(d) {
      const gi = +d.gi, g = current.conc.groups[gi];
      if (g.matches.some(m => R.isPlayed(m)) && !confirm('Isto apaga os resultados desta série. Continuar?')) return;
      g.matches = R.generateMatches(g.teams, {
        start: document.getElementById('rg-start-' + gi).value,
        interval: +document.getElementById('rg-int-' + gi).value || 30,
        fields: document.getElementById('rg-fields-' + gi).value,
      });
      g.drawOrder = [];
      save(); render(true);
    },
    delConc() {
      if (!confirm(`Apagar "${current.conc.name}"?`)) return;
      const comp = current.comp;
      comp.concs = comp.concs.filter(k => k !== current.conc); save();
      location.hash = '#/c/' + comp.id;
    },
    shareGroup(d) {
      const sum = R.summarize(current.conc, current.comp.settings);
      share(groupText(current.conc, sum.ctx.groups[+d.gi]));
    },
    shareClass() {
      const { comp, conc } = current;
      const sum = R.summarize(conc, comp.settings);
      let t = `${comp.name} – ${conc.name}${conc.date ? ' (' + conc.date + ')' : ''}\nClassificação final:\n`;
      sum.fr.places.forEach((id, i) => { t += `${i + 1}º ${id ? clubName(id) : '?'}${comp.type === 'circuito' && sum.pts ? ' – ' + sum.pts[id] + ' pts' : ''}\n`; });
      share(t);
    },
    shareTable() {
      const comp = current.comp;
      let t = `${comp.name} – Tabela geral\n`;
      R.circuitTable(comp).forEach(r => { t += `${r.pos}º ${clubName(r.id)} – ${r.total} pts (Disc ${r.disc})\n`; });
      share(t);
    },
    addClub() {
      const name = document.getElementById('new-club').value.trim();
      if (!name) return;
      state.clubs.push({ id: R.uid(), name }); save(); render(true);
    },
    delClub(d) {
      if (!confirm(`Apagar ${clubName(d.id)}?`)) return;
      state.clubs = state.clubs.filter(c => c.id !== d.id); save(); render(true);
    },
    async shareLink() {
      const comp = current.comp;
      try {
        const data = await S.encodeLink(S.snapshot(comp, state.clubs));
        share(`Resultados – ${comp.name}:\n${location.href.split('#')[0]}#/ver/${data}`);
      } catch (e) { alert('Não foi possível criar o link: ' + e.message); }
    },
    exitViewer() {
      sessionStorage.removeItem(VKEY);
      viewer = null; state = S.load();
      setHash('#/'); render();
    },
    export() { S.exportFile(); },
    reset() {
      if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
      state = S.reset(); location.hash = '#/'; render();
    },
  };

  // ---------- eventos ----------
  app.addEventListener('click', e => {
    const st = e.target.closest('[data-step]');
    if (st) {
      const m = findMatch(current.conc, st.closest('.match').dataset.mid);
      const f = st.dataset.step;
      m[f] = Math.max(0, (m[f] || 0) + +st.dataset.d);
      save(); render(true);
      return;
    }
    const b = e.target.closest('[data-act]');
    if (b && actions[b.dataset.act]) { e.preventDefault(); actions[b.dataset.act](b.dataset, b); }
  });

  app.addEventListener('input', e => {
    const el = e.target, ds = el.dataset;
    if (!draft) return;
    if (ds.dr && el.tagName === 'INPUT') draft[ds.dr] = el.value;
    if (ds.dg) draft.groupOpts[+ds.i][ds.dg] = el.value;
  });

  app.addEventListener('change', e => {
    const el = e.target, ds = el.dataset;
    const card = el.closest('.match');

    if (card && ds.f) {
      const m = findMatch(current.conc, card.dataset.mid);
      if (['sa', 'sb', 'pa', 'pb'].includes(ds.f)) {
        const n = parseInt(el.value, 10);
        m[ds.f] = Number.isInteger(n) && n >= 0 ? n : null;
      } else if (ds.f === 'manA' || ds.f === 'manB') {
        m[ds.f] = el.value || null;
      } else {
        m[ds.f] = el.value;
      }
      save(); renderKeepFocus();
      return;
    }

    if (ds.set) {
      const s = R.withDefaults(current.comp.settings);
      if (ds.set === 'circuitPts') {
        const list = el.value.split(/[,;\s]+/).map(x => parseInt(x, 10)).filter(Number.isInteger);
        if (list.length) s.circuitPts = list;
      } else {
        const n = parseInt(el.value, 10);
        if (Number.isInteger(n)) s[ds.set] = n;
      }
      current.comp.settings = s; save(); render(true);
      return;
    }
    if (ds.comp) { current.comp[ds.comp] = el.value; save(); render(true); return; }
    if (ds.conc) { current.conc[ds.conc] = el.value; save(); render(true); return; }
    if (ds.club) {
      const c = state.clubs.find(c => c.id === ds.club);
      if (el.value.trim()) { c.name = el.value.trim(); save(); }
      render(true);
      return;
    }

    if (ds.ko) {
      const ko = current.conc.ko;
      if (ds.ko === 'template' && !el.value) { render(true); return; }
      ko[ds.ko] = ds.ko === 'template' ? el.value.trim() : el.value;
      if (ds.ko === 'type' && ko.type !== 'none' && R.validateTemplate(current.conc, ko.template, ko.type)) {
        ko.template = R.templatePresets(current.conc.groups.length, ko.type)[0] || '';
      }
      save(); render(true);
      return;
    }
    if (ds.gcfg) { current.conc.groups[+ds.gi][ds.gcfg] = el.value; save(); render(true); return; }
    if (ds.gadd !== undefined) {
      if (!el.value) return;
      const g = current.conc.groups[+ds.gadd];
      g.matches = g.matches.concat(g.teams.map(id => R.emptyMatch({ round: g.matches.length ? Math.max(...g.matches.map(m => m.round || 1)) + 1 : 1, a: id, b: el.value })));
      g.teams.push(el.value);
      save(); render(true);
      return;
    }

    if (draft && ds.assign) {
      draft.order = draft.order.filter(id => id !== ds.assign);
      if (el.value === '') delete draft.assign[ds.assign];
      else { draft.assign[ds.assign] = +el.value; draft.order.push(ds.assign); }
      fixDraft(); render(true);
      return;
    }
    if (draft && ds.dr) {
      if (ds.dr === 'template' && !el.value) { render(true); return; }
      draft[ds.dr] = ['nGroups', 'interval'].includes(ds.dr) ? (+el.value || 0) : el.value;
      fixDraft(); render(true);
      return;
    }
    if (draft && ds.dg) { draft.groupOpts[+ds.i][ds.dg] = el.value; return; }

    if (el.id === 'import-file' && el.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          if (!confirm('Substituir todos os dados atuais pelos do ficheiro?')) return;
          state = S.importText(reader.result);
          alert('Dados importados.');
          location.hash = '#/'; render();
        } catch (err) { alert('Erro: ' + err.message); }
      };
      reader.readAsText(el.files[0]);
    }
  });

  backBtn.addEventListener('click', () => { if (backBtn.dataset.href) location.hash = backBtn.dataset.href; });
  // muda o # sem criar entrada no histórico nem disparar hashchange
  const setHash = h => history.replaceState(null, '', location.href.split('#')[0] + h);

  // abre um link de consulta (#/ver/<dados>) ou retoma o que já estava aberto neste separador
  async function boot() {
    if (isViewLink()) {
      try {
        const snap = await S.decodeLink(location.hash.slice('#/ver/'.length));
        sessionStorage.setItem(VKEY, JSON.stringify(snap));
        setHash('#/c/' + snap.comp.id);
      } catch (e) {
        alert(e.message);
        setHash('#/');
      }
    }
    const saved = sessionStorage.getItem(VKEY);
    viewer = saved ? JSON.parse(saved) : null;
    state = viewer ? { clubs: viewer.clubs, comps: [viewer.comp] } : S.load();
  }

  window.addEventListener('hashchange', () => {
    if (isViewLink()) boot().then(() => render(false));
    else render(false);
  });
  boot().then(() => render(false));
})();
