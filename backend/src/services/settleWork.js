// 时间型任务结算
// 当日总工时（秒）→ 每个时间型任务按 floor(总分钟 / minutes_per_complete) 折算完成次数，
// 与「当日已结算次数」（wishstar:task_credits:{userId}:{date}）取差额补齐。
// 每日从 0 开始，余数不跨天滚存。
const { applyTaskCompletion } = require('./completions');

// 当日总工作秒数（所有会话 actual_seconds 之和）
async function getDailyWorkSeconds(store, userId, date) {
  const ids = await store.zrange(`wishstar:work_sessions:${userId}:${date}`, 0, -1);
  let total = 0;
  for (const id of ids) {
    const s = await store.hgetall(`wishstar:work_session:${id}`);
    if (s && s.actual_seconds) {
      total += parseInt(s.actual_seconds) || 0;
    }
  }
  return total;
}

// 各时间型任务今日进度（用于页面展示）
async function getTimeTaskProgress(store, userId, date, extraSeconds = 0) {
  const totalMinutes = Math.floor(((await getDailyWorkSeconds(store, userId, date)) + extraSeconds) / 60);
  const taskIds = await store.smembers(`wishstar:tasks:index:${userId}`);
  const tasks = [];
  for (const taskId of taskIds) {
    const task = await store.hgetall(`wishstar:task:${taskId}`);
    if (!task || task.task_type !== 'time') continue;
    const perMinutes = parseInt(task.minutes_per_complete) || 25;
    tasks.push({
      taskId,
      name: task.name,
      minutesPerComplete: perMinutes,
      earned: Math.floor(totalMinutes / perMinutes),
      totalMinutes
    });
  }
  return { totalMinutes, tasks };
}

// 结算（幂等）：按当日总工时补齐各时间型任务的完成次数
// extraSeconds: 运行中会话的实时时长（工作期间的阈值结算需要计入）
async function settleTimeTasks(store, userId, date, extraSeconds = 0) {
  const { totalMinutes, tasks } = await getTimeTaskProgress(store, userId, date, extraSeconds);
  const settled = [];

  for (const t of tasks) {
    if (t.earned <= 0) continue;
    const creditKey = `wishstar:task_credits:${userId}:${date}`;
    const credited = parseInt(await store.hget(creditKey, t.taskId)) || 0;
    const toAdd = t.earned - credited;
    if (toAdd <= 0) continue;

    const added = [];
    for (let i = 0; i < toAdd; i++) {
      const freshTask = await store.hgetall(`wishstar:task:${t.taskId}`);
      if (!freshTask || freshTask.status !== 'active') break;
      const result = await applyTaskCompletion(store, freshTask, {
        dateKey: date,
        category: 'time_task'
      });
      added.push(result);
    }
    if (added.length > 0) {
      await store.hset(creditKey, t.taskId, (credited + added.length).toString());
      settled.push({
        taskId: t.taskId,
        name: t.name,
        addedCount: added.length,
        starsEarned: added.reduce((sum, r) => sum + r.starsEarned, 0)
      });
    }
  }

  return { totalMinutes, settled };
}

module.exports = { getDailyWorkSeconds, getTimeTaskProgress, settleTimeTasks };
