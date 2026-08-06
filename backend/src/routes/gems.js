const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 兑换宝石
router.post('/exchange', async (req, res) => {
  try {
    const { userId, stars } = req.body;

    if (!userId || !stars) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    const starsToExchange = parseInt(stars);

    if (starsToExchange < 10) {
      return res.json({ code: 1, message: '需要至少10颗星星才能兑换宝石' });
    }

    // 检查星星是否足够
    const currentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
    const starsNum = parseInt(currentStars) || 0;

    if (starsNum < starsToExchange) {
      return res.json({ code: 1, message: '星星不足' });
    }

    // 计算可兑换的宝石数量
    const gemsToReceive = Math.floor(starsToExchange / 10);

    // 扣除星星，增加宝石
    await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', -starsToExchange);
    await req.redis.hincrby(`wishstar:user:${userId}`, 'gems', gemsToReceive);

    const timestamp = Date.now();

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'expenditure',
      category: 'gem',
      amount: -starsToExchange,
      description: `兑换${gemsToReceive}个宝石（消耗${starsToExchange}颗星星）`,
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

    const newGems = await req.redis.hget(`wishstar:user:${userId}`, 'gems');
    const newStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');

    res.json({
      code: 0,
      data: {
        starsExchanged: starsToExchange,
        gemsReceived: gemsToReceive,
        currentGems: parseInt(newGems),
        currentStars: parseInt(newStars)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取宝石信息
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const gems = await req.redis.hget(`wishstar:user:${userId}`, 'gems');
    const currentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');

    res.json({
      code: 0,
      data: {
        gems: parseInt(gems) || 0,
        currentStars: parseInt(currentStars) || 0,
        exchangeRate: 10
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
