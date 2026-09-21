// 完成任务奖励发放（手动完成 / 时间型任务自动结算共用）
// 保证两种来源的奖励、计数、记录、流水行为完全一致。
const { v4: uuidv4 } = require('uuid');
const { getBeijingHour } = require('./beijingDate');

// 北京时间时段：早上 6-13，下午 13-18，晚上 18-24（核心功能文档口径）
function getPeriod(now = new Date()) {
  const h = getBeijingHour(now);
  if (h >= 6 && h < 13) return 'morning';
  if (h >= 13 && h < 18) return 'afternoon';
  return 'evening';
}

// task: hgetall 返回的任务对象（字符串字段）
// options.dateKey: 每日记录键使用的日期（手动完成传 UTC 日期保持原行为；时间型任务传北京时间日期）
// options.category: 'task' | 'time_task' —— 调用方来源（手动完成按钮 / 工时自动结算），只用来标记流水来源
async function applyTaskCompletion(store, task, options = {}) {
  const { now = new Date(), dateKey, category = 'task' } = options;
  const userId = task.user_id;
  const timestamp = now.getTime();
  const utcDate = now.toISOString().split('T')[0];
  const recordDate = dateKey || utcDate;

  // 「是不是时间型」看任务自己的类型，不看是谁调用的。
  // 网页端没有计时器，时间型任务只能靠手动完成按钮，按调用方判断的话
  // 网页端的时间型星星永远算不进掷骰子次数。
  const isTimeTask = task.task_type === 'time';

  const { ensureToday, diceEarnedFrom } = require('./dailyState');
  await ensureToday(store, userId, utcDate);

  let starsEarned = parseInt(task.stars_per_complete);
  if (isNaN(starsEarned)) starsEarned = 5;
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  if (isWeekend) starsEarned *= 2;

  const userKey = `wishstar:user:${userId}`;

  await store.hincrby(userKey, 'current_stars', starsEarned);
  await store.hincrby(userKey, 'total_stars', starsEarned);
  await store.hincrby(userKey, 'today_stars', starsEarned);

  // 掷骰子次数只跟「时间型」得来的星星挂钩。通用型任务点一下就有一颗星，
  // 拿它换骰子等于可以无限刷，所以单独记一份 today_time_stars。
  if (isTimeTask) {
    await store.hincrby(userKey, 'today_time_stars', starsEarned);
  }

  // 时间型星星每满 5 颗获得 1 次掷骰子次数（按今日累计计算）
  const totalDiceCanGet = diceEarnedFrom(await store.hget(userKey, 'today_time_stars'));
  const earnedDiceCount = parseInt(await store.hget(userKey, 'earned_dice_count')) || 0;
  const diceCountToAdd = totalDiceCanGet - earnedDiceCount;
  if (diceCountToAdd > 0) {
    await store.hincrby(`wishstar:user:${userId}`, 'today_dice_count', diceCountToAdd);
    await store.hincrby(`wishstar:user:${userId}`, 'earned_dice_count', diceCountToAdd);
  }

  // 更新任务完成次数
  const newComplete = (parseInt(task.current_complete) || 0) + 1;
  await store.hset(`wishstar:task:${task.id}`, 'current_complete', newComplete.toString());
  await store.hset(`wishstar:task:${task.id}`, 'updated_at', Date.now().toString());

  const maxComplete = parseInt(task.max_complete) || 0;
  let maxReached = false;
  if (maxComplete > 0 && newComplete >= maxComplete) {
    await store.hset(`wishstar:task:${task.id}`, 'status', 'finished');
    maxReached = true;
  }

  // 记录奖励
  const rewards = [];
  if (task.reward_stars === '1') {
    rewards.push('星星');
  }
  if (task.reward_half_draw === '1') {
    await store.hincrby(`wishstar:user:${userId}`, 'half_draw_count', 1);
    rewards.push('半价抽卡');
  }
  if (task.reward_draw === '1') {
    await store.hincrby(`wishstar:user:${userId}`, 'draw_count', 1);
    rewards.push('抽卡');
  }

  // 记录到每日记录
  const record = {
    id: uuidv4(),
    task_id: task.id,
    task_name: task.name,
    stars: starsEarned,
    type: isTimeTask ? 'time_task' : 'task',
    period: getPeriod(now),
    is_weekend_double: isWeekend,
    rewards: rewards.join(','),
    created_at: timestamp
  };
  await store.zadd(`wishstar:records:${userId}:${recordDate}`, timestamp, JSON.stringify(record));

  // 记录流水
  const log = {
    id: uuidv4(),
    type: 'income',
    category,
    amount: starsEarned,
    description: `${isTimeTask ? '工作结算' : '完成任务'}「${task.name}」获得${starsEarned}颗星星${isWeekend ? '（周末加倍）' : ''}`,
    created_at: timestamp
  };
  await store.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

  return { starsEarned, isWeekendDouble: isWeekend, rewards, record, log, newComplete, maxReached };
}

module.exports = { applyTaskCompletion, getPeriod };
