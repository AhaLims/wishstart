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

// 一路往上都找不到星光值时给这么多。
//
// 为什么不能给 0：79 只首领化形态**全部**没有星光值，给 0 会让结果卡和流水写成
// 「抽到「圣光迪莫」获得 0 星光值」，看起来像坏掉了。
//
// 会落到这个兜底的是 57 只，它们是 **wiki 上还没标星光值的那几批**（44 只集中在
// 编号最大的 443-466，也就是最新那一批），不是「没星光的传说精灵」。等 wiki 补上
// 重启服务就自动跟着变，这里不用动。
const STAR_FALLBACK = 80;

// kind 是有损的单值（form 是 "lord|regional" 的会被压成 lord），所以要展示形态
// 必须从原始的 form 字段推，不能从 kind 反推。异色另算，见 formLabelOf()。
const FORM_LABELS = {
  main: '基础形态',
  'main|regional': '地区形态',
  regional: '地区形态',
  lord: '首领化',
  'lord|regional': '首领化 · 地区形态'
};

// 抽到特殊形态星光值翻倍，**身上每多一个特殊标签就再翻一倍**：
//   异色 / 地区形态 / 首领化 各一个标签 → 单标签 ×2
//   异色 + 首领化                      → ×4
//   首领化 + 地区形态                   → ×4
//   异色 + 首领化 + 地区形态            → ×8
// 图鉴上的值是基础值，乘完才是真正进账的数。
//
// 三个标签都叠满的在池子里只有 3 只（全 814 只），是概率最低那一档，**不封顶**：
// 封顶的话「两个标签 ×4、三个标签也 ×4」就成了要额外记的例外。
const SPECIAL_MULTIPLIER = 2;

// 每个标签各认各的，用白名单而不是「不等于 main」——
// form 字段哪天没给或者多出一个新值，白名单是「不加倍」，反着写是「全场翻倍」。
// 悄悄少给比悄悄多发好收拾。
//
// 三个集合要分开列，因为 form 是**复合字段**：`lord|regional` 是「首领化 + 地区
// 形态」两个标签，不是一个新的第三种形态（FORM_LABELS 里也是这么拼标签的）。
// 异色不看 form 看 kind：异色本体的 form 是 main（地区形态的异色 form 才是 regional）。
const REGIONAL_FORMS = new Set(['regional', 'main|regional', 'lord|regional']);
const LORD_FORMS = new Set(['lord', 'lord|regional']);

// 这只身上挂了几个特殊标签（0-3）。抽到时星光值按 SPECIAL_MULTIPLIER 的这次方翻。
function specialTagCount(raw) {
  let n = 0;
  if (raw.kind === 'shiny') n += 1;
  if (REGIONAL_FORMS.has(raw.form)) n += 1;
  if (LORD_FORMS.has(raw.form)) n += 1;
  return n;
}

function multiplierOf(raw) {
  return SPECIAL_MULTIPLIER ** specialTagCount(raw);
}

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
// 所以必须配 starFound 一起看，直接读 star 会误判 197 条。
//
// 自己没有值的**沿着层级往上找**，用上面那级的：
//   恶魔狼王（首领化，自己没值）→ 恶魔狼（本体，真值 80）        → 80
//   恶魔狼王的异色               → 恶魔狼王（没值）→ 恶魔狼（80） → 80
// 异色跟它普通颜色那版同分，是因为异色挂在那一版底下，往上找自然就找到同一级。
// 一路到顶都没有值（传说精灵整条进化线）→ STAR_FALLBACK。
function resolveStar(raw, rawById) {
  if (raw.starFound) {
    const s = parseInt(raw.star);
    if (Number.isFinite(s) && s >= 0) return s;
  }

  // guard 防数据里出现环（parentId 互相指）时转不出来
  let cur = raw;
  for (let guard = 0; cur && cur.parentId && guard < 16; guard++) {
    const parent = rawById.get(String(cur.parentId));
    if (!parent) break;
    if (parent.starFound) {
      const s = parseInt(parent.star);
      if (Number.isFinite(s) && s >= 0) return s;
    }
    cur = parent;
  }

  return STAR_FALLBACK;
}

// 把一条原始实体压成池子需要的形状；不合法返回 null（丢掉落单的行）
function normalize(raw, rawById) {
  if (!raw || !raw.id || !raw.number || !raw.name) return null;

  const star = resolveStar(raw, rawById);
  if (!Number.isFinite(star) || star < 0) return null;

  const name = String(raw.name);

  return {
    id: String(raw.id),
    number: String(raw.number),
    name,
    // 图鉴上的**基础**星光值，不含形态加成 —— 抽到手时是 star * starMultiplier
    star,
    kind: raw.kind || 'base',
    isShiny: raw.kind === 'shiny',
    isDefault: !!raw.isDefault,
    formLabel: formLabelOf(raw),
    // 抽到这只时星光值乘多少（1 / 2 / 4 / 8，见 specialTagCount）。乘的是下面的
    // star（图鉴上的基础值）。**抽到时要把这个数一起写进记录** —— 规则以后还会变，
    // 不存下来的话老记录会被新规则重算错（见 enrichDraw 的注释）
    starMultiplier: multiplierOf(raw),
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

  // 先建一份 id → 原始记录 的表：resolveStar() 要沿着 parentId 往上找，
  // 所以这一步必须先于 normalize，不能合并进同一个循环。
  const rawById = new Map();
  for (const raw of arr) {
    if (raw && raw.id) rawById.set(String(raw.id), raw);
  }

  const byId = new Map();
  for (const raw of arr) {
    const s = normalize(raw, rawById);
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
// 这条记录当时翻了几倍。**优先用记录里存的那份**，不能用池子现在的规则重算 ——
// 规则改过一次（原来不管几个标签都是 ×2，现在每多一个标签再翻一倍），拿新规则
// 去算老记录会算错：记录里存的 star 是当时实际进账的数，倍率一变，前端
// `star / starMultiplier` 除回去得到的基础星光值就跟着错。实测线上就有两条这样的
// 记录（一条异色+地区形态、一条首领化+地区形态），新规则下基础值会从 40 变成 10。
//
// 老记录没存倍率（本次改动之前抽的），用「进账 ÷ 图鉴基础值」反推：进账一定是
// 基础值乘某个倍率得来的，能整除就说明反推对了。图鉴值本身改过就推不出来，
// 那种情况当没翻倍 —— 显示成「就是这么多」总比显示一个错的基础值好。
const KNOWN_MULTIPLIERS = new Set([1, 2, 4, 8]);

function multiplierOfRecord(record, entity) {
  const stored = parseInt(record.starMultiplier);
  if (Number.isFinite(stored) && KNOWN_MULTIPLIERS.has(stored)) return stored;

  const base = entity ? parseInt(entity.star) : 0;
  const earned = parseInt(record.star);
  if (!base || !Number.isFinite(earned)) return 1;
  const ratio = earned / base;
  return KNOWN_MULTIPLIERS.has(ratio) ? ratio : 1;
}

function enrichDraw(record) {
  const e = resolveDrawEntity(record);
  return {
    id: e ? e.id : (record.id || null),
    number: record.number,
    name: record.name,
    // 本次获得的星光值（**已经乘过形态加成**）。跟图鉴上的值可能因数据更新而不同，
    // 所以按记录里的来 —— 注意它不等于 e.star，e.star 是基础值
    star: record.star,
    // 这次翻了几倍（1/2/4/8）。前端拿它决定要不要标「×N」、以及除回去算基础值，
    // 不用自己重推一遍规则。**看的是记录当时那份，不是池子现在的规则**
    starMultiplier: multiplierOfRecord(record, e),
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
  STAR_FALLBACK,
  SPECIAL_MULTIPLIER,
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
