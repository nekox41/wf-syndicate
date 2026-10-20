/* ================= 数据 ================= */
const SYN = {
  SM: { name:'钢铁防线',   allied:'RV', opposed:'NL', enemy:'PS' },
  AH: { name:'均衡仲裁者', allied:'CS', opposed:'PS', enemy:'RV' },
  CS: { name:'中枢苏达',   allied:'AH', opposed:'RV', enemy:'NL' },
  PS: { name:'佩兰数列',   allied:'NL', opposed:'AH', enemy:'SM' },
  RV: { name:'血色面纱',   allied:'SM', opposed:'CS', enemy:'AH' },
  NL: { name:'新世间',     allied:'PS', opposed:'SM', enemy:'CS' }
};
const ORDER = ['SM','AH','CS','PS','RV','NL'];

const REL_MARK  = { self:'—', allied:'盟', opposed:'对', enemy:'敌', neutral:'·' };
const REL_LABEL = { self:'获取', allied:'同盟', opposed:'对立', enemy:'敌对', neutral:'中立' };

function relationOf(from, to){
  if (from === to) return 'self';
  const s = SYN[from];
  if (s.allied  === to) return 'allied';
  if (s.opposed === to) return 'opposed';
  if (s.enemy   === to) return 'enemy';
  return 'neutral';
}

/* ================= 格式化 ================= */
function fmtNum(n){
  const r = Math.round(n * 10) / 10;
  const s = Math.abs(r).toLocaleString('en-US', { maximumFractionDigits:1 });
  if (r > 0) return '+' + s;
  if (r < 0) return '−' + s;
  return '0';
}
function fmtPlain(n){
  return n.toLocaleString('en-US', { maximumFractionDigits:0 });
}

/* 段位显示：0–29 数字；30 传奇；31–36 传奇1–6 */
function rankLabel(r){
  if (r <= 29) return String(r);
  if (r === 30) return '传奇';
  return '传奇' + (r - 30);
}

/* ================= 标签页切换 ================= */
(function(){
  const tabs  = document.querySelectorAll('.tab');
  const pages = {
    calc: document.getElementById('page-calc'),
    strategy: document.getElementById('page-strategy'),
    market: document.getElementById('page-market')
  };
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      Object.values(pages).forEach(p => p.classList.remove('active'));
      pages[t.dataset.tab].classList.add('active');
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });
})();

/* ================= 关系矩阵 ================= */
(function buildMatrix(){
  const table = document.getElementById('matrix');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = '集团';
  hr.appendChild(corner);
  ORDER.forEach(k => {
    const th = document.createElement('th');
    th.textContent = SYN[k].name;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  ORDER.forEach(from => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = SYN[from].name;
    tr.appendChild(th);
    ORDER.forEach(to => {
      const rel = relationOf(from, to);
      const td = document.createElement('td');
      td.className = 'c-' + rel;
      td.textContent = REL_MARK[rel];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
})();

/* ================= 轴切换 ================= */
(function(){
  const btns = document.querySelectorAll('#axisSwitch button');
  btns.forEach(b => {
    b.addEventListener('click', () => {
      btns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('.axis-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('axis-' + b.dataset.axis).classList.add('active');
    });
  });
})();

/* ================= 变化计算 ================= */
function compute(target, amount){
  const d = {};
  ORDER.forEach(k => d[k] = 0);
  d[target] += amount;
  const s = SYN[target];
  d[s.allied]  += amount * 0.5;
  d[s.opposed] -= amount * 0.5;
  d[s.enemy]   -= amount;
  return d;
}

function renderRows(tbodyId, target, deltas){
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  ORDER.forEach(k => {
    const rel = relationOf(target, k);
    const v = deltas[k];
    const cls = v > 0 ? 'pos' : (v < 0 ? 'neg' : 'zero');
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="rname">' + SYN[k].name + '</td>' +
      '<td><span class="rel-tag rel-' + rel + '">' + REL_LABEL[rel] + '</span></td>' +
      '<td class="num ' + cls + '">' + fmtNum(v) + '</td>';
    tbody.appendChild(tr);
  });
}

function summarize(deltas){
  let gain = 0, loss = 0;
  ORDER.forEach(k => {
    if (deltas[k] > 0) gain += deltas[k];
    if (deltas[k] < 0) loss += deltas[k];
  });
  return { gain, loss };
}

/* ================= 集团选择器 ================= */
function buildPicker(containerId, defaultKey, onChange){
  const box = document.getElementById(containerId);
  let current = defaultKey;
  ORDER.forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'syn-btn' + (k === current ? ' active' : '');
    btn.textContent = SYN[k].name;
    btn.dataset.key = k;
    btn.addEventListener('click', () => {
      current = k;
      Array.from(box.children).forEach(c => c.classList.toggle('active', c.dataset.key === k));
      onChange(current);
    });
    box.appendChild(btn);
  });
  onChange(current);
  return { get: () => current };
}

/* ================= 声望计算器 ================= */
const rankEl   = document.getElementById('rank');
const rankOut  = document.getElementById('rankOut');
const capOut   = document.getElementById('capOut');
const amountEl = document.getElementById('amount');
const capNote  = document.getElementById('capNote');

let currentSyn1 = 'NL';

function getCap(){ return 16000 + Number(rankEl.value) * 500; }

function refreshCap(){
  const cap = getCap();
  rankOut.textContent = rankLabel(Number(rankEl.value));
  capOut.textContent = fmtPlain(cap);
}

function recalc1(){
  const cap = getCap();
  let amount = Number(amountEl.value) || 0;
  let truncated = false;
  if (amount > cap){ amount = cap; truncated = true; }

  const deltas = compute(currentSyn1, amount);
  renderRows('resultBody', currentSyn1, deltas);

  const s = summarize(deltas);
  document.getElementById('sumGain').textContent = fmtNum(s.gain);
  document.getElementById('sumLoss').textContent = fmtNum(s.loss);

  const ratio = amount > 0 ? (s.gain / amount) : 0;
  document.getElementById('sumRatio').textContent = ratio.toFixed(2) + '×';

  if (truncated){
    capNote.style.display = 'block';
    capNote.textContent = '输入已超出每日上限 ' + fmtPlain(cap) + '，本次按上限结算。';
  } else {
    capNote.style.display = 'none';
  }
}

rankEl.addEventListener('input', () => { refreshCap(); recalc1(); });
amountEl.addEventListener('input', recalc1);

document.querySelectorAll('.presets [data-fill]').forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.fill;
    amountEl.value = (v === 'cap') ? getCap() : Number(v);
    recalc1();
  });
});

refreshCap();
buildPicker('synGrid', currentSyn1, key => { currentSyn1 = key; recalc1(); });

/* ================= 勋章计算器 ================= */
const MISSIONS_EL = document.getElementById('missions');
const MEDAL_TOTAL_EL = document.getElementById('medalTotal');
const medalRangeEl = document.getElementById('medalRange');
const medalNoteEl  = document.getElementById('medalNote');

const PER_MISSION = { min: 9500, exp: 10125, max: 12000 };
const MAX_MISSIONS = 9;   /* 3 个集团 × 3 任务 */
let currentSyn2 = 'NL';

function clampMissions(v){
  let n = Number(v);
  if (!Number.isFinite(n)) n = 1;
  n = Math.round(n);
  return Math.max(1, Math.min(MAX_MISSIONS, n));
}

function refreshMedalRange(){
  const n = clampMissions(MISSIONS_EL.value);
  const lo = PER_MISSION.min * n;
  const hi = PER_MISSION.max * n;
  medalRangeEl.textContent = fmtPlain(lo) + ' – ' + fmtPlain(hi);
  medalNoteEl.textContent = n + ' 个任务：期望 ' + fmtPlain(PER_MISSION.exp * n) +
    ' 枚，区间 ' + fmtPlain(lo) + ' – ' + fmtPlain(hi) + ' 枚。勋章不受每日上限限制。';
}

function recalc2(){
  let amount = Math.max(0, Number(MEDAL_TOTAL_EL.value) || 0);
  const deltas = compute(currentSyn2, amount);
  renderRows('resultBody2', currentSyn2, deltas);

  const s = summarize(deltas);
  document.getElementById('sumGain2').textContent = fmtNum(s.gain);
  document.getElementById('sumLoss2').textContent = fmtNum(s.loss);
}

MISSIONS_EL.addEventListener('input', () => {
  const n = clampMissions(MISSIONS_EL.value);
  MISSIONS_EL.value = n;
  MEDAL_TOTAL_EL.value = Math.round(PER_MISSION.exp * n);
  refreshMedalRange();
  recalc2();
});
MEDAL_TOTAL_EL.addEventListener('input', recalc2);

document.querySelectorAll('.presets [data-mission]').forEach(btn => {
  btn.addEventListener('click', () => {
    MISSIONS_EL.value = btn.dataset.mission;
    MISSIONS_EL.dispatchEvent(new Event('input'));
  });
});

document.querySelectorAll('.presets [data-medal]').forEach(btn => {
  btn.addEventListener('click', () => {
    const n = clampMissions(MISSIONS_EL.value);
    const type = btn.dataset.medal;
    MEDAL_TOTAL_EL.value = Math.round(PER_MISSION[type] * n);
    recalc2();
  });
});

refreshMedalRange();
buildPicker('synGrid2', currentSyn2, key => { currentSyn2 = key; recalc2(); });

/* 初始化 */
recalc1();

/* ================= 集团交易物品 ================= */
(function(){
  const container = document.getElementById('marketGroups');
  const select = document.getElementById('marketSyndicate');
  let groups = {};
  const status = document.getElementById('marketStatus');
  const retry = document.getElementById('marketRetry');
  const cache = new Map();
  const views = [];
  let items = [];
  let period = '48hours';
  let initializing = false;
  let initialized = false;
  let loading = false;
  let snapshotTime = null;
  let snapshotError = false;
  let snapshotProgress = '';

  function nameOf(item){ return item.i18n?.['zh-hans']?.name || item.i18n?.en?.name || item.slug; }
  function dataOf(item){ return cache.get(item.slug) || {}; }
  function element(tag, className, text){
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function buildGroup(){
    container.replaceChildren();
    views.length = 0;
    const group = groups[select.value];
    items = [...new Map(group.favours.map(item => [item.slug, item])).values()];
    const section = element('section', 'market-group');
    const heading = element('div', 'market-heading');
    heading.appendChild(element('h2', '', group.name));
    heading.appendChild(element('span', 'market-count', group.favours.length + ' 件可交易物品'));
    section.appendChild(heading);
    const grid = element('div', 'market-grid');
    const cards = group.favours.map(item => {
      const card = element('article', 'market-card');
      const link = element('a', 'market-item-link');
      link.href = 'https://warframe.market/items/' + encodeURIComponent(item.slug);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.appendChild(element('span', 'market-item-name', nameOf(item)));
      card.appendChild(link);
      card.appendChild(element('p', 'market-standing', fmtPlain(item.standingCost) + ' 声望'));
      const metrics = element('div', 'market-metrics');
      const volume = element('span', 'market-volume');
      const price = element('span', 'market-price');
      metrics.appendChild(volume);
      metrics.appendChild(price);
      card.appendChild(metrics);
      grid.appendChild(card);
      return { item, card, volume, price };
    });
    section.appendChild(grid);
    if (!cards.length) section.appendChild(element('p', 'market-empty', '暂无可交易物品'));
    container.appendChild(section);
    views.push({ grid, cards });
  }
  function render(){
    for (const view of views){
      const sorted = [...view.cards].sort((a, b) =>
        (dataOf(b.item).statistics?.[period] ?? -1) - (dataOf(a.item).statistics?.[period] ?? -1) ||
        nameOf(a.item).localeCompare(nameOf(b.item), 'zh-CN'));
      for (const { item, card, volume, price } of sorted){
        const data = dataOf(item);
        volume.textContent = data.statistics ? '销量 ' + fmtPlain(data.statistics[period]) : data.statisticsError ? '销量加载失败' : '销量 —';
        volume.title = period === '48hours' ? '48 小时销量' : '90 天销量';
        price.title = data.ordersError && data.orders !== undefined ? '本次更新失败，显示上次成功报价：' + (data.ordersUpdatedAt || '') : '首位卖单报价';
        if (data.statisticsError && data.statistics) volume.title += ' · 本次更新失败，显示上次成功数据：' + (data.statisticsUpdatedAt || '');
        price.textContent = data.orders === null ? '暂无卖单' : data.orders !== undefined ? fmtPlain(data.orders) + 'P' : data.ordersError ? '价格加载失败' : '—P';
        view.grid.appendChild(card);
      }
    }
    let complete = 0, failed = 0;
    for (const item of items){
      const data = dataOf(item);
      if (data.statistics && data.orders !== undefined) complete++;
      if (data.statisticsError || data.ordersError) failed++;
    }
    const timeLabel = snapshotTime ? new Date(snapshotTime).toLocaleString('zh-CN') : '尚未生成';
    status.textContent = '已加载 ' + complete + ' / ' + items.length + ' 种物品 · 行情更新：' + timeLabel + snapshotProgress +
      (failed ? ' · ' + failed + ' 种数据更新失败，已有数据保留。' : '') +
      (snapshotError ? ' · 无法读取行情文件，请运行更新脚本后重新读取。' : '') +
      (snapshotTime && Date.now() - Date.parse(snapshotTime) > 2 * 3600000 ? ' · 行情已超过 2 小时未更新。' : '');
    retry.disabled = loading;
  }
  async function load(){
    if (loading || !initialized) return;
    loading = true;
    retry.disabled = true;
    try {
      const response = await fetch('market-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('market-data.json unavailable');
      const snapshot = await response.json();
      if (snapshot.schemaVersion !== 1 || !snapshot.items || typeof snapshot.items !== 'object' || Array.isArray(snapshot.items) || !Number.isFinite(Date.parse(snapshot.updatedAt))) throw new Error('Invalid snapshot');
      const records = new Map();
      for (const [slug, record] of Object.entries(snapshot.items)){
        if (!record || typeof record !== 'object') throw new Error('Invalid item record');
        const data = {};
        if (record.statistics && ['48hours', '90days'].every(k => Number.isFinite(record.statistics[k]) && record.statistics[k] >= 0)) data.statistics = record.statistics;
        if (record.orders === null || (Number.isFinite(record.orders) && record.orders >= 0)) data.orders = record.orders;
        data.statisticsError = record.statisticsError || !data.statistics;
        data.ordersError = record.ordersError || data.orders === undefined;
        data.statisticsUpdatedAt = record.statisticsUpdatedAt;
        data.ordersUpdatedAt = record.ordersUpdatedAt;
        records.set(slug, data);
      }
      cache.clear();
      for (const [slug, data] of records) cache.set(slug, data);
      snapshotTime = snapshot.updatedAt;
      snapshotProgress = !snapshot.completedAt && Number.isFinite(snapshot.processed) && Number.isFinite(snapshot.total) ? ' · 后台抓取中 ' + snapshot.processed + '/' + snapshot.total : '';
      snapshotError = false;
    } catch { snapshotError = true; }
    finally { loading = false; render(); }
  }
  async function init(){
    if (initializing) return;
    if (initialized) { render(); load(); return; }
    initializing = true;
    status.textContent = '正在读取集团物品…';
    retry.disabled = true;
    try {
      const response = await fetch('items.json');
      if (!response.ok) throw new Error('items.json unavailable');
      groups = await response.json();
      select.replaceChildren();
      for (const [key, group] of Object.entries(groups)){
        const option = element('option', '', group.name + '（' + group.favours.length + '）');
        option.value = key;
        select.appendChild(option);
      }
      buildGroup();
      initialized = true;
      render();
      load();
    } catch {
      status.textContent = '无法读取物品数据，请通过静态服务器访问网页后重试。';
      retry.disabled = false;
    } finally { initializing = false; }
  }
  document.querySelector('[data-tab="market"]').addEventListener('click', init);
  select.addEventListener('change', () => {
    if (!initialized) return;
    buildGroup();
    render();
  });
  document.querySelectorAll('[data-period]').forEach(button => {
    button.addEventListener('click', () => {
      period = button.dataset.period;
      document.querySelectorAll('[data-period]').forEach(b => {
        b.classList.toggle('active', b === button);
        b.setAttribute('aria-pressed', String(b === button));
      });
      if (initialized) render();
    });
  });
  retry.addEventListener('click', () => {
    if (!initialized) init();
    else load();
  });
  // Re-read the generated file hourly while this page remains open.
  setInterval(() => { if (initialized) load(); }, 3600000);
})();
