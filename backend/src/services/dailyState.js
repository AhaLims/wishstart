// 统一管理“今日”相关的每日计数
// （today_stars / today_time_stars / today_dice_count / earned_dice_count）
// 所有会读写这些字段的接口（任务、骰子、快速记录、统计）都通过这里判断是否跨天，
// 避免多个接口各自维护日期标记、互相把对方已经加好的计数清零。
//
// today_stars 是今日拿到的全部星星（记录页、首页显示用）；
// today_time_stars 只装「时间型」得来的星星，掷骰子次数按它算。

// 获取日期字符串（与项目现有逻辑一致，按 UTC 日期）
function getToday(now = new Date()) {
  return now.toISOString().split('T')[0];
}

// 重置今日计数，并统一更新所有日期标记
async function resetToday(redis, key, date) {
  await redis.hset(key, {
    today_stars: '0',
    today_time_stars: '0',
    today_dice_count: '0',
    earned_dice_count: '0',
    last_daily_date: date,
    last_task_date: date,
    last_dice_date: date
  });
}

// 一条记录算不算「时间型」得来的。
// 掷骰子次数只认时间型的星星，所以任务记录和快速记录都得能判出来。
function isTimeRecord(record) {
  return record.type === 'time_task' || record.type === 'quick_time';
}

// 时间型星星每满 5 颗换 1 次掷骰子次数
function diceEarnedFrom(timeStars) {
  return Math.floor((parseInt(timeStars) || 0) / 5);
}

// 确保今日状态已初始化：
// - 如果已跨天，清零今日计数并更新日期标记
// - 兼容旧数据：首次使用时如果还没有 last_daily_date，
//   取旧的 last_task_date / last_dice_date 中较新的日期作为初始值，
//   避免升级后第一次请求就把当天已有的计数清掉
// 返回 true 表示发生了跨天重置
async function ensureToday(redis, userId, date) {
  const key = `wishstar:user:${userId}`;
  const lastDailyDate = await redis.hget(key, 'last_daily_date');

  if (lastDailyDate === null) {
    const [lastTaskDate, lastDiceDate] = await Promise.all([
      redis.hget(key, 'last_task_date'),
      redis.hget(key, 'last_dice_date')
    ]);
    const lastDate = (lastTaskDate > lastDiceDate) ? lastTaskDate : lastDiceDate;

    if (lastDate === date) {
      // 今天已经有过活动，保留当前计数，只补齐统一日期标记
      await redis.hset(key, 'last_daily_date', date);
      return false;
    }

    await resetToday(redis, key, date);
    return true;
  }

  if (lastDailyDate !== date) {
    await resetToday(redis, key, date);
    return true;
  }

  return false;
}

module.exports = { getToday, ensureToday, isTimeRecord, diceEarnedFrom };
