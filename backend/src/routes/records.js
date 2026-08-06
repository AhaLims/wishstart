const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 快速记录（单次任务）
router.post('/quick', async (req, res) => {
  try {
    const { userId, taskName, stars } = req.body;

    if (!userId || !taskName || !stars) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const timestamp = now.getTime();
    const hour = now.getHours();

    // 周末加倍
    let starsEarned = parseInt(stars);
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    if (isWeekend) {
      starsEarned *= 2;
    }

    // 更新用户星星
    await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', starsEarned);
    await req.redis.hincrby(`wishstar:user:${userId}`, 'total_stars', starsEarned);

    // 记录到每日记录
    let period = 'morning';
    if (hour >= 12 && hour < 18) period = 'afternoon';
    else if (hour >= 18) period = 'evening';

    const record = {
      id: uuidv4(),
      task_id: '',
      task_name: taskName,
      stars: starsEarned,
      type: 'quick',
      period,
      is_weekend_double: isWeekend,
      created_at: timestamp
    };

    await req.redis.zadd(`wishstar:records:${userId}:${date}`, timestamp, JSON.stringify(record));

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'income',
      category: 'quick',
      amount: starsEarned,
      description: `快速记录「${taskName}」获得${starsEarned}颗星星${isWeekend ? '（周末加倍）' : ''}`,
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

    res.json({
      code: 0,
      data: {
        record,
        isWeekendDouble: isWeekend
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取每日记录
router.get('/', async (req, res) => {
  try {
    const { userId, date } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];
    const records = await req.redis.zrange(`wishstar:records:${userId}:${targetDate}`, 0, -1);

    const parsedRecords = records.map(r => JSON.parse(r));

    // 统计各时段星星
    let totalStars = 0;
    let morningStars = 0;
    let afternoonStars = 0;
    let eveningStars = 0;

    parsedRecords.forEach(r => {
      totalStars += r.stars;
      if (r.period === 'morning') morningStars += r.stars;
      else if (r.period === 'afternoon') afternoonStars += r.stars;
      else if (r.period === 'evening') eveningStars += r.stars;
    });

    res.json({
      code: 0,
      data: {
        date: targetDate,
        totalStars,
        morningStars,
        afternoonStars,
        eveningStars,
        records: parsedRecords
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取日期范围记录
router.get('/range', async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    const result = [];
    let currentDate = new Date(startDate);
    const end = new Date(endDate);

    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const records = await req.redis.zrange(`wishstar:records:${userId}:${dateStr}`, 0, -1);
      const parsedRecords = records.map(r => JSON.parse(r));

      let totalStars = 0;
      parsedRecords.forEach(r => totalStars += r.stars);

      result.push({
        date: dateStr,
        totalStars,
        records: parsedRecords
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({ code: 0, data: result });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
