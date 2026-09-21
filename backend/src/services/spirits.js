// 精灵池：星光值任务的抽奖来源（《洛克王国：世界》wiki 图鉴的采集数据）
//
// 数据不在这个项目里，采集脚本在 nrc-scraper，所以路径现在是写死的绝对路径。
// 等 data/ 和 images/ 拷进项目之后再换成相对路径（只需要改下面这一行）。
//
// 每次抽奖都实时读盘（靠 mtime+size 判断要不要重新解析），
// 所以采集脚本还在跑的时候，新爬到的精灵不用重启服务就能进池子。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.NRC_DATA_DIR || 'C:/data/code/nrc-scraper';

const JSONL_FILE = path.join(DATA_DIR, 'data', 'spirits.jsonl');
const JSON_FILE = path.join(DATA_DIR, 'data', 'spirits.json');
const HEADS_DIR = path.join(DATA_DIR, 'images', 'heads');

// 前端拿头像用的 URL 前缀，跟 app.js 里挂的静态目录对应
const HEADS_URL_PREFIX = '/spirits/heads';

let cache = { key: '', spirits: [] };

function getHeadsDir() {
  return HEADS_DIR;
}

// 头像文件名里出现的 Windows 非法字符要替换掉，跟采集脚本（fixup-names.mjs 的 safeName）规则一致
function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
}

function headFileFor(number, name) {
  return `images/heads/${number}_${safeName(name)}.png`;
}

// 头像在前端的 URL。文件名本身带编号和名称，直接拼即可；
// 中文和全角括号交给 encodeURIComponent。
function headUrlFor(spirit) {
  return `${HEADS_URL_PREFIX}/${encodeURIComponent(path.basename(headFileFor(spirit.number, spirit.name)))}`;
}

// 两个候选数据文件的 mtime + size 拼成一个 key。
// 变了就说明采集脚本写了新东西，重新解析一遍。
function sourceKey() {
  return [JSONL_FILE, JSON_FILE].map((f) => {
    try {
      const s = fs.statSync(f);
      return `${path.basename(f)}:${s.mtimeMs}:${s.size}`;
    } catch (e) {
      return `${path.basename(f)}:-`;
    }
  }).join('|');
}

// 把一条原始记录压成池子需要的形状；不合法返回 null（丢掉落单的行）
function normalize(raw) {
  if (!raw || !raw.number || !raw.name) return null;

  const star = parseInt(raw.star);
  if (!Number.isFinite(star) || star < 0) return null;

  return {
    number: String(raw.number),
    name: String(raw.name),
    star,
    headFile: raw.headFile || headFileFor(raw.number, raw.name)
  };
}

// jsonl 是采集过程中实时追加的，json 要等整轮采集结束才生成（可能落后一大截），
// 所以优先读 jsonl，读不出东西再退回 json。
function parseSpirits(text, isJsonl) {
  const byNumber = new Map();

  if (isJsonl) {
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let raw;
      try {
        raw = JSON.parse(t);
      } catch (e) {
        // 采集脚本正好写到一半，这一行跳过
        continue;
      }
      const s = normalize(raw);
      // 同一编号重复出现时以后面的为准（断点续传会重写同一行）
      if (s) byNumber.set(s.number, s);
    }
    return [...byNumber.values()];
  }

  let arr;
  try {
    arr = JSON.parse(text);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  for (const raw of arr) {
    const s = normalize(raw);
    if (s) byNumber.set(s.number, s);
  }
  return [...byNumber.values()];
}

function readSpirits() {
  for (const [file, isJsonl] of [[JSONL_FILE, true], [JSON_FILE, false]]) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      continue;
    }
    const spirits = parseSpirits(text, isJsonl);
    if (spirits.length) return spirits;
  }
  return [];
}

// 当前池子（带缓存：数据文件没变就直接复用上次解析的结果）
function loadSpirits() {
  const key = sourceKey();
  if (key !== cache.key) {
    cache = { key, spirits: readSpirits() };
  }
  return cache.spirits;
}

// 从还没抽到过的精灵里等概率抽一只；全抽完了返回 null
function drawSpirit(excludeNumbers = new Set()) {
  const pool = loadSpirits().filter((s) => !excludeNumbers.has(s.number));
  if (!pool.length) return null;
  return pool[crypto.randomInt(pool.length)];
}

// 池子里还剩多少只没抽到
function countRemaining(excludeNumbers = new Set()) {
  return loadSpirits().filter((s) => !excludeNumbers.has(s.number)).length;
}

// 池子总共有多少只。用来区分「今天真的抽完了」和「数据压根没读出来」——
// 这两种情况在 drawSpirit 看来都是 null，但对用户是完全不同的两件事。
function countTotal() {
  return loadSpirits().length;
}

module.exports = {
  DATA_DIR,
  HEADS_URL_PREFIX,
  getHeadsDir,
  headFileFor,
  headUrlFor,
  loadSpirits,
  drawSpirit,
  countRemaining,
  countTotal
};
