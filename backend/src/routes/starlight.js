// 星光值：独立于星星体系的小玩法。页面在 /starlight。
// 规则细节见 services/starlight.js 顶部的注释。
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  MAX_DAILY_STARS,
  taskKey,
  taskIndexKey,
  logKey,
  loadDraws,
  ensureStarlight,
  completeStarlightTask,
  collectStars
} = require('../services/starlight');
const { countRemaining } = require('../services/spirits');

// 组装一份完整状态：
// 当前星光值 + 待入库 + 已入库 + 今日抽到的精灵 + 任务列表 + 流水
async function buildState(store, userId) {
  const state = await ensureStarlight(store, userId);

  const taskIds = await store.smembers(taskIndexKey(userId));
  const tasks = [];
  for (const taskId of taskIds) {
    const task = await store.hgetall(taskKey(taskId));
    if (task && task.id) tasks.push(task);
  }
  // 新建的排在前面
  tasks.sort((a, b) => (parseInt(b.created_at) || 0) - (parseInt(a.created_at) || 0));

  const rawLogs = await store.zrevrange(logKey(userId), 0, 49);
  const logs = rawLogs.map((l) => JSON.parse(l));

  // 今日抽到的精灵（抽到的先后顺序），以及池子里还剩多少只没抽到
  const todayDraws = await loadDraws(store, userId, state.date);
  const poolRemaining = countRemaining(new Set(todayDraws.map((d) => d.number)));

  return {
    ...state,
    tasks,
    logs,
    maxDailyStars: MAX_DAILY_STARS,
    todayDraws,
    poolRemaining
  };
}

// 获取星光值状态（含任务列表和流水）
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    res.json({ code: 0, data: await buildState(req.redis, userId) });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 创建星光值任务（只需要名称，星光值来自抽到的精灵）
router.post('/tasks', async (req, res) => {
  try {
    const { userId, name } = req.body;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }
    if (!name || !String(name).trim()) {
      return res.json({ code: 1, message: '任务名称不能为空' });
    }

    const taskId = uuidv4();
    const now = Date.now();

    const task = {
      id: taskId,
      user_id: userId,
      name: String(name).trim(),
      complete_count: '0',
      created_at: String(now),
      updated_at: String(now)
    };

    await req.redis.hset(taskKey(taskId), task);
    await req.redis.sadd(taskIndexKey(userId), taskId);

    res.json({ code: 0, data: task });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 修改星光值任务（只能改名）
router.put('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { name } = req.body;

    const task = await req.redis.hgetall(taskKey(taskId));
    if (!task || !task.id) {
      return res.status(404).json({ code: 1, message: '任务不存在' });
    }

    const updates = { updated_at: String(Date.now()) };

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.json({ code: 1, message: '任务名称不能为空' });
      }
      updates.name = String(name).trim();
    }

    await req.redis.hset(taskKey(taskId), updates);

    res.json({ code: 0, data: await req.redis.hgetall(taskKey(taskId)) });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 删除星光值任务
router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await req.redis.hgetall(taskKey(taskId));

    if (task && task.user_id) {
      await req.redis.srem(taskIndexKey(task.user_id), taskId);
    }
    await req.redis.del(taskKey(taskId));

    res.json({ code: 0, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 完成一次星光值任务：抽一只今天还没抽到过的精灵，把它的星光值加进来
router.post('/tasks/:taskId/complete', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await req.redis.hgetall(taskKey(taskId));

    if (!task || !task.id) {
      return res.status(404).json({ code: 1, message: '任务不存在' });
    }

    const result = await completeStarlightTask(req.redis, task);
    // 当天精灵抽完了：不是错误，就是没得抽了，提示一下
    if (result.error) {
      return res.json({ code: 1, message: result.error });
    }

    // 回完整状态（含任务列表、流水、今日精灵），不然前端拿到的还是旧的，
    // 完成次数和刚抽到的精灵要刷新页面才会更新
    const state = await buildState(req.redis, task.user_id);

    res.json({
      code: 0,
      data: {
        spirit: result.spirit,
        earned: result.earned,
        state: {
          ...state,
          // 这两个只跟「这一次」有关，不入库，只在响应里带出去
          condensedNow: result.state.condensedNow,
          spentNow: result.state.spentNow
        }
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 入库：把待入库的许愿星收进总数
router.post('/collect', async (req, res) => {
  try {
    const { userId, count } = req.body;
    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const result = await collectStars(req.redis, userId, count);
    if (result.error) {
      return res.json({ code: 1, message: result.error });
    }

    res.json({
      code: 0,
      data: {
        collected: result.collected,
        state: await buildState(req.redis, userId)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
