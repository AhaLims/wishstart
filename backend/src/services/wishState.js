// 统一管理愿望的状态流转（收集中 / 已集满待合成 / 已完成 / 已过期）与「通用型愿望」。
//
// 背景：愿望集满后会停在 ready 无限期等待合成；这里给它加上 7 天有效期，
// 逾期转为 expired。同时每个用户有且只有一个通用型愿望：无碎片上限、无过期时间、
// 不参与「已完成」计数，每次「实现」由用户指定消耗多少碎片。
//
// 所有会读写愿望状态的接口（愿望、抽卡、统计）都应经过这里的懒更新函数，
// 避免多个接口各自判断过期、把状态写歪。

const { v4: uuidv4 } = require('uuid');
// 进程内互斥，保护「首次创建通用愿望」这类读-改-写窗口。
// Redis 模式下的重复创建由 ensureGeneralWish 去重兜底。
const { withLock } = require('../utils/lock');

const PREFIX = 'wishstar:wish';
const INDEX_PREFIX = 'wishstar:wishes:index';

// 集满后的有效期，默认 7 天。测试时可用环境变量缩短（如 15000 = 15 秒）。
const READY_TTL_MS = Number(process.env.WISH_READY_TTL_MS) || 7 * 24 * 3600 * 1000;

const WISH_TYPE_NORMAL = 'normal';
const WISH_TYPE_GENERAL = 'general';

// 价格换算：多少元 = 1 个碎片。用户填的是价格，实际攒的仍是碎片。
const YUAN_PER_FRAGMENT = Number(process.env.WISH_YUAN_PER_FRAGMENT) || 5;

// 通用型愿望的固定属性
const GENERAL_WISH_NAME = '通用愿望';
const GENERAL_WISH_ICON = '🌟';

// ---------- 纯函数（无 IO） ----------

// 历史数据没有 wish_type 字段，一律按普通愿望处理
function isGeneralWish(wish) {
  return !!wish && wish.wish_type === WISH_TYPE_GENERAL;
}

// 通用型愿望没有上限，返回 0 表示「无分母」。
// 注意：绝不能用 Infinity —— JSON 序列化后会变成 null。
function getTotalFragments(wish) {
  if (isGeneralWish(wish)) return 0;
  const total = parseInt(wish && wish.total_fragments, 10);
  return Number.isNaN(total) ? 10 : total;
}

// 价格 → 碎片数：不足一个碎片的余数向上取整，
// 这样攒满时实际价值不会低于标价（12 元 = 3 个碎片 = 15 元，而不是只换到 10 元的东西）。
function priceToFragments(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.ceil(p / YUAN_PER_FRAGMENT);
}

// 碎片数 → 价格（向上取整后的碎片所对应的价值）
function fragmentsToPrice(fragments) {
  const n = parseInt(fragments, 10);
  if (Number.isNaN(n)) return 0;
  return n * YUAN_PER_FRAGMENT;
}

// 愿望价格（元）。通用愿望没有价格，返回 null。
// 本次改动之前建的愿望没有存 price，按碎片数反推，保证老数据也能显示价格。
function getWishPrice(wish) {
  if (!wish || isGeneralWish(wish)) return null;
  const stored = parseInt(wish.price, 10);
  if (!Number.isNaN(stored)) return stored;
  return fragmentsToPrice(getTotalFragments(wish));
}

function getCurrentFragments(wish) {
  const current = parseInt(wish && wish.current_fragments, 10);
  return Number.isNaN(current) ? 0 : current;
}

// 通用型愿望永远不会「集满」
function isWishFull(wish) {
  if (isGeneralWish(wish)) return false;
  return getCurrentFragments(wish) >= getTotalFragments(wish);
}

// 抽卡候选池的唯一判据：收集中且未集满
function isDrawEligible(wish) {
  return !!wish && !!wish.id && wish.status === 'collecting' && !isWishFull(wish);
}

// 碎片展示：通用愿望只显示当前数量，不带分母
function formatFragments(wish) {
  const current = getCurrentFragments(wish);
  if (isGeneralWish(wish)) return `${current}`;
  return `${current}/${getTotalFragments(wish)}`;
}

// ---------- IO ----------

// 全项目唯一的 collecting -> ready 转换点。
// 仅当当前不是 ready 时才写时间戳，防止反复抽卡给已集满的愿望续期。
async function markWishReady(store, wish, nowMs) {
  if (!wish || !wish.id) return wish;
  if (isGeneralWish(wish)) return wish;

  const now = nowMs || Date.now();
  const updates = { updated_at: String(now) };

  if (wish.status !== 'ready') {
    updates.status = 'ready';
    updates.ready_at = String(now);
    updates.expires_at = String(now + READY_TTL_MS);
  }

  await store.hset(`${PREFIX}:${wish.id}`, updates);

  const latest = await store.hgetall(`${PREFIX}:${wish.id}`);
  return (latest && latest.id) ? latest : { ...wish, ...updates };
}

// 懒过期：读取愿望时顺手把该过期的标记掉，返回最新的愿望对象。
// 调用方必须使用返回值，不要继续用传进来的那个可能已过期的对象。
async function ensureWishFresh(store, wish, nowMs) {
  if (!wish || !wish.id) return wish;
  if (wish.status !== 'ready') return wish;      // 只有集满待合成的才会过期
  if (isGeneralWish(wish)) return wish;          // 通用愿望永不过期

  const now = nowMs || Date.now();

  // 兼容本次改动之前的历史数据：没有 ready_at 的 ready 愿望，
  // 从「首次被读到」的这一刻起重新计时，并用 updated_at 反推会误伤老数据。
  let expiresAt = parseInt(wish.expires_at, 10);
  if (Number.isNaN(expiresAt)) {
    const graceStart = now;
    const updates = {
      ready_at: String(graceStart),
      expires_at: String(graceStart + READY_TTL_MS),
      updated_at: String(now)
    };
    await store.hset(`${PREFIX}:${wish.id}`, updates);
    return { ...wish, ...updates };
  }

  if (now < expiresAt) return wish;

  // 已到期：重读一次状态，避免并发下重复处理
  const latest = await store.hgetall(`${PREFIX}:${wish.id}`);
  if (!latest || !latest.id || latest.status !== 'ready') {
    return (latest && latest.id) ? latest : wish;
  }

  // expired_at 记的是「失效时刻」而不是「被发现的时刻」，
  // 否则长时间没打开页面会看到一个凭空的过期时间。
  const updates = {
    status: 'expired',
    expired_at: String(expiresAt),
    updated_at: String(now)
  };
  await store.hset(`${PREFIX}:${wish.id}`, updates);
  return { ...latest, ...updates };
}

// 对某用户的全部愿望跑一遍懒过期，返回刷新后的列表
async function ensureWishFreshAll(store, userId) {
  const wishIds = await store.smembers(`${INDEX_PREFIX}:${userId}`);
  const wishes = [];

  for (const wishId of wishIds) {
    const wish = await store.hgetall(`${PREFIX}:${wishId}`);
    if (!wish || !wish.id) continue;
    wishes.push(await ensureWishFresh(store, wish, Date.now()));
  }

  return wishes;
}

// 找到（必要时创建）用户的通用型愿望。
// 传入 knownWishes 可省掉一次全量读取（列表接口已经读过了）。
async function ensureGeneralWish(store, userId, knownWishes) {
  return withLock(`general:${userId}`, async () => {
    let wishes = knownWishes;
    if (!wishes) {
      const wishIds = await store.smembers(`${INDEX_PREFIX}:${userId}`);
      wishes = [];
      for (const wishId of wishIds) {
        const wish = await store.hgetall(`${PREFIX}:${wishId}`);
        if (wish && wish.id) wishes.push(wish);
      }
    }

    const generals = wishes.filter(isGeneralWish);
    if (generals.length > 0) {
      // 理论上只会有一个；万一历史数据里有多个，保留最早创建的那个
      generals.sort((a, b) => (parseInt(a.created_at, 10) || 0) - (parseInt(b.created_at, 10) || 0));
      return generals[0];
    }

    const now = Date.now();
    const wishId = uuidv4();
    const wish = {
      id: wishId,
      user_id: userId,
      name: GENERAL_WISH_NAME,
      icon: GENERAL_WISH_ICON,
      wish_type: WISH_TYPE_GENERAL,
      total_fragments: '0',       // 0 = 无上限，前端据此不画进度条
      current_fragments: '0',
      status: 'collecting',
      realize_count: '0',
      created_at: String(now),
      updated_at: String(now)
    };

    await store.hset(`${PREFIX}:${wishId}`, wish);
    await store.sadd(`${INDEX_PREFIX}:${userId}`, wishId);

    return wish;
  });
}

module.exports = {
  READY_TTL_MS,
  YUAN_PER_FRAGMENT,
  WISH_TYPE_NORMAL,
  WISH_TYPE_GENERAL,
  GENERAL_WISH_NAME,
  GENERAL_WISH_ICON,
  isGeneralWish,
  getTotalFragments,
  priceToFragments,
  fragmentsToPrice,
  getWishPrice,
  getCurrentFragments,
  isWishFull,
  isDrawEligible,
  formatFragments,
  markWishReady,
  ensureWishFresh,
  ensureWishFreshAll,
  ensureGeneralWish
};
