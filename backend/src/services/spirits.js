// 精灵池：星光值任务的抽奖来源（《洛克王国：世界》wiki 图鉴的采集数据）
//
// 数据不在这个项目里，采集脚本在 nrc-scraper，所以路径现在是写死的绝对路径。
// 等 data/ 和 images/ 拷进项目之后再换成相对路径（只需要改 DATA_DIR 这一行）。
//
// **名单在进程启动时读一次就定下来。** 精灵图鉴基本是固定的（大概两个月
// 更新一次），所以不值得每次抽奖都去 statSync 两下看看文件改没改 ——
// 那是每个请求都要付的固定开销，而收益一年也兑现不了几次。
// 采集脚本更新了数据之后要重启服务才会生效；不想重启就调 reloadSpirits()。
//
// 池子按**实体**（id）建，不是按编号。同一个编号下挂着本体、地区形态、首领化、
// 异色四种实体，它们共用编号、各有独立的详情页和立绘 —— 所以异色和形态也都是
// 能单独抽到的一只，跟本体等权。466 个编号 → 814 个实体。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.NRC_DATA_DIR || 'C:/data/code/nrc-scraper';

// 主表。旧版的 data/spirits.jsonl / spirits.json 采集脚本已经不再生成了，
// 回头去读它们等于池子永远是空的。
const ENTITIES_FILE = path.join(DATA_DIR, 'data', 'entities.json');

// 图片根目录：头像 heads/、普通立绘 art/、异色立绘 shiny/ 都在它下面。
// 所以只挂这一个静态目录就够，URL 靠子路径区分。
const IMAGES_DIR = path.join(DATA_DIR, 'images');

// 前端拿图片用的 URL 前缀，跟 app.js 里挂的静态目录对应
const SPIRITS_URL_PREFIX = '/spirits';
const HEADS_URL_PREFIX = `${SPIRITS_URL_PREFIX}/heads`;
const ART_URL_PREFIX = `${SPIRITS_URL_PREFIX}/art`;
const SHINY_URL_PREFIX = `${SPIRITS_URL_PREFIX}/shiny`;

// 「本来就没有星光值」的实体，在连本体也没值的时候兜底给这么多。
// 为什么不能给 0：64 只首领化形态**全部**没有星光值，给 0 会让结果卡和流水写成
// 「抽到「圣光迪莫」获得 0 星光值」，看起来像坏掉了。
const STAR_FLOOR = 16;

// kind 是有损的单值（form 是 "lord|regional" 的会被压成 lord），所以要展示形态
// 必须从原始的 form 字段推，不能从 kind 反推。异色另算，见 formLabelOf()。
const FORM_LABELS = {
  main: '基础形态',
  'main|regional': '地区形态',
  regional: '地区形态',
  lord: '首领化',
  'lord|regional': '首领化 · 地区形态'
};

// 启动时填一次，之后一直是它（见文件头注释）
let cache = null;

function getImagesDir() {
  return IMAGES_DIR;
}

// 文件名里出现的 Windows 非法字符要替换掉，跟采集脚本的 safeName 规则一致
function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
}

// 图片在前端的 URL。实体里存的是相对数据根目录的路径（images/heads/001_迪莫.png），
// 这里只取文件名，目录决定挂哪个前缀。中文和全角括号交给 encodeURIComponent。
function imageUrlFor(relFile) {
  if (!relFile) return null;
  const parts = String(relFile).split('/');
  const file = parts[parts.length - 1];
  const dir = parts.length > 1 ? parts[parts.length - 2] : '';
  const prefix = dir === 'shiny' ? SHINY_URL_PREFIX
    : dir === 'art' ? ART_URL_PREFIX
      : HEADS_URL_PREFIX;
  return `${prefix}/${encodeURIComponent(file)}`;
}

// 形态标签，弹窗里显示。「异色」要单独加：wiki 上异色不是独立条目，名字和头像
// 都跟本体一模一样，不给这个标签用户分不出卡片上那两只是不是同一只。
function formLabelOf(raw) {
  const parts = FORM_LABELS[raw.form] ? [FORM_LABELS[raw.form]] : [];
  if (raw.kind === 'shiny') parts.push('异色');
  return parts.length ? parts.join(' · ') : '基础形态';
}

// 这只精灵算多少星光值。
//
// 关键：starFound 为 false 时 star 字段是占位的 80，不是真值（814 条里有 136 条），
// 所以必须配 starFound 一起看。这些实体换成本体的值：
//   - 本体（同编号的默认卡）有星光值 → 用本体的。首领化形态走这条，比如圣光迪莫
//     按迪莫的 80 算 —— 这是个有依据的数，不是我随手定的。
//   - 本体也没有（传说精灵整条进化线）→ 保底 16。
function resolveStar(raw, defaultStarByNumber) {
  if (raw.starFound) {
    const s = parseInt(raw.star);
    if (Number.isFinite(s) && s >= 0) return s;
  }
  const fallback = defaultStarByNumber.get(String(raw.number));
  return Number.isFinite(fallback) ? fallback : STAR_FLOOR;
}

// 把一条原始实体压成池子需要的形状；不合法返回 null（丢掉落单的行）
function normalize(raw, defaultStarByNumber) {
  if (!raw || !raw.id || !raw.number || !raw.name) return null;

  const star = resolveStar(raw, defaultStarByNumber);
  if (!Number.isFinite(star) || star < 0) return null;

  const name = String(raw.name);

  return {
    id: String(raw.id),
    number: String(raw.number),
    name,
    star,
    kind: raw.kind || 'base',
    isShiny: raw.kind === 'shiny',
    isDefault: !!raw.isDefault,
    formLabel: formLabelOf(raw),
    // 详情弹窗要的
    desc: raw.desc || null,
    kicker: raw.kicker || null,
    // 属性是复合字段（"恶|翼"），这里就拆好，省得前端每处都记得拆
    types: raw.type ? String(raw.type).split('|').filter(Boolean) : [],
    stage: raw.stage || null,
    season: raw.season && raw.season !== 'none' ? raw.season : null,
    headUrl: imageUrlFor(raw.headFile || `images/heads/${raw.number}_${safeName(name)}.png`),
    // 非异色读 art/，异色读 shiny/ —— imageUrlFor 按路径里的目录自动挑前缀
    artUrl: imageUrlFor(raw.artFile)
  };
}

function readSpirits() {
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(ENTITIES_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  // 先把「同编号默认卡的星光值」整张表建出来，归一化时要用它给没有星光值的实体
  // 兜底。这一步必须先于 normalize，所以不能合并进同一个循环。
  const defaultStarByNumber = new Map();
  for (const raw of arr) {
    if (!raw || !raw.isDefault || !raw.starFound) continue;
    const s = parseInt(raw.star);
    if (Number.isFinite(s) && s >= 0) defaultStarByNumber.set(String(raw.number), s);
  }

  const byId = new Map();
  for (const raw of arr) {
    const s = normalize(raw, defaultStarByNumber);
    if (s) byId.set(s.id, s);
  }
  return [...byId.values()];
}

// 建三份索引：列表本身、按 id 查、按编号查默认卡（后者给旧记录兜底用）
function build() {
  const list = readSpirits();
  const byId = new Map();
  const defaultByNumber = new Map();
  for (const s of list) {
    byId.set(s.id, s);
    if (s.isDefault) defaultByNumber.set(s.number, s);
  }
  return { list, byId, defaultByNumber };
}

// 当前池子。第一次调用才读盘（模块加载时已经调用过一次，所以正常就是直接返回）。
function loadSpirits() {
  if (cache === null) cache = build();
  return cache.list;
}

// 重新读一遍。采集脚本更新了名单又不想重启服务时用，平时用不到。
function reloadSpirits() {
  cache = build();
  return cache.list;
}

function byId(id) {
  if (!id) return null;
  loadSpirits();
  return cache.byId.get(String(id)) || null;
}

// 把一条抽到记录还原成池子里的实体。
//
// 记录里存了 id，直接查即可。**但本次改动之前记下的老记录只有编号没有 id**，
// 那些退回按编号找默认卡 —— 老记录本来记的就是按编号抽的那一只，语义正好对上。
function resolveDrawEntity(record) {
  if (!record) return null;
  loadSpirits();
  return cache.byId.get(String(record.id)) ||
    (record.number ? cache.defaultByNumber.get(String(record.number)) || null : null);
}

// 把一条抽到记录补全成前端直接能用的形状：详情（立绘、介绍、属性…）在读取时现查
// 池子，而不是记在流水里。这样图鉴数据更新之后详情跟着新，记录本身也不臃肿。
// 查不到的（比如池子换了一批数据）就把能给的给出去，缺的字段前端会退化成不显示。
function enrichDraw(record) {
  const e = resolveDrawEntity(record);
  return {
    id: e ? e.id : (record.id || null),
    number: record.number,
    name: record.name,
    // 本次获得的星光值。跟图鉴上的值可能因数据更新而不同，所以按记录里的来
    star: record.star,
    headUrl: record.headUrl || (e ? e.headUrl : null),
    at: record.at,
    // 小卡片上区分异色用
    isShiny: e ? e.isShiny : false,
    formLabel: e ? e.formLabel : null,
    // 详情弹窗要的
    artUrl: e ? e.artUrl : null,
    desc: e ? e.desc : null,
    kicker: e ? e.kicker : null,
    types: e ? e.types : [],
    stage: e ? e.stage : null,
    season: e ? e.season : null
  };
}

// 从还没抽到过的精灵里等概率抽一只；全抽完了返回 null
function drawSpirit(excludeIds = new Set()) {
  const pool = loadSpirits().filter((s) => !excludeIds.has(s.id));
  if (!pool.length) return null;
  return pool[crypto.randomInt(pool.length)];
}

// 池子里还剩多少只没抽到
function countRemaining(excludeIds = new Set()) {
  return loadSpirits().filter((s) => !excludeIds.has(s.id)).length;
}

// 池子总共有多少只。用来区分「今天真的抽完了」和「数据压根没读出来」——
// 这两种情况在 drawSpirit 看来都是 null，但对用户是完全不同的两件事。
function countTotal() {
  return loadSpirits().length;
}

// 模块加载时就把名单读进来 —— 这才是「启动时解析」。
// 放在文件末尾是为了让上面所有函数都定义好。
loadSpirits();

module.exports = {
  DATA_DIR,
  STAR_FLOOR,
  SPIRITS_URL_PREFIX,
  HEADS_URL_PREFIX,
  ART_URL_PREFIX,
  SHINY_URL_PREFIX,
  getImagesDir,
  imageUrlFor,
  loadSpirits,
  reloadSpirits,
  byId,
  resolveDrawEntity,
  enrichDraw,
  drawSpirit,
  countRemaining,
  countTotal
};
