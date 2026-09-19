const express = require('express');
const router = express.Router();
const { ensureToday } = require('../services/dailyState');

// 获取用户统计
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 检查并重置今日掷骰子计数（统一按 last_daily_date 判断跨天）
    await ensureToday(req.redis, userId, today);

    // 获取用户信息
    const user = await req.redis.hgetall(`wishstar:user:${userId}`);

    // 获取任务统计
    const taskIds = await req.redis.smembers(`wishstar:tasks:index:${userId}`);
    let totalTasks = 0;
    let activeTasks = 0;

    for (const taskId of taskIds) {
      const task = await req.redis.hgetall(`wishstar:task:${taskId}`);
      if (task && task.id) {
        totalTasks++;
        if (task.status === 'active') {
          activeTasks++;
        }
      }
    }

    // 获取愿望统计
    const wishIds = await req.redis.smembers(`wishstar:wishes:index:${userId}`);
    let completedWishes = 0;

    for (const wishId of wishIds) {
      const wish = await req.redis.hgetall(`wishstar:wish:${wishId}`);
      if (wish && wish.status === 'completed') {
        completedWishes++;
      }
    }

    const totalStars = parseInt(user.total_stars) || 0;
    // 返回半价抽卡次数
    const halfDrawCount = parseInt(user.half_draw_count) || 0;
    // 返回掷骰子次数（今日有效）
    const diceCount = parseInt(user.today_dice_count) || 0;

    res.json({
      code: 0,
      data: {
        totalStars,
        currentStars: parseInt(user.current_stars) || 0,
        todayStars: parseInt(user.today_stars) || 0,
        drawCount: parseInt(user.draw_count) || 0,
        diceCount: diceCount,
        halfDrawCount: halfDrawCount,
        completedWishes,
        totalTasks,
        activeTasks
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取流水
router.get('/logs', async (req, res) => {
  try {
    const { userId, limit } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const max = limit ? parseInt(limit) : 50;
    const logs = await req.redis.zrevrange(`wishstar:logs:${userId}`, 0, max - 1);
    const parsedLogs = logs.map(l => JSON.parse(l));

    res.json({ code: 0, data: parsedLogs });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
