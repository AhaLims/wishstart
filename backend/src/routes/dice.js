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

    // 使用 half_draw_count 作为掷骰子次数
    const diceCount = await req.redis.hget(`wishstar:user:${userId}`, 'half_draw_count');
    const count = parseInt(diceCount) || 0;

    if (count < 1) {
      return res.json({ code: 1, message: '今日掷骰子次数不足' });
    }

    // 消耗1次掷骰子次数
    await req.redis.hincrby(`wishstar:user:${userId}`, 'half_draw_count', -1);

    // 生成骰子点数（1-6）
    const diceResult = Math.floor(Math.random() * 6) + 1;
    const starsEarned = diceResult;

    // 获得对应的星星
    await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', starsEarned);
    await req.redis.hincrby(`wishstar:user:${userId}`, 'total_stars', starsEarned);

    // 记录骰子使用
    await req.redis.hset(`wishstar:dice:${userId}:${date}`, {
      dice_result: diceResult.toString(),
      stars_earned: starsEarned.toString()
    });

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'income',
      category: 'dice',
      amount: starsEarned,
      description: `掷骰子获得${starsEarned}颗星星（点数：${diceResult}）`,
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

    const newCurrentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
    const newDiceCount = await req.redis.hget(`wishstar:user:${userId}`, 'half_draw_count');

    res.json({
      code: 0,
      data: {
        diceResult,
        starsEarned,
        currentStars: parseInt(newCurrentStars),
        remainingDiceCount: parseInt(newDiceCount) || 0
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

    const diceCount = await req.redis.hget(`wishstar:user:${userId}`, 'half_draw_count');
    const currentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
    const count = parseInt(diceCount) || 0;
    const stars = parseInt(currentStars) || 0;

    res.json({
      code: 0,
      data: {
        canRoll: count > 0,
        diceCount: count,
        currentStars: stars
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
