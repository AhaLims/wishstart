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
const { countRemaining, countTotal, enrichDraw } = require('../services/spirits');

// 页面上展示多久以内的流水。存储里不删，只是不往页面上搬。
const STARLIGHT_LOG_DAYS = 7;

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

  // 流水只给页面最近 50 条、且只给 7 天内的（哪个更严就按哪个）。
  //
  // 存储里的流水一条都不删 —— 那是历史记录。这里只是不往页面上搬：
  // 再往前的既翻不到也没人看，白白占一份响应体。
  const logCutoff = Date.now() - STARLIGHT_LOG_DAYS * 24 * 3600 * 1000;
  const rawLogs = await store.zrevrange(logKey(userId), 0, 49);
  const logs = rawLogs
    .map((l) => JSON.parse(l))
    .filter((l) => (l && l.created_at ? l.created_at : 0) >= logCutoff);

  // 今日抽到的精灵（抽到的先后顺序），以及池子里还剩多少只没抽到。
  // poolTotal 是给前端分辨「今天抽完了」和「池子没加载出来」用的。
  //
  // 这里就把详情（立绘、介绍、属性…）补全，而不是另开一个「查精灵详情」的接口：
  // 卡片点开的详情弹窗用的就是这份数据，数据本来就在池子内存里，现查是零成本的，
  // 多跑一趟接口只会让弹窗多转一次圈。按 id 而不是编号去重，理由同 services 那边。
  const todayDraws = (await loadDraws(store, userId, state.date)).map(enrichDraw);
  const poolRemaining = countRemaining(new Set(todayDraws.map((d) => d.id).filter(Boolean)));

  return {
    ...state,
    tasks,
    logs,
    maxDailyStars: MAX_DAILY_STARS,
    todayDraws,
    poolRemaining,
    poolTotal: countTotal()
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
