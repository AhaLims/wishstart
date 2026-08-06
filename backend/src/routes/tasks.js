const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const PREFIX = 'wishstar:task';

// 创建任务
router.post('/', async (req, res) => {
  try {
    const { userId, name, starsPerComplete, maxComplete, rewardStars, rewardHalfDraw, rewardDraw } = req.body;

    const taskId = uuidv4();
    const now = Date.now();

    const task = {
      id: taskId,
      user_id: userId,
      name: name,
      stars_per_complete: starsPerComplete || 5,
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
    const { name, starsPerComplete, maxComplete, rewardStars, rewardHalfDraw, rewardDraw } = req.body;

    const updates = {
      updated_at: Date.now().toString()
    };

    if (name) updates.name = name;
    if (starsPerComplete) updates.stars_per_complete = starsPerComplete;
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

    const userId = task.user_id;
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const timestamp = now.getTime();

    // 计算获得的星星
    let starsEarned = parseInt(task.stars_per_complete) || 5;
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    if (isWeekend) {
      starsEarned *= 2;
    }

    // 更新用户星星
    await req.redis.hincrby(`wishstar:user:${userId}`, 'current_stars', starsEarned);
    await req.redis.hincrby(`wishstar:user:${userId}`, 'total_stars', starsEarned);

    // 每获得5颗星星，获得1次掷骰子次数
    const diceCountToAdd = Math.floor(starsEarned / 5);
    if (diceCountToAdd > 0) {
      await req.redis.hincrby(`wishstar:user:${userId}`, 'half_draw_count', diceCountToAdd);
    }

    // 更新任务完成次数
    const newComplete = currentComplete + 1;
    await req.redis.hset(`${PREFIX}:${taskId}`, 'current_complete', newComplete.toString());
    await req.redis.hset(`${PREFIX}:${taskId}`, 'updated_at', Date.now().toString());

    // 如果达到最大次数，标记为完成
    if (maxComplete > 0 && newComplete >= maxComplete) {
      await req.redis.hset(`${PREFIX}:${taskId}`, 'status', 'finished');
    }

    // 记录奖励
    const rewards = [];
    if (task.reward_stars === '1') {
      rewards.push('星星');
    }
    if (task.reward_half_draw === '1') {
      await req.redis.hincrby(`wishstar:user:${userId}`, 'half_draw_count', 1);
      rewards.push('半价抽卡');
    }
    if (task.reward_draw === '1') {
      await req.redis.hincrby(`wishstar:user:${userId}`, 'draw_count', 1);
      rewards.push('抽卡');
    }

    // 记录到每日记录
    const record = {
      id: uuidv4(),
      task_id: taskId,
      task_name: task.name,
      stars: starsEarned,
      type: 'task',
      period: getPeriod(now.getHours()),
      is_weekend_double: isWeekend,
      rewards: rewards.join(','),
      created_at: timestamp
    };

    await req.redis.zadd(`wishstar:records:${userId}:${date}`, timestamp, JSON.stringify(record));

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'income',
      category: 'task',
      amount: starsEarned,
      description: `完成任务「${task.name}」获得${starsEarned}颗星星${isWeekend ? '（周末加倍）' : ''}`,
      created_at: timestamp
    };
    await req.redis.zadd(`wishstar:logs:${userId}`, timestamp, JSON.stringify(log));

    res.json({
      code: 0,
      data: {
        starsEarned,
        isWeekendDouble: isWeekend,
        starsAfterDouble: starsEarned,
        rewards
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 判断时段
function getPeriod(hour) {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

module.exports = router;
