// 工作时间会话 + 时间型任务结算
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getBeijingDate } = require('../services/beijingDate');
const { getDailyWorkSeconds, getTimeTaskProgress, settleTimeTasks } = require('../services/settleWork');

// 获取运行中的会话
async function getRunningSession(store, userId) {
  const today = getBeijingDate();
  const ids = await store.zrange(`wishstar:work_sessions:${userId}:${today}`, 0, -1);
  for (const id of ids) {
    const s = await store.hgetall(`wishstar:work_session:${id}`);
    if (s && s.status === 'running') return s;
  }
  return null;
}

// 开始工作会话
router.post('/sessions', async (req, res) => {
  try {
    const { userId, mode, plannedMinutes } = req.body;
    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const running = await getRunningSession(req.redis, userId);
    if (running) {
      return res.json({ code: 1, message: '已有进行中的工作会话，请先结束' });
    }

    const m = mode === 'countdown' ? 'countdown' : 'count_up';
    const now = new Date();
    const ts = now.getTime();
    const session = {
      id: uuidv4(),
      user_id: userId,
      date: getBeijingDate(now),
      mode: m,
      planned_minutes: m === 'countdown' ? (parseInt(plannedMinutes) || 25).toString() : '0',
      started_at: ts.toString(),
      ended_at: '',
      actual_seconds: '0',
      completed: '0',
      status: 'running',
      created_at: ts.toString()
    };

    await req.redis.hset(`wishstar:work_session:${session.id}`, session);
    await req.redis.zadd(`wishstar:work_sessions:${userId}:${session.date}`, ts, session.id);

    res.json({ code: 0, data: session });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 结束工作会话（触发时间型任务结算）
router.post('/sessions/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;
    const session = await req.redis.hgetall(`wishstar:work_session:${id}`);

    if (!session || !session.id) {
      return res.status(404).json({ code: 1, message: '会话不存在' });
    }
    if (session.status !== 'running') {
      return res.json({ code: 1, message: '会话已结束' });
    }

    const now = new Date();
    const endedAt = now.getTime();
    const startedAt = parseInt(session.started_at) || endedAt;
    const elapsedSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));

    const isCountdown = session.mode === 'countdown';
    const isCompleted = completed === true || completed === '1' || completed === 1;

    // 倒计时完整走完按计划分钟计；正计时/中途停止按实际秒数计
    let actualSeconds = elapsedSeconds;
    if (isCountdown && isCompleted) {
      actualSeconds = (parseInt(session.planned_minutes) || 25) * 60;
    }
    const status = isCountdown && !isCompleted ? 'stopped' : 'completed';

    await req.redis.hset(`wishstar:work_session:${id}`, {
      ended_at: endedAt.toString(),
      actual_seconds: actualSeconds.toString(),
      completed: isCompleted ? '1' : '0',
      status
    });

    // 结算（归属会话开始当天）
    const date = session.date;
    const result = await settleTimeTasks(req.redis, session.user_id, date);
    const dailyTotalSeconds = await getDailyWorkSeconds(req.redis, session.user_id, date);

    res.json({
      code: 0,
      data: {
        sessionId: id,
        mode: session.mode,
        actualSeconds,
        status,
        date,
        dailyTotalSeconds,
        settled: result.settled
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 手动触发结算（工作期间每满一个周期，前端检测到阈值跨过后调用；会话继续运行）
router.post('/settle', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }
    const date = getBeijingDate();
    const running = await getRunningSession(req.redis, userId);
    let extraSeconds = 0;
    if (running) {
      extraSeconds = Math.max(0, Math.floor((Date.now() - parseInt(running.started_at)) / 1000));
    }
    const result = await settleTimeTasks(req.redis, userId, date, extraSeconds);
    res.json({ code: 0, data: result });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 今日工作汇总（会话列表 + 总秒数 + 时间型任务进度）
router.get('/today', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const date = getBeijingDate();
    const ids = await req.redis.zrange(`wishstar:work_sessions:${userId}:${date}`, 0, -1);
    const sessions = [];
    for (const id of ids) {
      const s = await req.redis.hgetall(`wishstar:work_session:${id}`);
      if (s && s.id) sessions.push(s);
    }

    const dailyTotalSeconds = await getDailyWorkSeconds(req.redis, userId, date);
    const progress = await getTimeTaskProgress(req.redis, userId, date);

    res.json({
      code: 0,
      data: {
        date,
        totalSeconds: dailyTotalSeconds,
        sessions,
        timeTasks: progress.tasks
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 当前运行中的会话（App 重启后恢复）
router.get('/status', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }
    const running = await getRunningSession(req.redis, userId);
    res.json({ code: 0, data: running });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
