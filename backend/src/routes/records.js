const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { ensureToday, isTimeRecord, diceEarnedFrom } = require('../services/dailyState');
const { getPeriod } = require('../services/completions');

// 工时不单独存，每次从记录现算（所以删记录工时会自动跟着少）。
// 口径见 docs/核心功能--思考实现系统.md 第 3 条：
//   - 25min型任务的完成记录，一条算 25 分钟
//   - 快速记录里标了时间型的，按基础星数折算，1 颗星 = 25 分钟
//   - 别的时间型任务（比如设成 30 分钟的「运动」）不算工时
const MINUTES_PER_UNIT = 25;

// 时段只能是这四档（就是 getPeriod 的返回值）。快速记录现在允许用户自己选，
// 传进来的值必须落在这个白名单里，别的一律挡掉。
const PERIODS = ['morning', 'afternoon', 'evening', 'other'];

// 日期串格式 YYYY-MM-DD。用的是 UTC 日期，跟记录页的日期选择器同一套口径
// （整套记录系统都按 UTC 日期分桶，包括「今天」的默认值）。
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 某一天是不是周末。**按日期算，不按 created_at 的本地星期算** ——
// 记录是按 UTC 日期分桶的，「星期几」应该是那个桶的属性，同一个桶里的记录
// 才只有一个说法。用本地 getDay() 的话，北京 0-8 点的记录（UTC 日期还停在
// 前一天）会出现「桶算周五、却按周六翻倍」这种自相矛盾的算法。
//
// 注：completions.js 里任务完成那条路径还在用本地 now.getDay()，两处没统一
// （统一会动到任务奖励，是另一件事）。实测现有 23 条记录全部落在北京 9-22 点，
// 两套算法没有任何一条会算出不同结果 —— 所以这里动手不影响已有数据。
function isWeekendDate(dateStr) {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

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
// recordType: 'time' 25min型 | 'general' 通用型（不传按通用型）
// date: 记到哪一天（默认今天）。只允许往前，不允许未来
// period: 算哪个时段（默认按当前时间判）
router.post('/quick', async (req, res) => {
  try {
    const { userId, taskName, stars, recordType, date, period } = req.body;

    if (!userId || !taskName || !stars) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    const isTime = recordType === 'time';

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 补记到哪一天。默认今天，可以往前选，**不允许未来**（还没发生的事没法记），
    // 往前的范围不设限。都是 YYYY-MM-DD 补零格式，字符串比大小就等于比日期。
    const targetDate = date || today;
    if (!DATE_RE.test(targetDate)) {
      return res.status(400).json({ code: 1, message: '日期格式不对' });
    }
    if (targetDate > today) {
      return res.json({ code: 1, message: '不能记录未来的日期' });
    }
    // 「补记」= 记的不是今天。只有这种才跳过今天的计数和掷骰子次数，见下。
    const isBackdated = targetDate !== today;

    // 时段默认按当前时间判；用户传了就用用户的（必须在白名单里）
    const targetPeriod = period || getPeriod(now);
    if (!PERIODS.includes(targetPeriod)) {
      return res.status(400).json({ code: 1, message: '时段不对' });
    }

    // 周末加倍按**所选日期**的星期几算，不按今天 —— 补上周六的记录就该翻倍。
    // 不这么算的话那条的工时（折算时要用翻倍前的星数）会跟着一起错。
    const isWeekend = isWeekendDate(targetDate);

    let starsEarned = parseInt(stars);
    if (isWeekend) {
      starsEarned *= 2;
    }

    const timestamp = now.getTime();
    const userKey = `wishstar:user:${userId}`;

    // 跨天重置统一走这里。补记也要跑：它是「今天」那三个计数的唯一维护点，
    // 跳过去只是把「已经翻篇」这件事推给下一个读接口，没有好处。
    await ensureToday(req.redis, userId, today);

    // 星星总数无条件加 —— 不管记的是哪天，星星确实是这个账号赚到的
    await req.redis.hincrby(userKey, 'current_stars', starsEarned);
    await req.redis.hincrby(userKey, 'total_stars', starsEarned);

    // 「今天」的三项计数和掷骰子次数：**只有记的是今天才动**。
    // 补记到过去那天一律不碰 —— 次数是「今天做了多久」的即时奖励，
    // 补记就能换次数等于可以囤次数（补 40 颗时间型就白拿 8 次）。
    // 而且过去那天的 today_* 是每人单份、按天重置的字段，生来就回填不进去。
    if (!isBackdated) {
      await req.redis.hincrby(userKey, 'today_stars', starsEarned);

      // 掷骰子次数只认「25min 型」的星星：通用型点一下就有一颗，拿它换骰子等于无限刷
      if (isTime) {
        await req.redis.hincrby(userKey, 'today_time_stars', starsEarned);
      }

      // 25min 型星星每获得5颗，获得1次掷骰子次数（按今日累计计算）
      const totalDiceCanGet = diceEarnedFrom(await req.redis.hget(userKey, 'today_time_stars'));
      const earnedDiceCount = parseInt(await req.redis.hget(userKey, 'earned_dice_count')) || 0;
      const diceCountToAdd = totalDiceCanGet - earnedDiceCount;
      if (diceCountToAdd > 0) {
        await req.redis.hincrby(userKey, 'today_dice_count', diceCountToAdd);
        await req.redis.hincrby(userKey, 'earned_dice_count', diceCountToAdd);
      }
    }

    const record = {
      id: uuidv4(),
      task_id: '',
      task_name: taskName,
      stars: starsEarned,
      type: isTime ? 'quick_time' : 'quick',
      period: targetPeriod,
      // 这个标记是「period 是用户亲手选的」的凭证。读的时候（见 GET /）只认
      // 带标记的 period，没标记的照旧按 created_at 现算 —— 老记录里存的 period
      // 是被两套错算法写坏的，直接信会把那批坏数据放回来。见 docs 第 3 条。
      period_source: 'user',
      is_weekend_double: isWeekend,
      created_at: timestamp
    };

    // 记进**所选那天**的桶里（不是今天），记录页翻到那天就能看到
    await req.redis.zadd(`wishstar:records:${userId}:${targetDate}`, timestamp, JSON.stringify(record));

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'income',
      category: 'quick',
      amount: starsEarned,
      description: `快速记录「${taskName}」获得${starsEarned}颗星星${isWeekend ? '（周末加倍）' : ''}` +
        (isBackdated ? `（补记 ${targetDate}）` : ''),
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

    res.json({
      code: 0,
      data: {
        record,
        date: targetDate,
        isBackdated,
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

    // 时段的**默认值按 created_at 现算**，但**用户手选的时段优先**：
    // 只有新写入的快速记录带 period_source: 'user'（就是弹窗里自己选了时段的那种）。
    //
    // 默认按 created_at 现算，是因为老记录里存的 period 是写入当时的快照，
    // 而历史上有过两种算法（见 completions.js 的 getPeriod 注释），凌晨和晚上的
    // 记录都被判错过；现算顺带把老数据也修正过来。
    //
    // 这里区分的是「是不是用户亲手选的」，**不是**「period 字段有没有值」——
    // 直接信 period 会把上面那批坏数据一起放回来。
    // 没存 created_at 的老记录退回用存的那份，再没有就归「其他」。
    const periodOf = (r) => {
      if (r.period_source === 'user' && PERIODS.includes(r.period)) return r.period;
      return r.created_at ? getPeriod(new Date(r.created_at)) : (r.period || 'other');
    };

    // 记录是不是「时间型」的（25min 型任务的完成记录 / 标了 25min 型的快速记录）。
    //
    // **别拿「工时大于 0」当判据**：设成 30 分钟的时间型任务也是时间型（星星
    // 要算进早上/下午/晚上），但它的工时是 0（折算只认同 25 分钟的那个）。
    // 用工时反推会把这一类悄悄挪进「其他」。
    const isTimeRecord = (r) => r.type === 'time_task' || r.type === 'quick_time';

    // 统计各格星星 + 工时。
    //
    // 星星按**两根不同的轴**分（见 docs 第 3 条）：
    //   时间型的 → 按完成时段进 早上 / 下午 / 晚上
    //   非时间型的 → 全进「其他」，不按时段拆
    // 因此**四格之和 === 今日总计**，而「早上」不再包含「到达」那种通用型任务的星星
    // （2026-09-23 改的口径：以前四格是「把一天切成四段」，每格算全部星星）。
    let totalStars = 0;
    let morningStars = 0;
    let afternoonStars = 0;
    let eveningStars = 0;
    let otherStars = 0;
    let totalMinutes = 0;
    let morningMinutes = 0;
    let afternoonMinutes = 0;
    let eveningMinutes = 0;

    parsedRecords.forEach(r => {
      // 回填到记录本身上：明细里显示的时段跟上面统计用的必须是同一个，
      // 不然会出现「明细写早上、但计进了其他」这种对不上的情况
      const period = periodOf(r);
      r.period = period;

      totalStars += r.stars;
      const mins = minutesOf(r, taskMinutes);
      totalMinutes += mins;

      if (!isTimeRecord(r)) {
        // 非时间型的没有工时，下面那几段一段都不进
        otherStars += r.stars;
        return;
      }

      if (period === 'morning') {
        morningStars += r.stars;
        morningMinutes += mins;
      } else if (period === 'afternoon') {
        afternoonStars += r.stars;
        afternoonMinutes += mins;
      } else if (period === 'evening') {
        eveningStars += r.stars;
        eveningMinutes += mins;
      } else {
        // 剩下的只有「0-6 点的时间型记录」这一种（getPeriod 的 other）。
        // **暂时也落在「其他」里，但不能让它消失** —— 四格之和必须还是等于今日总计。
        // 「其他」现在的主含义是「非时间型」，0-6 点这一档怎么算还没定（用户口径：
        // 碰上了再定）；等定了再把它拆出去，别在这儿悄悄丢掉一笔星星。
        otherStars += r.stars;
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
        otherStars,
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
