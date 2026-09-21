const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { ensureToday, isTimeRecord, diceEarnedFrom } = require('../services/dailyState');

// 工时不单独存，每次从记录现算（所以删记录工时会自动跟着少）。
// 口径见 docs/核心功能--思考实现系统.md 第 3 条：
//   - 25min型任务的完成记录，一条算 25 分钟
//   - 快速记录里标了时间型的，按基础星数折算，1 颗星 = 25 分钟
//   - 别的时间型任务（比如设成 30 分钟的「运动」）不算工时
const MINUTES_PER_UNIT = 25;

// 一条记录折算成多少分钟。折算不出来的返回 0。
function minutesOf(record, taskMinutes) {
  // 周末加倍是星星奖励翻了倍，不代表多干了一倍的活，
  // 所以折算要用翻倍前的星数，不然周六的工时会凭空翻倍。
  const baseStars = record.is_weekend_double
    ? Math.round((record.stars || 0) / 2)
    : (record.stars || 0);

  if (record.type === 'quick_time') {
    return baseStars * MINUTES_PER_UNIT;
  }
  if (record.type === 'time_task') {
    const m = taskMinutes[record.task_id];
    return m === MINUTES_PER_UNIT ? m : 0;
  }
  return 0;
}

// 快速记录（单次任务）
// recordType: 'time' 时间型 | 'general' 通用型（不传按通用型）
router.post('/quick', async (req, res) => {
  try {
    const { userId, taskName, stars, recordType } = req.body;

    if (!userId || !taskName || !stars) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    const isTime = recordType === 'time';

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

    // 检查并重置今日星星和掷骰子计数（统一按 last_daily_date 判断跨天）
    await ensureToday(req.redis, userId, date);

    // 更新用户星星
    const userKey = `wishstar:user:${userId}`;

    await req.redis.hincrby(userKey, 'current_stars', starsEarned);
    await req.redis.hincrby(userKey, 'total_stars', starsEarned);
    await req.redis.hincrby(userKey, 'today_stars', starsEarned);

    // 掷骰子次数只认「时间型」的星星：通用型点一下就有一颗，拿它换骰子等于无限刷
    if (isTime) {
      await req.redis.hincrby(userKey, 'today_time_stars', starsEarned);
    }

    // 时间型星星每获得5颗，获得1次掷骰子次数（按今日累计计算）
    const totalDiceCanGet = diceEarnedFrom(await req.redis.hget(userKey, 'today_time_stars'));
    const earnedDiceCount = parseInt(await req.redis.hget(userKey, 'earned_dice_count')) || 0;
    const diceCountToAdd = totalDiceCanGet - earnedDiceCount;
    if (diceCountToAdd > 0) {
      await req.redis.hincrby(userKey, 'today_dice_count', diceCountToAdd);
      await req.redis.hincrby(userKey, 'earned_dice_count', diceCountToAdd);
    }

    // 记录到每日记录（使用北京时间）
    const beijingHour = (hour + 8) % 24;
    let period = 'morning';
    if (beijingHour >= 13 && beijingHour < 18) period = 'afternoon';
    else if (beijingHour >= 18) period = 'evening';

    const record = {
      id: uuidv4(),
      task_id: '',
      task_name: taskName,
      stars: starsEarned,
      type: isTime ? 'quick_time' : 'quick',
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

    // 只有设成 25 分钟的任务才算工时，所以得先把任务表读出来对一下。
    // 记录里只存了 task_id，分钟数在任务自己身上。
    const taskMinutes = {};
    const taskIds = await req.redis.smembers(`wishstar:tasks:index:${userId}`);
    for (const id of (taskIds || [])) {
      const t = await req.redis.hgetall(`wishstar:task:${id}`);
      const m = parseInt(t && t.minutes_per_complete);
      if (m) taskMinutes[id] = m;
    }

    // 统计各时段星星 + 工时
    let totalStars = 0;
    let morningStars = 0;
    let afternoonStars = 0;
    let eveningStars = 0;
    let totalMinutes = 0;
    let morningMinutes = 0;
    let afternoonMinutes = 0;
    let eveningMinutes = 0;

    parsedRecords.forEach(r => {
      totalStars += r.stars;
      const mins = minutesOf(r, taskMinutes);
      totalMinutes += mins;

      if (r.period === 'morning') {
        morningStars += r.stars;
        morningMinutes += mins;
      } else if (r.period === 'afternoon') {
        afternoonStars += r.stars;
        afternoonMinutes += mins;
      } else if (r.period === 'evening') {
        eveningStars += r.stars;
        eveningMinutes += mins;
      }
    });

    res.json({
      code: 0,
      data: {
        date: targetDate,
        totalStars,
        morningStars,
        afternoonStars,
        eveningStars,
        totalMinutes,
        morningMinutes,
        afternoonMinutes,
        eveningMinutes,
        records: parsedRecords
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 删除记录
router.delete('/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { userId, date } = req.query;

    if (!userId || !date) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    // 找到并删除记录
    const records = await req.redis.zrange(`wishstar:records:${userId}:${date}`, 0, -1);
    let deleted = false;

    for (const recordStr of records) {
      const record = JSON.parse(recordStr);
      if (record.id === recordId) {
        await req.redis.zrem(`wishstar:records:${userId}:${date}`, recordStr);

        // 扣除星星
        await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', -record.stars);
        await req.redis.hincrby(`wishstar:user:${userId}`, 'total_stars', -record.stars);

        // 删除今天的记录时，同步回滚今日星星和骰子次数
        const today = new Date().toISOString().split('T')[0];
        if (date === today) {
          await ensureToday(req.redis, userId, today);

          const userKey = `wishstar:user:${userId}`;
          // 回滚今日星星（保证不为负数）
          const todayStars = parseInt(await req.redis.hget(userKey, 'today_stars')) || 0;
          const newTodayStars = Math.max(0, todayStars - record.stars);
          await req.redis.hset(userKey, 'today_stars', newTodayStars.toString());

          // 时间型的记录才回滚今日时间型星星 —— 骰子次数是按它算的
          if (isTimeRecord(record)) {
            const timeStars = parseInt(await req.redis.hget(userKey, 'today_time_stars')) || 0;
            const newTimeStars = Math.max(0, timeStars - record.stars);
            await req.redis.hset(userKey, 'today_time_stars', newTimeStars.toString());
          }

          // 按回滚后的今日时间型星星重新计算应得的骰子次数
          const oldEarnedDiceCount = parseInt(await req.redis.hget(userKey, 'earned_dice_count')) || 0;
          const newEarnedDiceCount = diceEarnedFrom(await req.redis.hget(userKey, 'today_time_stars'));
          await req.redis.hset(userKey, 'earned_dice_count', newEarnedDiceCount.toString());

          // 扣减剩余骰子次数：已用掉的不追回，保证不为负数
          const diceCountToRemove = Math.max(0, oldEarnedDiceCount - newEarnedDiceCount);
          if (diceCountToRemove > 0) {
            const todayDiceCount = parseInt(await req.redis.hget(userKey, 'today_dice_count')) || 0;
            const newDiceCount = Math.max(0, todayDiceCount - diceCountToRemove);
            await req.redis.hset(userKey, 'today_dice_count', newDiceCount.toString());
          }
        }

        deleted = true;
        break;
      }
    }

    if (deleted) {
      res.json({ code: 0, message: '删除成功' });
    } else {
      res.json({ code: 1, message: '记录不存在' });
    }
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
