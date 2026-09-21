const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { ensureToday } = require('../services/dailyState');

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

    // 检查今天的日期字段是否存在，如果不存在或不是今天则重置（统一按 last_daily_date 判断）
    await ensureToday(req.redis, userId, date);

    // 获取今天可用的掷骰子次数
    const todayDiceCount = parseInt(await req.redis.hget(`wishstar:user:${userId}`, 'today_dice_count')) || 0;

    if (todayDiceCount < 1) {
      return res.json({ code: 1, message: '今日掷骰子次数不足' });
    }

    // 消耗今天可用的1次掷骰子次数
    await req.redis.hincrby(`wishstar:user:${userId}`, 'today_dice_count', -1);

    // 生成骰子点数（1-6）
    const diceResult = Math.floor(Math.random() * 6) + 1;
    const starsEarned = diceResult;

    // 获得对应的星星（掷骰子获得的星星不算入 today_stars）
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
    const newTodayDiceCount = await req.redis.hget(`wishstar:user:${userId}`, 'today_dice_count');
    const newTodayStars = await req.redis.hget(`wishstar:user:${userId}`, 'today_stars');
    const newTodayTimeStars = await req.redis.hget(`wishstar:user:${userId}`, 'today_time_stars');

    res.json({
      code: 0,
      data: {
        diceResult,
        starsEarned,
        currentStars: parseInt(newCurrentStars),
        remainingDiceCount: parseInt(newTodayDiceCount) || 0,
        todayStars: parseInt(newTodayStars) || 0,
        todayTimeStars: parseInt(newTodayTimeStars) || 0
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 手动记录线下掷骰子结果
router.post('/manual', async (req, res) => {
  try {
    const { userId, diceValue } = req.body;

    if (!userId || !diceValue) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    const diceNum = parseInt(diceValue);
    if (diceNum < 1 || diceNum > 6) {
      return res.json({ code: 1, message: '点数必须是1-6之间的数字' });
    }

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const timestamp = now.getTime();

    // 检查并重置今日星星和掷骰子计数（统一按 last_daily_date 判断跨天）
    await ensureToday(req.redis, userId, date);

    // 获取今天可用的掷骰子次数
    const todayDiceCount = parseInt(await req.redis.hget(`wishstar:user:${userId}`, 'today_dice_count')) || 0;

    if (todayDiceCount < 1) {
      return res.json({ code: 1, message: '今日掷骰子次数不足' });
    }

    // 消耗今天可用的1次掷骰子次数
    await req.redis.hincrby(`wishstar:user:${userId}`, 'today_dice_count', -1);

    // 获得的星星数量等于点数
    const starsEarned = diceNum;

    // 获得对应的星星
    await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', starsEarned);
    await req.redis.hincrby(`wishstar:user:${userId}`, 'total_stars', starsEarned);

    // 记录骰子使用
    await req.redis.hset(`wishstar:dice:${userId}:${date}`, {
      dice_result: diceNum.toString(),
      stars_earned: starsEarned.toString()
    });

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'income',
      category: 'dice',
      amount: starsEarned,
      description: `线下掷骰子记录获得${starsEarned}颗星星（点数：${diceNum}）`,
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

    const newCurrentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
    const newTodayDiceCount = await req.redis.hget(`wishstar:user:${userId}`, 'today_dice_count');
    const newTodayStars = await req.redis.hget(`wishstar:user:${userId}`, 'today_stars');
    const newTodayTimeStars = await req.redis.hget(`wishstar:user:${userId}`, 'today_time_stars');

    res.json({
      code: 0,
      data: {
        diceResult: diceNum,
        starsEarned,
        currentStars: parseInt(newCurrentStars),
        remainingDiceCount: parseInt(newTodayDiceCount) || 0,
        todayStars: parseInt(newTodayStars) || 0,
        todayTimeStars: parseInt(newTodayTimeStars) || 0
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

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 检查并重置今日星星和掷骰子计数（统一按 last_daily_date 判断跨天）
    await ensureToday(req.redis, userId, today);

    const todayDiceCount = await req.redis.hget(`wishstar:user:${userId}`, 'today_dice_count');
    const currentStars = await req.redis.hget(`wishstar:user:${userId}`, 'current_stars');
    const todayStars = await req.redis.hget(`wishstar:user:${userId}`, 'today_stars');
    // 掷骰子次数按「时间型」星星算，通用型的不算
    const todayTimeStars = await req.redis.hget(`wishstar:user:${userId}`, 'today_time_stars');
    const count = parseInt(todayDiceCount) || 0;
    const stars = parseInt(currentStars) || 0;
    const todayStarsCount = parseInt(todayStars) || 0;

    res.json({
      code: 0,
      data: {
        canRoll: count > 0,
        diceCount: count,
        currentStars: stars,
        todayStars: todayStarsCount,
        todayTimeStars: parseInt(todayTimeStars) || 0
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
