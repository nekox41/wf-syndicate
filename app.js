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
    strategy: document.getElementById('page-strategy')
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
