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
const item = slug => ({ slug, i18n: { en: { name: slug } }, standingCost: 25000 });
const groups = {
  A: { name: 'A', favours: [item('alpha'), item('beta')] },
  B: { name: 'B', favours: [item('alpha')] },
  C: { name: 'Empty', favours: [] }
};
let snapshot = { schemaVersion: 1, updatedAt: new Date().toISOString(), completedAt: 'done', items: {
  alpha: { statistics: { '48hours': 3, '90days': 90 }, orders: 30 },
  beta: { statistics: { '48hours': 11, '90days': 20 }, orders: null }
} };
let fail = false;
const calls = [];
const timers = [];
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').split('/* ================= 集团交易物品 ================= */')[1];
vm.runInNewContext(source, {
  document: {
    getElementById: id => ids[id], querySelector: () => tab, querySelectorAll: () => buttons,
    createElement: tag => { assert.notEqual(tag, 'img', 'market must not create image nodes'); return new Element(tag); }
  },
  fetch: async url => {
    calls.push(url);
    assert.ok(['items.json', 'market-data.json'].includes(url), 'no direct API requests');
    return { ok: url === 'items.json' || !fail, json: async () => url === 'items.json' ? groups : snapshot };
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
  assert.equal(ids.marketGroups.children.length, 1);
  assert.equal(grid().children.length, 2);
  assert.equal(name(grid().children[0]), 'beta');
  assert.equal(grid().children[0].children[2].children[1].textContent, '暂无卖单');
  const requests = calls.length;
  select('B');
  assert.equal(ids.marketGroups.children.length, 1);
  assert.equal(grid().children.length, 1);
  assert.equal(name(grid().children[0]), 'alpha');
  assert.equal(calls.length, requests, 'group switching must reuse the snapshot');
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
  console.log('PASS: selected group only, no images, group changes reuse snapshot, empty group, both sorts, failed/invalid reload preserves data');
})().catch(error => { console.error(error); process.exitCode = 1; });
