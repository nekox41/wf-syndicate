// DOM simulation: verify filtering and data handling without browser dependencies.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

class Element {
  constructor(tag){
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.classList = { toggle(){} };
    this.properties = {};
    this.style = { setProperty: (key, value) => { this.properties[key] = value; } };
  }
  appendChild(child){
    if (child.parent) child.parent.children = child.parent.children.filter(node => node !== child);
    this.children.push(child);
    child.parent = this;
    if (this.tag === 'select' && !this.value) this.value = child.value;
    return child;
  }
  replaceChildren(){ this.children = []; }
  addEventListener(type, callback){ this.listeners[type] = callback; }
  setAttribute(){}
}

const ids = Object.fromEntries(['marketGroups', 'marketStatus', 'marketRetry', 'marketSyndicate'].map(id => [id, new Element(id === 'marketSyndicate' ? 'select' : 'div')]));
const tab = new Element('button');
const buttons = ['48hours', '90days'].map(period => {
  const button = new Element('button');
  button.dataset.period = period;
  return button;
});
const rankButtons = ['0', 'max'].map(rank => {
  const button = new Element('button');
  button.dataset.rank = rank;
  return button;
});
const item = slug => ({ slug, maxRank: slug === 'alpha' ? 3 : 0, i18n: { en: { name: slug } }, standingCost: 25000 });
const groups = {
  A: { name: 'A', colour: { value: '0x00D3E4E7' }, backgroundColour: { value: '0x003A3843' }, favours: [item('alpha'), item('beta')] },
  B: { name: 'B', favours: [item('alpha')] },
  C: { name: 'Empty', favours: [] }
};
let snapshot = { schemaVersion: 2, updatedAt: new Date().toISOString(), completedAt: 'done', items: {
  alpha: { maxRank: 3, ranks: { '0': { statistics: { '48hours': 3, '90days': 90 }, orders: 30 }, '3': { statistics: { '48hours': 20, '90days': 900 }, orders: 50 } } },
  beta: { maxRank: 0, ranks: { '0': { statistics: { '48hours': 11, '90days': 20 }, orders: null } } }
} };
let fail = false;
const calls = [];
const timers = [];
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').split('/* ================= 集团交易物品 ================= */')[1];
vm.runInNewContext(source, {
  document: {
    getElementById: id => ids[id], querySelector: () => tab, querySelectorAll: selector => selector === '[data-rank]' ? rankButtons : buttons,
    createElement: tag => { assert.notEqual(tag, 'img', 'market must not create image nodes'); return new Element(tag); }
  },
  fetch: async url => {
    calls.push(url);
    assert.ok(['allitems.json', 'market-data.json'].includes(url), 'no direct API requests');
    return { ok: url === 'allitems.json' || !fail, json: async () => url === 'allitems.json' ? groups : snapshot };
  },
  Map, Date, fmtPlain: String, setInterval: (fn, interval) => timers.push({ fn, interval })
});
const settle = async () => { for (let n = 0; n < 15; n++) await new Promise(resolve => setImmediate(resolve)); };
const grid = () => ids.marketGroups.children[0].children[1];
const name = card => card.children[0].children[0].textContent;
const select = key => { ids.marketSyndicate.value = key; ids.marketSyndicate.listeners.change(); };

(async () => {
  await tab.listeners.click();
  await settle();
  assert.equal(ids.marketSyndicate.children.length, 3);
  assert.equal(ids.marketGroups.children[0].properties['--group-ink'], '#D3E4E7');
  assert.equal(ids.marketGroups.children[0].properties['--group-paper'], '#3A3843');
  assert.equal(ids.marketGroups.children.length, 1);
  assert.equal(grid().children.length, 2);
  assert.equal(name(grid().children[0]), 'beta');
  assert.equal(grid().children[0].children[2].children[1].textContent, '暂无卖单');
  rankButtons[1].listeners.click();
  assert.equal(name(grid().children[0]), 'alpha');
  assert.equal(grid().children[0].children[2].children[0].textContent, '销量 20');
  assert.equal(grid().children[0].children[2].children[1].textContent, '50P');
  assert.equal(grid().children[1].children[2].children[0].textContent, '销量 11');
  rankButtons[0].listeners.click();
  assert.equal(name(grid().children[0]), 'beta');
  const requests = calls.length;
  select('B');
  assert.equal(ids.marketGroups.children.length, 1);
  assert.equal(grid().children.length, 1);
  assert.equal(name(grid().children[0]), 'alpha');
  assert.equal(calls.length, requests, 'group switching must reuse the snapshot');
  assert.equal(ids.marketGroups.children[0].properties['--group-ink'], '#111111');
  select('C');
  assert.equal(grid().children.length, 0);
  assert.equal(ids.marketGroups.children[0].children[2].textContent, '暂无可交易物品');
  select('A');
  buttons[1].listeners.click();
  assert.equal(name(grid().children[0]), 'alpha');
  assert.equal(grid().children[0].children[2].children[1].textContent, '30P');
  fail = true;
  ids.marketRetry.listeners.click(); await settle();
  assert.match(ids.marketStatus.textContent, /无法读取行情文件/);
  assert.equal(grid().children[0].children[2].children[1].textContent, '30P');
  fail = false;
  snapshot = { ...snapshot, items: { alpha: null } };
  ids.marketRetry.listeners.click(); await settle();
  assert.equal(grid().children[0].children[2].children[1].textContent, '30P');
  assert.equal(timers[0].interval, 3600000);
  console.log('PASS: selected group only, no images, group colours, 0/max rank sorting and prices, unranked reuse, group switching, empty group, failed/invalid reload preserves data');
})().catch(error => { console.error(error); process.exitCode = 1; });
