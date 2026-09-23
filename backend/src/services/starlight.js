// 星光值：独立于「星星」体系的一个小玩法（参考《洛克王国：世界》的星光值 / 许愿星）
//
// **这里其实是两套独立的数**，只是碰巧都由「完成一次星光值任务」这一个动作产生：
//   星光值 → 喂阶梯 → 凝结出许愿星（累计数，页面上的「许愿星」）
//   洛克贝 → 直接累计（页面上的「洛克贝」）
// 两边的加成规则、数量级、展示位置都不一样，代码里也各走各的函数（见 spirits.js）。
// 唯一的交汇点就是 completeStarlightTask()：抽一次精灵，两样一起进账。
//
// 三条规则单独说明一下，因为它们都不太直觉：
// 1. 星光值只按天累计，当天没用掉的第二天作废；但**已经凝结出来的许愿星不受影响**，
//    跨天保留。
// 2. 凝结是**自动**的 —— 星光值够下一档就立刻扣掉并凝结一颗许愿星，不需要手动点。
//    档位只看「当天第几颗」，每天重置，所以昨天凝的星星不会拖累今天的档位。
// 3. 凝结出来的星星**直接进「凝结许愿星总数」**，没有「待入库」这个中间态了。
//    老的 pending 字段在 ensureStarlight 里被并进 banked（用户的要求：许愿星全留）。
//
// **星光值本身页面上一个字都不显示**（用户明确要求）：它是内部计价单位，只在
// 「距离下一颗许愿星还差多少」那条进度条上以比例的形式体现。所以状态对象里照旧
// 带着 value，但前端不该把它写出来 —— 加字段的时候别顺手又把它显示回去。
//
// 洛克贝没有阶梯，抽到多少就是多少，只做「当天 / 总共」两个累计。
//
// 星光值怎么来的：完成星光值任务 = 从当天的精灵池里抽一只**还没抽到过的**精灵
// （不放回），把这只精灵的星光值（和洛克贝）加进来。精灵数据见 services/spirits.js。
//
// 这套数字跟 current_stars / total_stars 完全无关，流水也单独记一份，
// 不要把它接到统计页那份星星流水上。
const { v4: uuidv4 } = require('uuid');
const { getBeijingDate } = require('./beijingDate');
const { drawSpirit, enrichDraw, resolveDrawEntity, countTotal } = require('./spirits');
const { withLock } = require('../utils/lock');

// 当天第 N 颗许愿星需要多少星光值。数组下标 0 就是「当天第 1 颗」。
//   第 1-5 颗：每颗 80
//   第 6-10 颗：每颗 120
//   第 11-15 颗：160 / 200 / 240 / 280 / 320
//   第 16-20 颗：380 / 440 / 500 / 560 / 620
//   第 21-25 颗：1240 / 2480 / 4960 / 9920 / 19840
const STAR_COSTS = [
  80, 80, 80, 80, 80,
  120, 120, 120, 120, 120,
  160, 200, 240, 280, 320,
  380, 440, 500, 560, 620,
  1240, 2480, 4960, 9920, 19840
];

// 一天最多凝结 25 颗
const MAX_DAILY_STARS = STAR_COSTS.length;

// 待办的状态机：todo → doing → done，todo / doing 都能 abandoned（见 docs 9.2）。
// **状态只加在任务 hash 自己的字段里，不新增 key 类型**（sync 导出只认
// hash / set / zset / list，开一个 string 类型的 key 会在快照里静默消失）。
const TASK_TODO = 'todo';
const TASK_DOING = 'doing';
const TASK_DONE = 'done';
const TASK_ABANDONED = 'abandoned';

const TASK_STATUS_LABEL = {
  [TASK_TODO]: '待办',
  [TASK_DOING]: '进行中',
  [TASK_DONE]: '已完成',
  [TASK_ABANDONED]: '已放弃'
};

// 一条待办允许的动作表。**这是「什么状态能点什么」的唯一判据** ——
// 路由和前端提示都从这儿推，别在别处再写一遍 if (status === 'doing')，
// 两处早晚会走偏。
const TASK_ACTIONS = {
  start: {
    from: [TASK_TODO], to: TASK_DOING, draw: true, label: '开始'
  },
  complete: {
    from: [TASK_DOING], to: TASK_DONE, draw: true, label: '完成'
  },
  abandon: {
    from: [TASK_TODO, TASK_DOING], to: TASK_ABANDONED, draw: false, label: '放弃'
  }
};

// 老任务 hash 里没有 status 字段，一律当待办 —— **不做迁移**，它们原地变成
// 待办区的初始内容，complete_count 保留做历史（老数据里那个 16 是「以前能
// 反复完成」的痕迹，见 docs 9.7）。
function taskStatus(task) {
  return task.status || TASK_TODO;
}

const stateKey = (userId) => `wishstar:starlight:${userId}`;
const taskKey = (taskId) => `wishstar:starlight_task:${taskId}`;
const taskIndexKey = (userId) => `wishstar:starlight_tasks:${userId}`;
// 已结束的待办（done / abandoned），member 是 taskId、score 是结束时刻。
// **跟待办索引分开**：任务现在只增不减，待办区每次全量读，攒半年之后没必要连
// 几百条已完成的也捞出来；而且「什么时候划掉的」要排序，set 排不了，zset 白送。
const doneIndexKey = (userId) => `wishstar:starlight_done:${userId}`;
const logKey = (userId) => `wishstar:starlight_logs:${userId}`;

// 当天抽到过的精灵（zset）。一张表两个用途：
// 既是「不放回」的排除集，也是页面上那排「今日抽到的精灵」小卡片。
const drawsKey = (userId, date) => `wishstar:starlight_draws:${userId}:${date}`;

// 当天第 n 颗（n 从 1 开始）需要多少星光值；超出 25 颗返回 null
function costOfStar(n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAILY_STARS) return null;
  return STAR_COSTS[n - 1];
}

// 记一条星光值流水（zset，与星星流水分开存）
async function addLog(store, userId, entry) {
  const log = { id: uuidv4(), created_at: Date.now(), ...entry };
  await store.zadd(logKey(userId), log.created_at, JSON.stringify(log));
  return log;
}

// 当天抽到过的精灵，按抽到的先后排（zset 按时间戳升序）
async function loadDraws(store, userId, date) {
  const raw = await store.zrange(drawsKey(userId, date), 0, -1);
  const draws = [];
  for (const item of raw) {
    try {
      draws.push(JSON.parse(item));
    } catch (e) {
      // 坏数据跳过，不影响页面
    }
  }
  return draws;
}

// 读状态 + 跨天重置 + 自动凝结。所有星光值接口进来都先跑这个。
//
// 返回最新的状态对象；调用方一律用返回值，不要自己再 hgetall 一遍。
async function ensureStarlight(store, userId, now = new Date()) {
  const key = stateKey(userId);
  const date = getBeijingDate(now);
  const raw = (await store.hgetall(key)) || {};

  let value = parseInt(raw.value) || 0;
  let banked = parseInt(raw.banked) || 0;
  let todayCondensed = parseInt(raw.today_condensed) || 0;
  let todayEarned = parseInt(raw.today_earned) || 0;
  let rocoTotal = parseInt(raw.roco_total) || 0;
  let rocoToday = parseInt(raw.roco_today) || 0;

  // 可花余额（收集册要花的就是这个）。roco_total 是**累计获得**、只涨不跌，
  // 不能直接拿去减 —— 一减数字往回走，攒了这么久的成就感就没了，所以拆成两个数。
  //
  // 老数据没有这个字段，补成累计值，等于「以前挣的全都能花」—— 不做
  // 「从今天开始算」，那等于把已有的洛克贝没收了。
  //
  // **判据必须是「字段不存在」，不能写成 `parseInt(...) || 0`**：余额真的花到
  // 0 之后再进来，`raw.roco_balance` 是 '0' 而不是 undefined，写成 `|| 0`
  // 就会把它当成老数据重新补成 rocoTotal，等于白送一笔。
  let rocoBalance = raw.roco_balance === undefined ? rocoTotal : (parseInt(raw.roco_balance) || 0);

  // 老数据迁移：以前凝结出来的星星先躺在 pending 里，要玩家点一下「入库」才算数。
  // 现在改成自动进总数了，所以把还躺在天上的那些一次性并进 banked。
  // 用户的决定是「许愿星全留」，改规则不能让已经凝出来的星星凭空消失。
  //
  // 先加完再把 pending 写成 0，所以这段是幂等的：第二次进来 pending 已经是 0。
  // 下面 next 里那个 pending: '0' 不能省 —— 少了它 diff 认为没变化，
  // 清零就写不回存储，每次都要重新加一遍。
  const pendingLeft = parseInt(raw.pending) || 0;
  if (pendingLeft > 0) banked += pendingLeft;

  // 跨天：星光值和「今日累计获得」清零；已凝结的许愿星总数留着
  let valueDate = raw.value_date || date;
  if (valueDate !== date) {
    value = 0;
    todayEarned = 0;
    valueDate = date;
  }

  // 跨天：今日洛克贝清零，总数留着。老数据没有 roco_date 字段，
  // 取 date 当基准就等于「从今天开始算」，不会误清（那时 roco_today 本来也是 0）
  let rocoDate = raw.roco_date || date;
  if (rocoDate !== date) {
    rocoToday = 0;
    rocoDate = date;
  }

  // 跨天：档位回到第 1 颗
  let condenseDate = raw.condense_date || date;
  if (condenseDate !== date) {
    todayCondensed = 0;
    condenseDate = date;
  }

  // 自动凝结：够一档就扣一档，一直凝到不够为止（一天封顶 25 颗）。
  // 凝出来的直接 banked++ —— 没有「待入库」这个中间态了
  let condensedNow = 0;
  let spentNow = 0;
  while (todayCondensed < MAX_DAILY_STARS) {
    const cost = costOfStar(todayCondensed + 1);
    if (value < cost) break;
    value -= cost;
    spentNow += cost;
    todayCondensed++;
    banked++;
    condensedNow++;
  }

  // 字段全部自己 String() 一遍 —— memoryStore.hset 不会帮你转
  const next = {
    value: String(value),
    // 恒为 '0'，只是把上面那次迁移的结果落盘（见 pendingLeft 那段注释）。
    // **别因为「没人读它了」就把这一行删掉**，删了迁移就写不回去
    pending: '0',
    banked: String(banked),
    today_condensed: String(todayCondensed),
    today_earned: String(todayEarned),
    roco_total: String(rocoTotal),
    roco_today: String(rocoToday),
    // **这一行不能省**：上面那次「老数据补成 roco_total」的迁移是靠这个 diff
    // 落盘的，字段漏在 next 外面永远写不回去，每次进来都重新补一遍
    roco_balance: String(rocoBalance),
    value_date: valueDate,
    roco_date: rocoDate,
    condense_date: condenseDate
  };

  const changed = Object.keys(next).some((f) => raw[f] !== next[f]);
  if (changed) await store.hset(key, next);

  // 凝结**不再单独记一条流水**：流水整份改成洛克贝的了（用户要求记录里不出现
  // 星光值 / 许愿星的流水）。凝了几颗由结果卡和统计里的「当天许愿星」体现，
  // 不用在流水里再说一遍 —— 说一遍就得写「星光值」三个字，正是要去掉的那个。
  // spentNow 照旧回报给调用方。

  const nextStarCost = costOfStar(todayCondensed + 1);

  return {
    date,
    // 当前星光值。**只给进度条算比例用，页面上不显示这个数字**。
    // 前端要「还差多少」直接用 nextRemaining，别把 value 写出来
    value,
    banked,
    // 当天凝结出来的许愿星（就是档位计数，每天重置）
    todayCondensed,
    todayEarned,
    // 洛克贝：当天 / 总共 / 可花
    rocoTotal,
    rocoToday,
    // 可花余额。收集册扣的是它，卡片上「可花余额」那行显示的也是它
    rocoBalance,
    maxDailyStars: MAX_DAILY_STARS,
    // 下一颗要多少星光值；今天已经凝满 25 颗时为 null
    nextCost: nextStarCost,
    // 距离下一颗还差多少星光值
    nextRemaining: nextStarCost === null ? null : Math.max(0, nextStarCost - value),
    // 本次调用顺带凝结出来的颗数（完成任务后前端可以直接拿来说「自动凝结了 N 颗」）
    condensedNow,
    spentNow
  };
}

// 抽一只今天还没抽到过的精灵，两样一起进账（星光值喂阶梯、洛克贝直接累计）。
//
// **调用方必须已经在锁里**：整段是「读今天抽过的 → 抽一只没抽过的 → 写回去」，
// 不锁的话两个并发请求会各自读到同一份「今天抽过」的列表，各抽走一只不同的精灵——
// 不放回的保证就破了，一次动作白得两只。
//
// 抽不到精灵时返回 { error }，调用方原样把 message 给前端。
async function drawForTask(store, task, now) {
  const userId = task.user_id;
  const date = getBeijingDate(now);

  // 不放回：把今天已经抽到过的**实体**排除掉，按 id 不按编号 ——
  // 同一个编号下挂着本体 / 地区形态 / 首领化 / 异色，它们是各自独立的四只。
  // 老记录里没有 id，resolveDrawEntity 会按编号还原成默认卡，语义正好对上。
  const drawn = await loadDraws(store, userId, date);
  const excludeIds = new Set();
  for (const d of drawn) {
    const e = resolveDrawEntity(d);
    if (e) excludeIds.add(e.id);
  }

  const spirit = drawSpirit(excludeIds);
  if (!spirit) {
    // drawSpirit 在两种情况下都是 null：今天的抽完了，或者池子根本没读出来。
    // 后者是数据目录配错了，得说清楚，不然会被当成「今天没得抽了」白等一天。
    if (countTotal() === 0) {
      return { error: '精灵池是空的，检查一下数据目录里有没有 data/entities.json' };
    }
    return { error: '今天的精灵都抽完了，明天再来吧' };
  }

  // 一次抽卡两样一起进账，各按各的规则算：
  //   星光值：特殊形态翻倍，每多一个标签再翻一倍（×1/2/4/8）→ 喂下面的阶梯
  //   洛克贝：异色 ×10、每个形态标签 ×2（×1/2/4/10/20/40）→ 直接累计
  // spirit.star / spirit.roco 都是图鉴上的**基础值**，乘完才是真正进账的数 ——
  // 进账、流水、记录里存的都是乘完的，只有图鉴上那个基础值留在池子里。
  // 两套倍率都在 spirits.js 里，别在这边重算。
  const earned = spirit.star * spirit.starMultiplier;
  const rocoEarned = spirit.roco * spirit.rocoMultiplier;

  await store.hincrby(stateKey(userId), 'value', earned);
  await store.hincrby(stateKey(userId), 'today_earned', earned);

  // 洛克贝不参与阶梯，就是几个计数器。
  // 跨天清零由调用方进锁后那次 ensureStarlight 负责（它在加数之前跑，顺带把
  // roco_date 刷成今天），所以这里直接加是安全的 —— 跟 value 同一个道理
  await store.hincrby(stateKey(userId), 'roco_total', rocoEarned);
  await store.hincrby(stateKey(userId), 'roco_today', rocoEarned);
  // **可花余额也得跟着加**，这是唯一能花的那份钱。少了这一行，挣的洛克贝
  // 只进「累计」不进「余额」，收集册就永远买不了东西 —— 而余额的初值来自
  // 迁移，页面上看着还有钱，只是新挣的一分都花不出去，很难查
  await store.hincrby(stateKey(userId), 'roco_balance', rocoEarned);

  // 记录里只存 id 和几个展示字段，详情（立绘、介绍、属性…）在读取时现查池子，
  // 见 spirits.js 的 enrichDraw()。这样图鉴更新之后详情跟着新，记录也不臃肿。
  const draw = {
    id: spirit.id,
    number: spirit.number,
    name: spirit.name,
    // 这次抽到给了多少星光值。**页面上已经不显示了**（星光值彻底不显示），
    // 但还是照存：记录是历史，删掉的字段以后想要也补不回来，而且它就是
    // 当时凝结出那颗许愿星的凭据
    star: earned,
    starMultiplier: spirit.starMultiplier,
    // 这次抽到给了多少洛克贝（已经乘过加成）—— 页面上显示的就是这个数
    roco: rocoEarned,
    // 洛克贝翻了几倍（1/2/4/10/20/40）。**必须跟 starMultiplier 分开存**：
    // 两套规则不一样，而且以后还会各改各的。前端要用它把进账除回去算图鉴
    // 基础值，拿池子现在的规则去算老记录会算错。
    // 详见 spirits.js 的 rocoMultiplierOfRecord()
    rocoMultiplier: spirit.rocoMultiplier,
    headUrl: spirit.headUrl,
    at: now.getTime()
  };
  await store.zadd(drawsKey(userId, date), draw.at, JSON.stringify(draw));

  // 流水整份是**洛克贝**的（用户要求：记录里只留洛克贝，不出现星光值和
  // 许愿星的流水）。旧的星光值/许愿星流水躺在存储里不动，页面按 unit 过滤掉
  await addLog(store, userId, {
    type: 'income',
    category: 'starlight_task',
    amount: rocoEarned,
    unit: '洛克贝',
    description: `抽到「${spirit.name}」获得 ${rocoEarned} 洛克贝` +
      // 翻倍了就得说一声：流水上的数字比图鉴上大，不解释看着像算错。
      // 用 formLabel 把**是哪几个标签**写出来（「首领化 · 异色 ×20」），
      // 笼统写「异色/特殊形态」看不出 20 倍是怎么来的
      (spirit.rocoMultiplier > 1 ? `（${spirit.formLabel} ×${spirit.rocoMultiplier}）` : '')
  });

  // 返回补全过的形状，跟「今日抽到的精灵」里那些保持一致 ——
  // 两处形状不一样的话，前端为结果卡和卡片写两套字段很容易漏。
  // earned 是星光值，只留给调用方做日志/调试，页面上不显示
  return { spirit: enrichDraw(draw), earned, rocoEarned };
}

// 推进一条待办：开始 / 完成 / 放弃（见 docs 9）。
//
// **三个动作走同一个函数**，是因为它们要抢同一把锁 —— 抽卡本身必须串行
// （见 drawForTask），而状态转移也得跟抽卡在同一段临界区里：分开写三个函数，
// 「开始」连点两下就会各自读到旧的 status、各抽一只精灵，白送一只。
//
// 返回 { error } 时调用方原样把 message 给前端；成功时 state 是刷新过的全量状态。
async function advanceTask(store, task, action, now = new Date()) {
  const spec = TASK_ACTIONS[action];
  if (!spec) return { error: '没有这个动作' };
  const userId = task.user_id;

  return withLock(`starlight:${userId}`, async () => {
    // 先 ensure 一次，让跨天重置（如果有）在加数之前发生——
    // 否则刚加上的星光值会被紧接着的每日清零抹掉
    await ensureStarlight(store, userId, now);

    // 锁里重读任务：调用方手上那份是点之前读的，两个并发请求会各自从同一个
    // 旧 status 出发，把同一个动作做两遍。（完成次数也顺带从这份新值推，
    // 不再从调用方那份旧的 +1）
    const fresh = (await store.hgetall(taskKey(task.id))) || {};
    if (!fresh.id) return { error: '任务不存在' };

    const status = taskStatus(fresh);
    if (!spec.from.includes(status)) {
      return { error: `「${fresh.name}」是${TASK_STATUS_LABEL[status]}，不能${spec.label}` };
    }

    let draw = null;
    let noDraw = null;
    if (spec.draw) {
      const result = await drawForTask(store, fresh, now);
      if (result.error) {
        // 「开始」抽不出就整个拒绝，状态原地不动 —— 下面什么都还没写，是原子的。
        // 「完成」抽不出照样往下走：**事已经做完了，不该被抽卡机制挡在门外**。
        // 反过来做（完成也拦住）的话，池子抽干的那天会有一堆做完的任务卡在
        // 「进行中」划不掉。见 docs 9.3
        if (action === 'start') return { error: result.error };
        noDraw = result.error;
      } else {
        draw = result;
      }
    }

    const at = now.getTime();
    const updates = { status: spec.to, updated_at: String(at) };
    if (action === 'start') updates.started_at = String(at);
    if (action === 'complete') {
      updates.resolved_at = String(at);
      // 保留原字段的含义：它是**累计完成次数**。新规则下一条待办只能完成一次，
      // 所以新数据里它只能是 1；老数据里那个 16 是「以前能反复完成」的痕迹，不动它
      updates.complete_count = String((parseInt(fresh.complete_count) || 0) + 1);
    }
    if (action === 'abandon') updates.resolved_at = String(at);

    await store.hset(taskKey(fresh.id), updates);

    // 进终态：从待办索引挪到已完成索引。**两把索引都要动** —— 只往新的里加、
    // 不往旧的里删，待办区会继续列出这条已经划掉的（它 hgetall 出来是 done）
    if (spec.to === TASK_DONE || spec.to === TASK_ABANDONED) {
      await store.srem(taskIndexKey(userId), fresh.id);
      await store.zadd(doneIndexKey(userId), at, fresh.id);
    }

    const state = await ensureStarlight(store, userId, now);
    return {
      action,
      status: spec.to,
      taskName: fresh.name,
      // 「开始」和「完成」都抽卡，都有一个结果卡；「放弃」不抽，这两个是 null
      spirit: draw ? draw.spirit : null,
      earned: draw ? draw.earned : 0,
      rocoEarned: draw ? draw.rocoEarned : 0,
      // 「完成」但没抽到卡时的原因（今天抽完了 / 池子是空的）。前端要把它说出来，
      // 不然用户会以为自己白干了一条
      noDraw,
      state
    };
  });
}

// 花洛克贝（目前只有收集册在用）。
//
// **只减 roco_balance，roco_total 一动不动** —— roco_total 是「累计获得」，
// 只涨不跌是它唯一的爽点，见上面那段和 docs 8.1。
//
// 余额不够时**不扣**，返回 { ok: false, balance }，调用方拿 balance 去算「还差多少」。
//
// 这里不做并发保护（读余额和扣余额中间被人插一脚会超支）：调用方必须自己在锁里
// 跑完整段。收集册那条路是在 withLock 里调的，见 services/collections.js。
async function spendRoco(store, userId, amount) {
  const key = stateKey(userId);
  const balance = parseInt(await store.hget(key, 'roco_balance')) || 0;

  // 价格来自数据文件，理论上不会是脏的，但这里是唯一动钱的地方，拦一道不亏
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, balance };
  if (balance < amount) return { ok: false, balance };

  const after = await store.hincrby(key, 'roco_balance', -amount);
  return { ok: true, balance: after };
}

module.exports = {
  STAR_COSTS,
  MAX_DAILY_STARS,
  TASK_TODO,
  TASK_DOING,
  TASK_DONE,
  TASK_ABANDONED,
  TASK_STATUS_LABEL,
  TASK_ACTIONS,
  stateKey,
  taskKey,
  taskIndexKey,
  doneIndexKey,
  logKey,
  drawsKey,
  costOfStar,
  taskStatus,
  addLog,
  loadDraws,
  ensureStarlight,
  advanceTask,
  spendRoco
};
