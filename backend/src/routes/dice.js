const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 掷骰子
router.post('/', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const timestamp = now.getTime();

    // 检查当天是否已使用骰子
    const diceUsed = await req.redis.hget(`wishstar:dice:${userId}:${date}`, 'used');
    if (diceUsed === '1') {
      return res.json({ code: 1, message: '今日骰子次数已用完' });
    }

    // 检查星星是否足够（需要5颗）
    const currentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
    const stars = parseInt(currentStars) || 0;

    if (stars < 5) {
      return res.json({ code: 1, message: '需要至少5颗星星才能掷骰子', starsRequired: 5, currentStars: stars });
    }

    // 消耗5颗星星
    await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', -5);

    // 生成骰子点数（1-6）
    const diceResult = Math.floor(Math.random() * 6) + 1;
    const starsEarned = diceResult;

    // 获得对应的星星
    await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', starsEarned);
    await req.redis.hincrby(`wishstar:user:${userId}`, 'total_stars', starsEarned);

    // 记录骰子使用
    await req.redis.hset(`wishstar:dice:${userId}:${date}`, {
      used: '1',
      dice_result: diceResult.toString(),
      stars_earned: starsEarned.toString()
    });

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'expenditure',
      category: 'dice',
      amount: -5,
      description: `掷骰子消耗5颗星星，获得${starsEarned}颗星星（点数：${diceResult}）`,
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

    // 记录收入流水
    const incomeLog = {
      id: uuidv4(),
      type: 'income',
      category: 'dice',
      amount: starsEarned,
      description: `掷骰子获得${starsEarned}颗星星（点数：${diceResult}）`,
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp + 1, JSON.stringify(incomeLog));

    const newCurrentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');

    res.json({
      code: 0,
      data: {
        diceResult,
        starsEarned,
        currentStars: parseInt(newCurrentStars)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 检查骰子状态
router.get('/', async (req, res) => {
  try {
    const { userId, date } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];

    const diceUsed = await req.redis.hget(`wishstar:dice:${userId}:${targetDate}`, 'used');
    const currentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
    const stars = parseInt(currentStars) || 0;

    res.json({
      code: 0,
      data: {
        canRoll: diceUsed !== '1' && stars >= 5,
        starsRequired: 5,
        currentStars: stars,
        used: diceUsed === '1'
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
