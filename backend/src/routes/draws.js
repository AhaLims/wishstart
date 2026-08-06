const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

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

    // 获取用户愿望列表
    const wishIds = await req.redis.smembers(`wishstar:wishes:index:${userId}`);
    if (wishIds.length === 0) {
      return res.json({ code: 1, message: '请先创建愿望' });
    }

    // 随机选择一个愿望
    const randomWishId = wishIds[Math.floor(Math.random() * wishIds.length)];
    const wish = await req.redis.hgetall(`wishstar:wish:${randomWishId}`);

    if (!wish || !wish.id) {
      return res.json({ code: 1, message: '愿望不存在' });
    }

    let costStars = 0;
    let costDrawCount = 0;
    let costHalfDrawCount = 0;

    // 处理消耗
    if (type === 'stars') {
      // 消耗星星抽卡
      const currentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
      const stars = parseInt(currentStars) || 0;

      // 根据抽卡类型决定消耗
      const priceMap = {
        normal: 10,  // 全价抽卡消耗10颗星
        half: 5      // 半价抽卡消耗5颗星
      };
      costStars = priceMap[drawType] || 10;

      if (stars < costStars) {
        return res.json({ code: 1, message: `星星不足，需要${costStars}颗星星` });
      }

      await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', -costStars);
    } else if (type === 'count') {
      // 消耗抽卡次数
      if (drawType === 'normal') {
        const drawCount = await req.redis.hget(`wishstar:user:${userId}`, 'draw_count');
        const count = parseInt(drawCount) || 0;
        if (count < 1) {
          return res.json({ code: 1, message: '全价抽卡次数不足' });
        }
        costDrawCount = 1;
        await req.redis.hincrby(`wishstar:user:${userId}`, 'draw_count', -1);
      } else if (drawType === 'half') {
        const halfDrawCount = await req.redis.hget(`wishstar:user:${userId}`, 'half_draw_count');
        const count = parseInt(halfDrawCount) || 0;
        if (count < 1) {
          return res.json({ code: 1, message: '半价抽卡次数不足' });
        }
        costHalfDrawCount = 1;
        await req.redis.hincrby(`wishstar:user:${userId}`, 'half_draw_count', -1);
      } else {
        return res.json({ code: 1, message: '无效的抽卡类型' });
      }
    } else {
      return res.json({ code: 1, message: '无效的消耗类型' });
    }

    // 增加碎片
    const newFragments = await req.redis.hincrby(`wishstar:wish:${randomWishId}`, 'current_fragments', 1);
    await req.redis.hset(`wishstar:wish:${randomWishId}`, 'updated_at', now.toString());

    const totalFragments = parseInt(wish.total_fragments) || 10;
    const isCompleted = newFragments >= totalFragments;

    // 如果完成，更新状态
    if (isCompleted) {
      await req.redis.hset(`wishstar:wish:${randomWishId}`, {
        status: 'completed',
        completed_at: now.toString()
      });
    }

    // 记录抽卡
    const drawRecord = {
      id: uuidv4(),
      wish_id: randomWishId,
      wish_name: wish.name,
      fragment_index: newFragments,
      type,
      draw_type: drawType,
      cost: costStars || costDrawCount || costHalfDrawCount,
      created_at: timestamp
    };

    await req.redis.lpush(`wishstar:draws:${userId}`, JSON.stringify(drawRecord));

    // 记录流水
    let logDescription = '';
    if (type === 'stars') {
      logDescription = `消耗${costStars}颗星星抽卡，获得「${wish.name}」碎片(${newFragments}/${totalFragments})`;
    } else if (drawType === 'normal') {
      logDescription = `消耗1次全价抽卡次数，获得「${wish.name}」碎片(${newFragments}/${totalFragments})`;
    } else {
      logDescription = `消耗1次半价抽卡次数，获得「${wish.name}」碎片(${newFragments}/${totalFragments})`;
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
        isCompleted
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

module.exports = router;
