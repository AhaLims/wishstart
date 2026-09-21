const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  isGeneralWish,
  getTotalFragments,
  isWishFull,
  isDrawEligible,
  formatFragments,
  markWishReady,
  ensureWishFresh,
  ensureWishFreshAll
} = require('../services/wishState');
const { withLock } = require('../utils/lock');

const PREFIX = 'wishstar:wish';

// 抽卡消耗的三档：免费（1 次抽卡次数）→ 半价（3⭐ + 1 次半价次数）→ 全价（5⭐）
const STAR_COST_HALF = 3;
const STAR_COST_FULL = 5;

// 按用户当前资源自动挑一档，前端不再让用户选。
// 返回 { mode, stars, free, half }；三档都用不了时返回 null。
//
// 注意：这个函数和下面的 consumeDrawCost 之间隔着 await，读到的资源随时可能被别人改掉。
// 抽卡/补记碎片都必须在 withLock(`draw:${userId}`) 里成对调用，否则两个并发请求
// 会双双读到「还有 1 次免费」、双双判定可以免费抽，白拿一次。
async function pickDrawMode(store, userId) {
  const user = (await store.hgetall(`wishstar:user:${userId}`)) || {};
  const stars = parseInt(user.current_stars) || 0;
  const freeCount = parseInt(user.draw_count) || 0;
  const halfCount = parseInt(user.half_draw_count) || 0;

  // 有免费次数就先用免费的
  if (freeCount >= 1) {
    return { mode: 'free', stars: 0, free: 1, half: 0 };
  }
  // 其次半价：既要还有半价次数，也要够星星
  if (halfCount >= 1 && stars >= STAR_COST_HALF) {
    return { mode: 'half', stars: STAR_COST_HALF, free: 0, half: 1 };
  }
  // 最后全价
  if (stars >= STAR_COST_FULL) {
    return { mode: 'normal', stars: STAR_COST_FULL, free: 0, half: 0 };
  }
  return null;
}

// 扣资源。调用前必须确认过 pickDrawMode 不为 null，
// 否则会出现「星星扣了、碎片没加上」或者次数白白丢掉
async function consumeDrawCost(store, userId, cost) {
  const userKey = `wishstar:user:${userId}`;
  if (cost.free) await store.hincrby(userKey, 'draw_count', -cost.free);
  if (cost.half) await store.hincrby(userKey, 'half_draw_count', -cost.half);
  if (cost.stars) await store.hincrby(userKey, 'current_stars', -cost.stars);
}

// 流水里怎么描述这次消耗
function drawCostText(cost) {
  if (cost.mode === 'free') return '消耗1次抽卡次数';
  if (cost.mode === 'half') return `消耗${STAR_COST_HALF}颗星星和1次半价抽卡次数`;
  return `消耗${STAR_COST_FULL}颗星星`;
}

// 抽卡
router.post('/', async (req, res) => {
  try {
    const { userId, type } = req.body;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    if (!type) {
      return res.status(400).json({ code: 1, message: '缺少type参数' });
    }

    // 「挑消耗档 → 扣资源 → 加碎片」整段串行执行。中间有 await，不锁的话连点两下
    // 会让两个请求都读到同一份资源、都判定够用，于是白拿一次抽卡。
    // 锁按用户分，不影响其他人（顺手也把线上抽卡和补记碎片串起来了）。
    const result = await withLock(`draw:${userId}`, async () => {
      const now = Date.now();
      const timestamp = now;

      // 先看资源够不够用哪种方式，不够就没必要往下走（也不会产生任何副作用）
      const cost = await pickDrawMode(req.redis, userId);
      if (!cost) {
        return { error: '抽卡次数和星星都不够，先去完成任务攒一点吧' };
      }

      // 刷新愿望状态，避免把碎片抽进一个已经该过期、或已经集满的愿望里
      const wishes = await ensureWishFreshAll(req.redis, userId);

      // 只抽取「收集中且未集满」的愿望（通用愿望也在池中，与普通愿望等权）
      const candidates = wishes.filter(isDrawEligible);

      if (candidates.length === 0) {
        return { error: '没有进行中的愿望' };
      }

      // 随机选择一个愿望
      const wish = candidates[Math.floor(Math.random() * candidates.length)];
      const randomWishId = wish.id;

      // 到这里才真正扣资源：前面任何一步失败都不会白扣
      await consumeDrawCost(req.redis, userId, cost);

      // 增加碎片
      const newFragments = await req.redis.hincrby(`${PREFIX}:${randomWishId}`, 'current_fragments', 1);
      await req.redis.hset(`${PREFIX}:${randomWishId}`, 'updated_at', now.toString());

      const totalFragments = getTotalFragments(wish);
      // 通用愿望没有上限，永远不会集满
      const isFull = !isGeneralWish(wish) && newFragments >= totalFragments;

      // 如果集满，进入「已集满待合成」状态（ready），等待用户手动合成
      if (isFull) {
        await markWishReady(req.redis, { ...wish, current_fragments: String(newFragments) }, now);
      }

      // 记录抽卡
      const drawRecord = {
        id: uuidv4(),
        wish_id: randomWishId,
        wish_name: wish.name,
        fragment_index: newFragments,
        type: 'stars',
        draw_type: cost.mode,
        cost: cost.stars,
        created_at: timestamp
      };

      await req.redis.lpush(`wishstar:draws:${userId}`, JSON.stringify(drawRecord));

      // 记录流水
      const fragmentsText = formatFragments({ ...wish, current_fragments: String(newFragments) });
      const logDescription = `${drawCostText(cost)}抽卡，获得「${wish.name}」碎片(${fragmentsText})`;

      const log = {
        id: uuidv4(),
        type: 'expenditure',
        category: 'draw',
        amount: -cost.stars,
        description: logDescription,
        created_at: timestamp
      };
      await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

      return {
        data: {
          wishId: randomWishId,
          wishName: wish.name,
          fragmentIndex: newFragments,
          currentFragments: newFragments,
          totalFragments,
          isReady: isFull
        }
      };
    });

    if (result.error) {
      return res.json({ code: 1, message: result.error });
    }

    res.json({ code: 0, data: result.data });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取抽卡记录
router.get('/', async (req, res) => {
  try {
    const { userId, limit } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const max = limit ? parseInt(limit) : 20;
    const draws = await req.redis.lrange(`wishstar:draws:${userId}`, 0, max - 1);
    const parsedDraws = draws.map(d => JSON.parse(d));

    res.json({ code: 0, data: parsedDraws });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 补记碎片：线下抽到了某个愿望的碎片，在愿望卡片上记一笔（一次一个）。
// 消耗方式跟线上抽卡一套规则，照样按资源自动挑。
router.post('/manual', async (req, res) => {
  try {
    const { userId, wishId } = req.body;

    if (!userId || !wishId) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    // 跟线上抽卡同一把锁：校验愿望、挑消耗档、扣资源、加碎片整段串行。
    // 愿望页的按钮虽然会在请求期间禁用，但多标签页、慢网络重试一样能并发进来，
    // 不锁的话两个请求会双双判定「还有 1 次免费」，白拿一次。
    const result = await withLock(`draw:${userId}`, async () => {
      // 先校验愿望是否还能记，通过了再扣资源，
      // 否则会出现「星星扣了、碎片没加上」的情况
      const existing = await req.redis.hgetall(`${PREFIX}:${wishId}`);
      if (!existing || !existing.id) {
        return { error: '愿望不存在' };
      }

      const wish = await ensureWishFresh(req.redis, existing, Date.now());

      if (wish.status === 'expired') {
        return { error: '愿望已过期，无法再获得碎片' };
      }
      if (wish.status === 'completed') {
        return { error: '愿望已完成，无法再获得碎片' };
      }
      if (isWishFull(wish)) {
        return { error: '愿望碎片已集满，请先合成' };
      }

      // 线下抽卡同样是按资源自动挑消耗方式，跟线上抽卡一套规则
      const cost = await pickDrawMode(req.redis, userId);
      if (!cost) {
        return { error: '抽卡次数和星星都不够，先去完成任务攒一点吧' };
      }

      // 愿望已经校验过了，这里才真正扣资源
      await consumeDrawCost(req.redis, userId, cost);

      const now = Date.now();

      // 增加1个碎片
      const newFragments = await req.redis.hincrby(`${PREFIX}:${wishId}`, 'current_fragments', 1);
      await req.redis.hset(`${PREFIX}:${wishId}`, 'updated_at', now.toString());

      const totalFragments = getTotalFragments(wish);
      const isFull = !isGeneralWish(wish) && newFragments >= totalFragments;

      // 如果集满，进入「已集满待合成」状态
      if (isFull) {
        await markWishReady(req.redis, { ...wish, current_fragments: String(newFragments) }, now);
      }

      // 记录抽卡
      const drawRecord = {
        id: uuidv4(),
        wish_id: wishId,
        wish_name: wish.name,
        fragment_index: newFragments,
        type: 'manual',
        draw_type: cost.mode,
        cost: cost.stars,
        created_at: now
      };

      await req.redis.lpush(`wishstar:draws:${userId}`, JSON.stringify(drawRecord));

      // 记录流水
      const fragmentsText = formatFragments({ ...wish, current_fragments: String(newFragments) });
      const logDescription = `补记碎片：${drawCostText(cost)}，「${wish.name}」获得1个碎片(${fragmentsText})`;

      const log = {
        id: uuidv4(),
        type: 'expenditure',
        category: 'draw',
        // 跟线上抽卡一样记实际花掉的星星：免费档 cost.stars 是 0，这里自然就是 0
        amount: -cost.stars,
        description: logDescription,
        created_at: now
      };
      await req.redis.zadd(`wishstar:logs:${userId}`, now, JSON.stringify(log));

      return {
        data: {
          wishId,
          wishName: wish.name,
          currentFragments: newFragments,
          totalFragments,
          isReady: isFull,
          // 这次用的是哪一档、花了多少，前端拿来说给用户听
          drawType: cost.mode,
          cost: cost.stars
        }
      };
    });

    if (result.error) {
      return res.json({ code: 1, message: result.error });
    }

    res.json({ code: 0, data: result.data });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
