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

const PREFIX = 'wishstar:wish';

// 抽卡
router.post('/', async (req, res) => {
  try {
    const { userId, type, drawType } = req.body;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    if (!type || !drawType) {
      return res.status(400).json({ code: 1, message: '缺少type或drawType参数' });
    }

    const now = Date.now();
    const timestamp = now;

    // 先刷新愿望状态，避免把碎片抽进一个已经该过期、或已经集满的愿望里
    const wishes = await ensureWishFreshAll(req.redis, userId);

    // 只抽取「收集中且未集满」的愿望（通用愿望也在池中，与普通愿望等权）
    const candidates = wishes.filter(isDrawEligible);

    if (candidates.length === 0) {
      return res.json({ code: 1, message: '没有进行中的愿望' });
    }

    // 随机选择一个愿望
    const wish = candidates[Math.floor(Math.random() * candidates.length)];
    const randomWishId = wish.id;

    let costStars = 0;

    // 只支持消耗星星抽卡
    const currentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
    const stars = parseInt(currentStars) || 0;

    // 根据抽卡类型决定消耗
    // 全价抽卡：5颗星星，半价抽卡：3颗星星
    const priceMap = {
      normal: 5,   // 全价抽卡消耗5颗星
      half: 3      // 半价抽卡消耗3颗星
    };
    costStars = priceMap[drawType] || 5;

    // 半价抽卡需要消耗半价抽卡次数
    if (drawType === 'half') {
      const halfDrawCount = await req.redis.hget(`wishstar:user:${userId}`, 'half_draw_count');
      const count = parseInt(halfDrawCount) || 0;
      if (count < 1) {
        return res.json({ code: 1, message: '半价抽卡次数不足' });
      }
      await req.redis.hincrby(`wishstar:user:${userId}`, 'half_draw_count', -1);
    }

    if (stars < costStars) {
      return res.json({ code: 1, message: `星星不足，需要${costStars}颗星星` });
    }

    await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', -costStars);

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
      draw_type: drawType,
      cost: costStars,
      created_at: timestamp
    };

    await req.redis.lpush(`wishstar:draws:${userId}`, JSON.stringify(drawRecord));

    // 记录流水
    const fragmentsText = formatFragments({ ...wish, current_fragments: String(newFragments) });
    let logDescription = '';
    if (drawType === 'half') {
      logDescription = `消耗${costStars}颗星星和1次半价抽卡次数，获得「${wish.name}」碎片(${fragmentsText})`;
    } else {
      logDescription = `消耗${costStars}颗星星抽卡，获得「${wish.name}」碎片(${fragmentsText})`;
    }

    const log = {
      id: uuidv4(),
      type: 'expenditure',
      category: 'draw',
      amount: -(costStars || 0),
      description: logDescription,
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

    res.json({
      code: 0,
      data: {
        wishId: randomWishId,
        wishName: wish.name,
        fragmentIndex: newFragments,
        currentFragments: newFragments,
        totalFragments,
        isReady: isFull
      }
    });
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

// 线下抽卡记录
router.post('/manual', async (req, res) => {
  try {
    const { userId, wishId, drawType } = req.body;

    if (!userId || !wishId) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    // 先校验愿望是否还能抽，通过了再扣资源，
    // 否则会出现「星星扣了、碎片没加上」的情况
    const existing = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    if (!existing || !existing.id) {
      return res.json({ code: 1, message: '愿望不存在' });
    }

    const wish = await ensureWishFresh(req.redis, existing, Date.now());

    if (wish.status === 'expired') {
      return res.json({ code: 1, message: '愿望已过期，无法再获得碎片' });
    }
    if (wish.status === 'completed') {
      return res.json({ code: 1, message: '愿望已完成，无法再获得碎片' });
    }
    if (isWishFull(wish)) {
      return res.json({ code: 1, message: '愿望碎片已集满，请先合成' });
    }

    const currentStars = parseInt(await req.redis.hget(`wishstar:user:${userId}`, 'current_stars')) || 0;
    const drawCount = parseInt(await req.redis.hget(`wishstar:user:${userId}`, 'draw_count')) || 0;
    const halfDrawCount = parseInt(await req.redis.hget(`wishstar:user:${userId}`, 'half_draw_count')) || 0;

    // 根据消耗方式检查资源
    if (drawType === 'free') {
      // 免费抽卡：消耗1次抽卡次数
      if (drawCount < 1) {
        return res.json({ code: 1, message: '抽卡次数不足' });
      }
      await req.redis.hincrby(`wishstar:user:${userId}`, 'draw_count', -1);
    } else if (drawType === 'normal') {
      // 全价抽卡：消耗5颗星星
      if (currentStars < 5) {
        return res.json({ code: 1, message: '星星不足，需要5颗星星' });
      }
      await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', -5);
    } else if (drawType === 'half') {
      // 半价抽卡：消耗3颗星星+1次半价次数
      if (currentStars < 3) {
        return res.json({ code: 1, message: '星星不足，需要3颗星星' });
      }
      if (halfDrawCount < 1) {
        return res.json({ code: 1, message: '半价抽卡次数不足' });
      }
      await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', -3);
      await req.redis.hincrby(`wishstar:user:${userId}`, 'half_draw_count', -1);
    }

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
      draw_type: drawType,
      created_at: now
    };

    await req.redis.lpush(`wishstar:draws:${userId}`, JSON.stringify(drawRecord));

    // 记录流水
    const fragmentsText = formatFragments({ ...wish, current_fragments: String(newFragments) });
    let logDescription = '';
    if (drawType === 'free') {
      logDescription = `线下抽卡记录：消耗1次抽卡次数，「${wish.name}」获得1个碎片(${fragmentsText})`;
    } else if (drawType === 'normal') {
      logDescription = `线下抽卡记录：消耗5颗星星，「${wish.name}」获得1个碎片(${fragmentsText})`;
    } else if (drawType === 'half') {
      logDescription = `线下抽卡记录：消耗3颗星星+1次半价次数，「${wish.name}」获得1个碎片(${fragmentsText})`;
    }

    const log = {
      id: uuidv4(),
      type: 'expenditure',
      category: 'draw',
      amount: 0,
      description: logDescription,
      created_at: now
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, now, JSON.stringify(log));

    res.json({
      code: 0,
      data: {
        wishId,
        wishName: wish.name,
        currentFragments: newFragments,
        totalFragments,
        isReady: isFull
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
