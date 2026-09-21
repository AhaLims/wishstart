// 星光值：独立于「星星」体系的一个小玩法（参考《洛克王国：世界》的星光值 / 许愿星）
//
// 三条规则单独说明一下，因为它们都不太直觉：
// 1. 星光值只按天累计，当天没用掉的第二天作废；但**已经凝结出来的许愿星不受影响**，
//    待入库的和已入库的都跨天保留。
// 2. 凝结是**自动**的 —— 星光值够下一档就立刻扣掉并生成一颗许愿星，不需要手动点。
//    档位只看「当天第几颗」，每天重置，所以昨天没入库的星星不会拖累今天的档位。
// 3. 凝结出来的星星先躺在「待入库」区，玩家点一下才算进「凝结许愿星总数」。
//
// 这套数字跟 current_stars / total_stars 完全无关，流水也单独记一份，
// 不要把它接到统计页那份星星流水上。
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getBeijingDate } = require('./beijingDate');

// 当天第 N 颗许愿星需要多少星光值。数组下标 0 就是「当天第 1 颗」。
//   第 1-5 颗：每颗 80
//   第 6-10 颗：每颗 120
//   第 11-15 颗：160 / 200 / 240 / 280 / 320
//   第 16-20 颗：380 / 440 / 500 / 560 / 620
//   第 21-25 颗：1240 / 2480 / 4960 / 9920 / 19840
const STAR_COSTS = [
  80, 80, 80, 80, 80,
  120, 120, 120, 120, 120,
  160, 200, 240, 280, 320,
  380, 440, 500, 560, 620,
  1240, 2480, 4960, 9920, 19840
];

// 一天最多凝结 25 颗
const MAX_DAILY_STARS = STAR_COSTS.length;

// 星光值任务的范围上限。够大了，同时也把 crypto.randomInt 卡在它的合法区间内。
const MAX_SPAN = 2 ** 32;

const stateKey = (userId) => `wishstar:starlight:${userId}`;
const taskKey = (taskId) => `wishstar:starlight_task:${taskId}`;
const taskIndexKey = (userId) => `wishstar:starlight_tasks:${userId}`;
const logKey = (userId) => `wishstar:starlight_logs:${userId}`;

// 当天第 n 颗（n 从 1 开始）需要多少星光值；超出 25 颗返回 null
function costOfStar(n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAILY_STARS) return null;
  return STAR_COSTS[n - 1];
}

// 取一个 [min, max] 的均匀随机整数，两端都能抽到。
// crypto.randomInt 内部就是拒绝采样，不会出现取模偏置。
function rollInRange(min, max) {
  return crypto.randomInt(min, max + 1);
}

// 校验任务范围：整数、非负、min <= max、跨度不过大
function validateRange(minValue, maxValue) {
  if (!Number.isInteger(minValue) || !Number.isInteger(maxValue)) {
    return '星光值范围只能填整数';
  }
  if (minValue < 0) return '星光值不能是负数';
  if (minValue > maxValue) return '最小值不能大于最大值';
  if (maxValue - minValue + 1 > MAX_SPAN) return '范围太大，跨度最多 2^32';
  return null;
}

// 记一条星光值流水（zset，与星星流水分开存）
async function addLog(store, userId, entry) {
  const log = { id: uuidv4(), created_at: Date.now(), ...entry };
  await store.zadd(logKey(userId), log.created_at, JSON.stringify(log));
  return log;
}

// 读状态 + 跨天重置 + 自动凝结。所有星光值接口进来都先跑这个。
//
// 返回最新的状态对象；调用方一律用返回值，不要自己再 hgetall 一遍。
async function ensureStarlight(store, userId, now = new Date()) {
  const key = stateKey(userId);
  const date = getBeijingDate(now);
  const raw = (await store.hgetall(key)) || {};

  let value = parseInt(raw.value) || 0;
  let pending = parseInt(raw.pending) || 0;
  const banked = parseInt(raw.banked) || 0;
  let todayCondensed = parseInt(raw.today_condensed) || 0;
  let todayEarned = parseInt(raw.today_earned) || 0;

  // 跨天：星光值和「今日累计获得」清零；待入库的星星、已入库总数都留着
  let valueDate = raw.value_date || date;
  if (valueDate !== date) {
    value = 0;
    todayEarned = 0;
    valueDate = date;
  }

  // 跨天：档位回到第 1 颗
  let condenseDate = raw.condense_date || date;
  if (condenseDate !== date) {
    todayCondensed = 0;
    condenseDate = date;
  }

  // 自动凝结：够一档就扣一档，一直凝到不够为止（一天封顶 25 颗）
  let condensedNow = 0;
  let spentNow = 0;
  while (todayCondensed < MAX_DAILY_STARS) {
    const cost = costOfStar(todayCondensed + 1);
    if (value < cost) break;
    value -= cost;
    spentNow += cost;
    todayCondensed++;
    pending++;
    condensedNow++;
  }

  // 字段全部自己 String() 一遍 —— memoryStore.hset 不会帮你转
  const next = {
    value: String(value),
    pending: String(pending),
    banked: String(banked),
    today_condensed: String(todayCondensed),
    today_earned: String(todayEarned),
    value_date: valueDate,
    condense_date: condenseDate
  };

  const changed = Object.keys(next).some((f) => raw[f] !== next[f]);
  if (changed) await store.hset(key, next);

  if (condensedNow > 0) {
    await addLog(store, userId, {
      type: 'expenditure',
      category: 'starlight_condense',
      amount: -spentNow,
      unit: '星光值',
      description: `凝结出 ${condensedNow} 颗许愿星，消耗 ${spentNow} 星光值`
    });
  }

  const nextStarCost = costOfStar(todayCondensed + 1);

  return {
    date,
    value,
    pending,
    banked,
    todayCondensed,
    todayEarned,
    maxDailyStars: MAX_DAILY_STARS,
    // 下一颗要多少星光值；今天已经凝满 25 颗时为 null
    nextCost: nextStarCost,
    // 距离下一颗还差多少星光值
    nextRemaining: nextStarCost === null ? null : Math.max(0, nextStarCost - value),
    // 本次调用顺带凝结出来的颗数（完成任务后前端可以直接拿来说「自动凝结了 N 颗」）
    condensedNow,
    spentNow
  };
}

// 完成一次星光值任务：roll 一个数，累加到当日星光值，然后跑一遍自动凝结
async function completeStarlightTask(store, task, now = new Date()) {
  const userId = task.user_id;
  const min = parseInt(task.min_value);
  const max = parseInt(task.max_value);

  const rolled = rollInRange(min, max);

  // 先 ensure 一次，让跨天重置（如果有）在加数之前发生——
  // 否则刚加上的星光值会被紧接着的每日清零抹掉
  await ensureStarlight(store, userId, now);

  // 再加星光值，然后第二次 ensure 把够档位的当次凝结掉
  await store.hincrby(stateKey(userId), 'value', rolled);
  await store.hincrby(stateKey(userId), 'today_earned', rolled);

  const newComplete = (parseInt(task.complete_count) || 0) + 1;
  await store.hset(taskKey(task.id), {
    complete_count: String(newComplete),
    updated_at: String(Date.now())
  });

  await addLog(store, userId, {
    type: 'income',
    category: 'starlight_task',
    amount: rolled,
    unit: '星光值',
    description: `完成「${task.name}」获得 ${rolled} 星光值`
  });

  const state = await ensureStarlight(store, userId, now);
  return { rolled, state, completeCount: newComplete };
}

// 入库：把待入库的许愿星收进「凝结许愿星总数」
async function collectStars(store, userId, count, now = new Date()) {
  const state = await ensureStarlight(store, userId, now);

  // 先单独判「没得收」——不然待入库为 0 时会在下面被误报成「数量不合法」
  if (state.pending < 1) {
    return { error: '现在没有待入库的许愿星' };
  }

  const want = count === undefined || count === null ? state.pending : count;
  if (!Number.isInteger(want) || want < 1) {
    return { error: '入库数量不合法' };
  }
  if (want > state.pending) {
    return { error: '待入库的许愿星不够' };
  }

  await store.hincrby(stateKey(userId), 'pending', -want);
  await store.hincrby(stateKey(userId), 'banked', want);

  await addLog(store, userId, {
    type: 'income',
    category: 'starlight_collect',
    amount: want,
    unit: '颗',
    description: `收起 ${want} 颗许愿星，放进了仓库`
  });

  return { collected: want, state: await ensureStarlight(store, userId, now) };
}

module.exports = {
  STAR_COSTS,
  MAX_DAILY_STARS,
  MAX_SPAN,
  stateKey,
  taskKey,
  taskIndexKey,
  logKey,
  costOfStar,
  rollInRange,
  validateRange,
  addLog,
  ensureStarlight,
  completeStarlightTask,
  collectStars
};
