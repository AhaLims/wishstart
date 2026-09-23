// 星光值：独立于星星体系的小玩法。页面在 /starlight。
// 规则细节见 services/starlight.js 顶部的注释。
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  MAX_DAILY_STARS,
  TASK_DOING,
  TASK_STATUS_LABEL,
  TASK_ACTIONS,
  taskKey,
  taskIndexKey,
  doneIndexKey,
  logKey,
  loadDraws,
  ensureStarlight,
  taskStatus,
  advanceTask
} = require('../services/starlight');
const { countRemaining, countTotal, enrichDraw } = require('../services/spirits');

// 页面上展示多久以内的流水。存储里不删，只是不往页面上搬。
const STARLIGHT_LOG_DAYS = 7;

// 已完成区一次搬多少条。存储里全留着，这里只是不把全部搬到页面上 ——
// 任务现在只增不减，攒半年之后这个列表会很长，而人只看最近划掉的几条。
// 多的前端折叠（见 docs 9.5）。总数照报，不然「已完成 137 条」会变成 30
const FINISHED_LIMIT = 30;

// 给任务挂上「现在能点哪些动作」和状态文案，全部从 TASK_ACTIONS 推。
// **前端照着这个渲染按钮，不自己判断 status** —— 那等于把状态机抄了第二份，
// 两边早晚走偏（后端加个状态，前端就少一个按钮或者多一个点不动的）
function withActions(task) {
  const status = taskStatus(task);
  return {
    ...task,
    status,
    statusLabel: TASK_STATUS_LABEL[status],
    actions: Object.entries(TASK_ACTIONS)
      .filter(([, spec]) => spec.from.includes(status))
      // draw 告诉前端点这个会不会弹精灵结果卡（「放弃」不抽，就没有卡）
      .map(([key, spec]) => ({ key, label: spec.label, draw: spec.draw }))
  };
}

// 组装一份完整状态：
// 许愿星（当天 / 总数）+ 洛克贝（当天 / 总数）+ 进度 + 今日抽到的精灵
// + 任务列表 + 流水。星光值本身也在里面，但页面不显示那个数字。
async function buildState(store, userId) {
  const state = await ensureStarlight(store, userId);

  const taskIds = await store.smembers(taskIndexKey(userId));
  const tasks = [];
  for (const taskId of taskIds) {
    const task = await store.hgetall(taskKey(taskId));
    if (task && task.id) tasks.push(withActions(task));
  }
  // 进行中的顶到最上面（那是「现在手上这件事」），其余按创建时间**正序** ——
  // 待办清单是老的在上、新加的沉到底，跟改之前「新建的排最前」正好反过来。
  // 排序放这儿而不是前端：已完成那边是按结束时刻倒序的，两边口径得一致
  tasks.sort((a, b) => {
    if (a.status !== b.status) return a.status === TASK_DOING ? -1 : 1;
    return (parseInt(a.created_at) || 0) - (parseInt(b.created_at) || 0);
  });

  // 已完成 / 已放弃：按划掉的时间倒序（最近划的在最前）。
  // 索引里全留着，只往前 30 条读详情，但总数报全量
  const finishedIds = await store.zrevrange(doneIndexKey(userId), 0, -1);
  const finished = [];
  for (const taskId of finishedIds.slice(0, FINISHED_LIMIT)) {
    const task = await store.hgetall(taskKey(taskId));
    // 任务 hash 没了但索引还留着的脏数据，跳过 —— 详情还得从 hash 里读，
    // 读不到就没法渲染。删任务是两把索引一起清的，这儿只是兜一道
    if (task && task.id) finished.push(withActions(task));
  }

  // 流水只给页面最近 50 条、且只给 7 天内的（哪个更严就按哪个）。
  //
  // 存储里的流水一条都不删 —— 那是历史记录。这里只是不往页面上搬：
  // 再往前的既翻不到也没人看，白白占一份响应体。
  //
  // **只搬洛克贝的**（unit === '洛克贝'）：用户要求记录里只留洛克贝流水，
  // 不出现星光值和许愿星的。以前那些 unit 是 '星光值'（抽卡进账、自动凝结）
  // 和 '颗'（手动入库）的老条目就留在存储里，不往页面上搬了 —— 老流水隐藏。
  // 过滤放在后端而不是前端，是因为这个接口是唯一的出口：
  // 前端自己滤的话，哪天新加一个页面就得再记一次「记得滤掉星光值」。
  const logCutoff = Date.now() - STARLIGHT_LOG_DAYS * 24 * 3600 * 1000;
  const rawLogs = await store.zrevrange(logKey(userId), 0, 49);
  const logs = rawLogs
    .map((l) => JSON.parse(l))
    .filter((l) => l && l.unit === '洛克贝')
    .filter((l) => (l.created_at || 0) >= logCutoff);

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
    finished,
    // 已完成的总条数（可能大于 finished.length，多的在前端折叠里）
    finishedTotal: finishedIds.length,
    finishedLimit: FINISHED_LIMIT,
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
      // 新建的一律是待办态。**这一行不能省** —— 老任务靠「缺 status 就当 todo」
      // 兼容，但新任务得写实了，不然以后 status 的判据一改就全乱
      status: 'todo',
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
      // **两把索引都要清。** 只清待办索引的话，已完成索引里会留一个指向
      // 不存在任务的 member —— 那条会永远挂在「已完成」区里、点开没有详情，
      // 而且 zset 里那个位置再也腾不出来
      await req.redis.srem(taskIndexKey(task.user_id), taskId);
      await req.redis.zrem(doneIndexKey(task.user_id), taskId);
    }
    await req.redis.del(taskKey(taskId));

    res.json({ code: 0, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 开始 / 完成 / 放弃 —— 一条待办的三个动作（状态机见 services/starlight.js 的
// TASK_ACTIONS 和 docs 9.2）。**三段共用这一个处理函数**，差别只在 action 字符串：
// 三份抄开的话，「开始」和「完成」都会抽卡，早晚有一处忘了刷新状态或者忘了兜错。
function taskAction(action) {
  return async (req, res) => {
    try {
      const { taskId } = req.params;
      const task = await req.redis.hgetall(taskKey(taskId));

      if (!task || !task.id) {
        return res.status(404).json({ code: 1, message: '任务不存在' });
      }

      const result = await advanceTask(req.redis, task, action);
      // 状态不对（比如对一条待办点「完成」）或者抽不出精灵：不是异常，
      // 就是这次点不了，原样把话说给前端
      if (result.error) {
        return res.json({ code: 1, message: result.error });
      }

      // 回完整状态（含待办列表、已完成、流水、今日精灵），不然前端拿到的还是旧的，
      // 划掉的那条和刚抽到的精灵要刷新页面才会更新
      const state = await buildState(req.redis, task.user_id);

      res.json({
        code: 0,
        data: {
          action: result.action,
          status: result.status,
          taskName: result.taskName,
          // 「放弃」不抽卡，spirit 是 null；前端据此决定弹不弹结果卡
          spirit: result.spirit,
          // 这次进账的洛克贝（spirit.roco 里也是同一个数，这里单独给一份，
          // 省得前端为结果卡再挖一层）。**不返回星光值** —— 页面不显示它
          rocoEarned: result.rocoEarned,
          // 「完成」了但今天精灵抽完了：事记上了，只是没抽到卡，得说一声
          noDraw: result.noDraw,
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
  };
}

router.post('/tasks/:taskId/start', taskAction('start'));
router.post('/tasks/:taskId/complete', taskAction('complete'));
router.post('/tasks/:taskId/abandon', taskAction('abandon'));

// 原来这里还有个 POST /collect（手动把「待入库」的许愿星收进总数）。
// 现在凝结出来就直接进总数了，整条路径和它的前端按钮一起去掉了。

module.exports = router;
