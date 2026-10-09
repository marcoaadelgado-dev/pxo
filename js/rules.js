/* Regras do torneio: classificações, desempates, apuramentos e pontos de circuito.
   Lógica pura (sem DOM) para poder ser testada em tests.html. */
(function (global) {
  'use strict';

  const DEFAULT_SETTINGS = {
    win: 3, draw: 1, loss: 0,
    yellow: 1, red: 3,
    circuitPts: [5, 4, 3, 2],
    participantPts: 1,
    tiebreak: ['disc', 'h2h', 'dg', 'gm', 'gs'],
  };

  // key(): valor maior = melhor posição
  const CRITERIA = {
    pts: { label: 'Pontos', key: x => x.pts },
    disc: { label: 'Disciplina (menos pontos fica à frente)', key: x => -x.disc },
    h2h: { label: 'Confronto direto' },
    dg: { label: 'Diferença de golos (GM − GS)', key: x => x.dg },
    gm: { label: 'Golos marcados', key: x => x.gm },
    gs: { label: 'Menos golos sofridos', key: x => -x.gs },
  };

  function withDefaults(settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const known = Object.keys(CRITERIA).filter(c => c !== 'pts');
    s.tiebreak = (s.tiebreak || []).filter(c => known.includes(c));
    known.forEach(c => { if (!s.tiebreak.includes(c)) s.tiebreak.push(c); });
    return s;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function isPlayed(m) {
    return !!m && m.a != null && m.b != null && Number.isInteger(m.sa) && Number.isInteger(m.sb);
  }

  function discOf(m, side, s) {
    return (m['y' + side] || 0) * s.yellow + (m['r' + side] || 0) * s.red;
  }

  function computeStats(ids, matches, s) {
    const map = {};
    ids.forEach(id => { map[id] = { id, j: 0, v: 0, e: 0, d: 0, gm: 0, gs: 0, dg: 0, pts: 0, disc: 0 }; });
    matches.forEach(m => {
      const A = map[m.a], B = map[m.b];
      if (!A || !B) return;
      A.disc += discOf(m, 'a', s);
      B.disc += discOf(m, 'b', s);
      if (!isPlayed(m)) return;
      A.j++; B.j++;
      A.gm += m.sa; A.gs += m.sb; B.gm += m.sb; B.gs += m.sa;
      if (m.sa > m.sb) { A.v++; B.d++; A.pts += s.win; B.pts += s.loss; }
      else if (m.sa < m.sb) { B.v++; A.d++; B.pts += s.win; A.pts += s.loss; }
      else { A.e++; B.e++; A.pts += s.draw; B.pts += s.draw; }
    });
    Object.values(map).forEach(x => { x.dg = x.gm - x.gs; });
    return map;
  }

  function partition(ids, key) {
    const sorted = ids.slice().sort((x, y) => key(y) - key(x));
    const parts = [];
    sorted.forEach(id => {
      const last = parts[parts.length - 1];
      if (last && key(last[0]) === key(id)) last.push(id); else parts.push([id]);
    });
    return parts;
  }

  // Ordena aplicando os critérios por ordem. Empates totais usam drawOrder (sorteio);
  // se o sorteio ainda não foi feito, as equipas ficam marcadas com tied = true.
  function rankByCriteria(ids, statsMap, criteria, matches, s, drawOrder) {
    const ord = drawOrder || [];
    const out = [];
    const resolve = (group, idx) => {
      if (group.length === 1) { out.push({ id: group[0], tied: false }); return; }
      if (idx >= criteria.length) {
        const byDraw = group.every(id => ord.includes(id));
        const sorted = byDraw ? group.slice().sort((x, y) => ord.indexOf(x) - ord.indexOf(y)) : group;
        sorted.forEach(id => out.push({ id, tied: !byDraw, tieWith: sorted }));
        return;
      }
      const c = criteria[idx];
      let key;
      if (c === 'h2h') {
        if (!matches) { resolve(group, idx + 1); return; }
        const sub = matches.filter(m => group.includes(m.a) && group.includes(m.b));
        const mini = computeStats(group, sub, s);
        key = id => mini[id].pts;
      } else {
        key = id => CRITERIA[c].key(statsMap[id]);
      }
      partition(group, key).forEach(p => {
        // confronto direto: se separou parte do grupo, volta a aplicar só entre os que continuam empatados
        if (c === 'h2h' && p.length > 1 && p.length < group.length) resolve(p, idx);
        else resolve(p, idx + 1);
      });
    };
    resolve(ids.slice(), 0);
    return out.map((x, i) => Object.assign({}, statsMap[x.id], {
      pos: i + 1, tied: x.tied, tieWith: x.tied ? x.tieWith : null,
    }));
  }

  function rankGroup(group, s) {
    s = withDefaults(s);
    const stats = computeStats(group.teams, group.matches, s);
    return rankByCriteria(group.teams, stats, ['pts'].concat(s.tiebreak), group.matches, s, group.drawOrder);
  }

  function collectTies(ranking) {
    const seen = new Set(), ties = [];
    ranking.forEach(r => {
      if (!r.tied) return;
      const k = r.tieWith.join(',');
      if (!seen.has(k)) { seen.add(k); ties.push(r.tieWith.slice()); }
    });
    return ties;
  }

  // Estatísticas para comparar equipas de séries diferentes: nas séries maiores
  // descontam-se os jogos contra as equipas abaixo do tamanho da série mais pequena.
  function crossStats(conc, group, ranking, s) {
    const full = computeStats(group.teams, group.matches, s);
    const min = Math.min(...conc.groups.map(g => g.teams.length));
    if (group.teams.length <= min) return full;
    const excluded = ranking.slice(min).map(r => r.id);
    const keep = group.teams.filter(id => !excluded.includes(id));
    const reduced = computeStats(keep, group.matches.filter(m => keep.includes(m.a) && keep.includes(m.b)), s);
    return Object.assign({}, full, reduced);
  }

  function analyze(conc, settings) {
    const s = withDefaults(settings);
    const groups = conc.groups.map(g => {
      const ranking = rankGroup(g, s);
      const allPlayed = g.matches.every(isPlayed);
      return { g, ranking, allPlayed, finished: allPlayed && !ranking.some(r => r.tied) };
    });
    groups.forEach(x => { x.cross = crossStats(conc, x.g, x.ranking, s); });
    return { s, conc, groups, allFinished: groups.every(x => x.finished) };
  }

  function statsFor(ctx, id) {
    const x = ctx.groups.find(x => x.g.teams.includes(id));
    return x ? x.cross[id] : null;
  }

  function crossRank(ctx, ids) {
    const map = {};
    ids.forEach(id => { map[id] = statsFor(ctx, id); });
    const crit = ['pts'].concat(ctx.s.tiebreak.filter(c => c !== 'h2h'));
    return rankByCriteria(ids, map, crit, null, ctx.s, ctx.conc.drawOrder).map(r => {
      const x = ctx.groups.find(x => x.g.teams.includes(r.id));
      return Object.assign(r, { group: x.g.name, gpos: x.ranking.findIndex(t => t.id === r.id) + 1 });
    });
  }

  // Ranking dos Xº classificados de todas as séries (ex.: melhor 2º)
  function bestOf(ctx, pos) {
    const ids = ctx.groups.filter(x => x.ranking.length >= pos).map(x => x.ranking[pos - 1].id);
    return crossRank(ctx, ids);
  }

  // Tokens dos cruzamentos: "1A" = 1º da série A; "M2" = melhor 2º; "M2.2" = 2º melhor 2º
  function parseToken(t) {
    t = String(t || '').trim().toUpperCase().replace(/[ºª\s]/g, '');
    let m = /^(\d+)([A-Z])$/.exec(t);
    if (m) return { kind: 'pos', pos: +m[1], group: m[2] };
    m = /^M(\d+)(?:\.(\d+))?$/.exec(t);
    if (m) return { kind: 'best', pos: +m[1], nth: m[2] ? +m[2] : 1 };
    return null;
  }

  function tokenLabel(t) {
    const p = parseToken(t);
    if (!p) return String(t || '?');
    if (p.kind === 'pos') return p.pos + 'º ' + p.group;
    return (p.nth > 1 ? p.nth + 'º ' : '') + 'Melhor ' + p.pos + 'º';
  }

  function parseTemplate(tpl) {
    return String(tpl || '').split('|')
      .map(p => p.split('-').map(x => x.trim()))
      .filter(p => p.length === 2 && p[0] && p[1]);
  }

  function validateTemplate(conc, tpl, type) {
    if (type === 'none') return '';
    const pairs = parseTemplate(tpl);
    const need = type === 'semis' ? 2 : 1;
    if (pairs.length !== need) return `O modelo precisa de ${need} jogo(s), ex.: ${type === 'semis' ? '1A-M2|1B-1C' : '1A-1B'}`;
    const names = conc.groups.map(g => g.name.toUpperCase());
    const minSize = Math.min(...conc.groups.map(g => g.teams.length));
    const tokens = [].concat(...pairs);
    for (const t of tokens) {
      const p = parseToken(t);
      if (!p) return `Posição inválida: "${t}"`;
      if (p.kind === 'pos') {
        const gi = names.indexOf(p.group);
        if (gi < 0) return `Não existe a série ${p.group}`;
        if (p.pos < 1 || p.pos > conc.groups[gi].teams.length) return `A série ${p.group} não tem ${p.pos}º lugar`;
      } else {
        if (p.pos < 1 || p.pos > minSize) return `"${t}": nem todas as séries têm ${p.pos}º lugar`;
        if (p.nth < 1 || p.nth > conc.groups.length) return `"${t}": só há ${conc.groups.length} séries`;
      }
    }
    const norm = tokens.map(t => t.toUpperCase().replace(/[ºª\s]/g, '').replace(/^M(\d+)$/, 'M$1.1'));
    if (new Set(norm).size !== norm.length) return 'Há posições repetidas no modelo';
    return '';
  }

  function resolveToken(ctx, t) {
    const p = parseToken(t);
    if (!p) return null;
    if (p.kind === 'pos') {
      const x = ctx.groups.find(x => x.g.name.toUpperCase() === p.group);
      if (!x || !x.finished) return null;
      const r = x.ranking[p.pos - 1];
      return r ? r.id : null;
    }
    if (!ctx.allFinished) return null;
    const r = bestOf(ctx, p.pos)[p.nth - 1];
    return r && !r.tied ? r.id : null;
  }

  function koWinner(m) {
    if (!isPlayed(m)) return null;
    if (m.sa !== m.sb) return m.sa > m.sb ? m.a : m.b;
    if (Number.isInteger(m.pa) && Number.isInteger(m.pb) && m.pa !== m.pb) return m.pa > m.pb ? m.a : m.b;
    return null;
  }

  function koLoser(m) {
    const w = koWinner(m);
    return w == null ? null : (w === m.a ? m.b : m.a);
  }

  // Devolve cópias dos jogos da fase final com as equipas (a, b) já preenchidas
  function resolveKO(ctx) {
    const ko = ctx.conc.ko;
    const pairs = parseTemplate(ko.template);
    const res = { semis: [], final: null, third: null };
    const fromToken = (m, p) => Object.assign({}, m, {
      a: m.manA || resolveToken(ctx, p[0]), b: m.manB || resolveToken(ctx, p[1]),
      labelA: tokenLabel(p[0]), labelB: tokenLabel(p[1]),
    });
    if (ko.type === 'semis') {
      res.semis = ko.semis.map((m, i) => fromToken(m, pairs[i] || ['?', '?']));
      const [s1, s2] = res.semis;
      res.final = Object.assign({}, ko.final, {
        a: ko.final.manA || koWinner(s1), b: ko.final.manB || koWinner(s2),
        labelA: 'Vencedor ' + s1.code, labelB: 'Vencedor ' + s2.code,
      });
      if (ko.thirdMode === 'jogo') {
        res.third = Object.assign({}, ko.third, {
          a: ko.third.manA || koLoser(s1), b: ko.third.manB || koLoser(s2),
          labelA: 'Vencido ' + s1.code, labelB: 'Vencido ' + s2.code,
        });
      }
    } else if (ko.type === 'final') {
      res.final = fromToken(ko.final, pairs[0] || ['?', '?']);
    }
    return res;
  }

  function participants(conc) {
    return [].concat(...conc.groups.map(g => g.teams));
  }

  // Classificação final da concentração. places[i] = id da equipa no lugar i+1 (null = por decidir)
  function finalRanking(ctx, koRes) {
    koRes = koRes || resolveKO(ctx);
    const ko = ctx.conc.ko, s = ctx.s;
    const all = participants(ctx.conc);
    const places = all.map(() => null);
    const ties = [];
    const limit = Math.max(s.circuitPts.length, 1);
    let next = 0;

    const placeRanked = (ranked) => {
      ranked.forEach(r => {
        if (r.tied && next < limit && !ties.some(t => t.join() === r.tieWith.join())) ties.push(r.tieWith.slice());
        places[next++] = r.id;
      });
    };

    if (ko.type === 'semis') {
      places[0] = koWinner(koRes.final);
      places[1] = koLoser(koRes.final);
      if (ko.thirdMode === 'jogo') {
        places[2] = koWinner(koRes.third);
        places[3] = koLoser(koRes.third);
        next = 4;
      } else {
        const losers = koRes.semis.map(koLoser);
        next = 2;
        if (losers.every(x => x != null)) placeRanked(crossRank(ctx, losers));
        next = 4;
      }
    } else if (ko.type === 'final') {
      places[0] = koWinner(koRes.final);
      places[1] = koLoser(koRes.final);
      next = 2;
    }

    if (ctx.allFinished) {
      const done = new Set(places.filter(x => x != null));
      // os KO ainda por decidir ocupam lugares; as restantes equipas ordenam-se
      // por posição na série e, entre a mesma posição, pelos critérios
      const koTeams = new Set();
      if (ko.type === 'semis') koRes.semis.forEach(m => { koTeams.add(m.a); koTeams.add(m.b); });
      if (ko.type === 'final') { koTeams.add(koRes.final.a); koTeams.add(koRes.final.b); }
      const rest = all.filter(id => !done.has(id) && !koTeams.has(id));
      const maxPos = Math.max(...ctx.groups.map(x => x.g.teams.length));
      for (let pos = 1; pos <= maxPos; pos++) {
        const ids = ctx.groups.filter(x => x.ranking.length >= pos).map(x => x.ranking[pos - 1].id).filter(id => rest.includes(id));
        if (ids.length) placeRanked(crossRank(ctx, ids));
      }
    }

    const complete = ctx.allFinished && ties.length === 0 && places.every(x => x != null);
    return { places, complete, ties };
  }

  function circuitPoints(ctx, fr) {
    if (!fr.complete) return null;
    const pts = {};
    fr.places.forEach((id, i) => { pts[id] = i < ctx.s.circuitPts.length ? ctx.s.circuitPts[i] : ctx.s.participantPts; });
    return pts;
  }

  // Pontos de disciplina por equipa em todos os jogos da concentração (séries + fase final)
  function discipline(ctx, koRes) {
    koRes = koRes || resolveKO(ctx);
    const out = {};
    participants(ctx.conc).forEach(id => { out[id] = 0; });
    const add = m => {
      if (!m) return;
      if (m.a != null && m.a in out) out[m.a] += discOf(m, 'a', ctx.s);
      if (m.b != null && m.b in out) out[m.b] += discOf(m, 'b', ctx.s);
    };
    ctx.conc.groups.forEach(g => g.matches.forEach(add));
    koRes.semis.forEach(add);
    add(koRes.final);
    add(koRes.third);
    return out;
  }

  function summarize(conc, settings) {
    const ctx = analyze(conc, settings);
    const ko = resolveKO(ctx);
    const fr = finalRanking(ctx, ko);
    return { ctx, ko, fr, pts: circuitPoints(ctx, fr), disc: discipline(ctx, ko) };
  }

  // Tabela geral do circuito: uma coluna por concentração, disciplina acumulada, total
  function circuitTable(comp) {
    const s = withDefaults(comp.settings);
    const rows = {};
    comp.concs.forEach((conc, ci) => {
      const sum = summarize(conc, s);
      participants(conc).forEach(id => {
        const r = rows[id] || (rows[id] = { id, per: comp.concs.map(() => null), disc: 0, total: 0 });
        r.per[ci] = sum.pts ? sum.pts[id] : 'pend';
        r.disc += sum.disc[id] || 0;
        if (sum.pts) r.total += sum.pts[id];
      });
    });
    const list = Object.values(rows).sort((x, y) => (y.total - x.total) || (x.disc - y.disc));
    list.forEach((r, i) => {
      const prev = list[i - 1];
      r.pos = prev && prev.total === r.total && prev.disc === r.disc ? prev.pos : i + 1;
    });
    return list;
  }

  // Calendário todos-contra-todos (método do círculo)
  function roundRobin(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    if (n % 2) arr.push(-1);
    const m = arr.length, rounds = [];
    for (let r = 0; r < m - 1; r++) {
      const pairs = [];
      for (let i = 0; i < m / 2; i++) {
        const x = arr[i], y = arr[m - 1 - i];
        if (x >= 0 && y >= 0) pairs.push([x, y]);
      }
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop());
    }
    return rounds;
  }

  function addMinutes(hhmm, min) {
    const m = /^(\d{1,2})[:hH](\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return hhmm || '';
    const t = (+m[1] * 60 + +m[2] + min) % (24 * 60);
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  function emptyMatch(extra) {
    return Object.assign({ id: uid(), sa: null, sb: null, ya: 0, ra: 0, yb: 0, rb: 0, time: '', field: '', ref: '' }, extra);
  }

  function generateMatches(teams, opt) {
    opt = opt || {};
    const fields = String(opt.fields || '1').split(/[,;\s]+/).filter(Boolean);
    const interval = +opt.interval || 30;
    let t = opt.start || '';
    const ms = [];
    roundRobin(teams.length).forEach((pairs, r) => {
      pairs.forEach((p, i) => {
        if (i > 0 && i % fields.length === 0) t = addMinutes(t, interval);
        ms.push(emptyMatch({ round: r + 1, a: teams[p[0]], b: teams[p[1]], time: t, field: fields[i % fields.length] }));
      });
      t = addMinutes(t, interval);
    });
    return ms;
  }

  // Troca o jogo i com o vizinho (dir = -1 ou 1): mudam de lugar e trocam de hora e campo
  function moveMatch(matches, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= matches.length) return matches;
    const x = matches[i], y = matches[j];
    [x.time, y.time] = [y.time, x.time];
    [x.field, y.field] = [y.field, x.field];
    matches[i] = y; matches[j] = x;
    return matches;
  }

  // Troca quem joga em casa (equipa A ↔ B) com os respetivos golos e cartões
  function swapSides(m) {
    [['a', 'b'], ['sa', 'sb'], ['ya', 'yb'], ['ra', 'rb'], ['pa', 'pb'], ['manA', 'manB']].forEach(([p, q]) => {
      [m[p], m[q]] = [m[q], m[p]];
    });
    return m;
  }

  function minutesOf(hhmm) {
    const m = /^(\d{1,2})[:hH](\d{2})$/.exec(String(hhmm || '').trim());
    return m ? +m[1] * 60 + +m[2] : Infinity;
  }

  // Ordena pela hora; jogos sem hora ficam no fim pela ordem atual
  function sortByTime(matches) {
    return matches.map((m, i) => [m, i])
      .sort((x, y) => (minutesOf(x[0].time) - minutesOf(y[0].time)) || (x[1] - y[1]))
      .map(x => x[0]);
  }

  function newKO(opt) {
    opt = opt || {};
    const ko = (code) => emptyMatch({ code, pa: null, pb: null, manA: null, manB: null });
    return {
      type: opt.type || 'semis',
      template: opt.template || '',
      thirdMode: opt.thirdMode || 'grupos',
      duration: opt.duration || '2 x 10 min (sem intervalo)',
      semis: [ko('MF1'), ko('MF2')],
      final: ko('Final'),
      third: ko('3º/4º'),
    };
  }

  function templatePresets(nGroups, type) {
    if (type === 'final') {
      return ({ 1: ['1A-2A'], 2: ['1A-1B'], 3: ['M1-M1.2'], 4: ['M1-M1.2'] })[nGroups] || ['M1-M1.2'];
    }
    if (type === 'semis') {
      return ({
        1: ['1A-4A|2A-3A'],
        2: ['1A-2B|1B-2A'],
        3: ['1A-M2|1B-1C', '1B-M2|1A-1C', '1C-M2|1A-1B'],
        4: ['1A-1B|1C-1D', '1A-1C|1B-1D', '1A-1D|1B-1C', '1A-2B|1C-1D'],
      })[nGroups] || [];
    }
    return [];
  }

  function templateLabel(tpl) {
    return parseTemplate(tpl).map(p => tokenLabel(p[0]) + ' × ' + tokenLabel(p[1])).join('  |  ');
  }

  global.Rules = {
    DEFAULT_SETTINGS, CRITERIA, withDefaults, uid, isPlayed, discOf, computeStats,
    rankGroup, collectTies, analyze, bestOf, crossRank, parseToken, tokenLabel, parseTemplate,
    validateTemplate, resolveToken, koWinner, koLoser, resolveKO, participants, finalRanking,
    circuitPoints, discipline, summarize, circuitTable, roundRobin, addMinutes, emptyMatch,
    generateMatches, moveMatch, swapSides, sortByTime, newKO, templatePresets, templateLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
