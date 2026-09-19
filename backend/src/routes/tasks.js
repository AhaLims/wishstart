const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { ensureToday } = require('../services/dailyState');
const { applyTaskCompletion } = require('../services/completions');

const PREFIX = 'wishstar:task';

// 创建任务
router.post('/', async (req, res) => {
  try {
    const { userId, name, starsPerComplete, maxComplete, rewardStars, rewardHalfDraw, rewardDraw, taskType, minutesPerComplete } = req.body;

    const taskId = uuidv4();
    const now = Date.now();

    const task = {
      id: taskId,
      user_id: userId,
      name: name,
      task_type: taskType === 'time' ? 'time' : 'general',
      minutes_per_complete: taskType === 'time' ? (minutesPerComplete || 25) : '0',
      stars_per_complete: starsPerComplete !== undefined ? starsPerComplete : 5,
      max_complete: maxComplete || 0,
      current_complete: '0',
      reward_stars: rewardStars ? '1' : '0',
      reward_half_draw: rewardHalfDraw ? '1' : '0',
      reward_draw: rewardDraw ? '1' : '0',
      status: 'active',
      created_at: now.toString(),
      updated_at: now.toString()
    };

    await req.redis.hset(`${PREFIX}:${taskId}`, task);
    await req.redis.sadd(`wishstar:tasks:index:${userId}`, taskId);

    res.json({ code: 0, data: task });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取任务列表
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const taskIds = await req.redis.smembers(`wishstar:tasks:index:${userId}`);
    const tasks = [];

    for (const taskId of taskIds) {
      const task = await req.redis.hgetall(`${PREFIX}:${taskId}`);
      if (task && task.id) {
        tasks.push(task);
      }
    }

    res.json({ code: 0, data: tasks });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取单个任务
router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await req.redis.hgetall(`${PREFIX}:${taskId}`);

    if (!task || !task.id) {
      return res.status(404).json({ code: 1, message: '任务不存在' });
    }

    res.json({ code: 0, data: task });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 更新任务
router.put('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { name, starsPerComplete, maxComplete, rewardStars, rewardHalfDraw, rewardDraw, taskType, minutesPerComplete } = req.body;

    const updates = {
      updated_at: Date.now().toString()
    };

    if (name) updates.name = name;
    if (taskType !== undefined) updates.task_type = taskType === 'time' ? 'time' : 'general';
    if (minutesPerComplete !== undefined) updates.minutes_per_complete = minutesPerComplete;
    if (starsPerComplete !== undefined) updates.stars_per_complete = starsPerComplete;
    if (maxComplete !== undefined) updates.max_complete = maxComplete;
    if (rewardStars !== undefined) updates.reward_stars = rewardStars ? '1' : '0';
    if (rewardHalfDraw !== undefined) updates.reward_half_draw = rewardHalfDraw ? '1' : '0';
    if (rewardDraw !== undefined) updates.reward_draw = rewardDraw ? '1' : '0';

    await req.redis.hset(`${PREFIX}:${taskId}`, updates);

    const task = await req.redis.hgetall(`${PREFIX}:${taskId}`);
    res.json({ code: 0, data: task });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 删除任务
router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await req.redis.hgetall(`${PREFIX}:${taskId}`);

    if (task && task.user_id) {
      await req.redis.srem(`wishstar:tasks:index:${task.user_id}`, taskId);
    }

    await req.redis.del(`${PREFIX}:${taskId}`);

    res.json({ code: 0, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 完成任务
router.post('/:taskId/complete', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await req.redis.hgetall(`${PREFIX}:${taskId}`);

    if (!task || !task.id) {
      return res.status(404).json({ code: 1, message: '任务不存在' });
    }

    if (task.status === 'finished') {
      return res.json({ code: 1, message: '该任务已完成' });
    }

    const maxComplete = parseInt(task.max_complete) || 0;
    const currentComplete = parseInt(task.current_complete) || 0;

    if (maxComplete > 0 && currentComplete >= maxComplete) {
      return res.json({ code: 1, message: '该任务已完成' });
    }

    const result = await applyTaskCompletion(req.redis, task, { category: 'task' });

    res.json({
      code: 0,
      data: {
        starsEarned: result.starsEarned,
        isWeekendDouble: result.isWeekendDouble,
        starsAfterDouble: result.starsEarned,
        rewards: result.rewards
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
