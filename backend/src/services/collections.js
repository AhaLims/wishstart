// 收集册：洛克贝**唯一**的消费去向，也是全项目第一笔支出。
// 规则和取舍见 docs/核心功能 第 8 条。这里只说实现上必须守住的三条：
//
// 1. **只减 roco_balance，绝不碰 roco_total** —— roco_total 是「累计获得」，
//    只涨不跌是它唯一的爽点。扣钱走 starlight.js 的 spendRoco()（8.1）。
// 2. 已购格子用 set、每本的集齐时间用 hash —— sync.js 导出快照时只枚举
//    hash/set/zset/list 四种类型，开一个 string 类型的 key 会在快照里
//    **静默消失**（不报错），备份和换机器的时候丢数据（8.2）。
// 3. 「读进度 → 判重复 → 扣钱 → 写入」整段进锁：不锁的话两个并发请求
//    会各自读到「还没买」，各扣一次钱买走同一格。
const { withLock } = require('../utils/lock');
const { ensureStarlight, spendRoco, addLog } = require('./starlight');
const BOOKS = require('../data/collections');

const collectionKey = (userId) => `wishstar:collection:${userId}`;
const doneKey = (userId) => `wishstar:collection_done:${userId}`;

// 成员写成 "<本id>:<格子id>"。**不要一本一把 key** —— 那样每开一本就多一把
// key、还得改结构；带本前缀，一份集合装得下所有本（8.2）。
const memberOf = (bookId, itemId) => `${bookId}:${itemId}`;

// 把档上的价格摊到每个格子上，格子按 tiers 的顺序排好。
// 前端拿到的就是排好序的 —— 锅里的位置就按这个顺序摆，前端不另外排
function itemsOf(book) {
  return book.tiers.flatMap((tier) =>
    book.items
      .filter((item) => item.tier === tier.id)
      .map((item) => ({ ...item, price: tier.price, tierName: tier.name }))
  );
}

// 数据文件的自检。写在模块加载时（只跑一次），因为坏数据的表现是
// 「某几格永远买不了」这种很难查的现象 —— 不如启动就叫出来。
// 食材写错档位、格子 id 撞车都属于这一类
(function validateBooks() {
  const seenBooks = new Set();
  for (const book of BOOKS) {
    if (seenBooks.has(book.id)) throw new Error(`收集册 id 重复：${book.id}`);
    seenBooks.add(book.id);

    const tierIds = new Set(book.tiers.map((t) => t.id));
    const seenItems = new Set();
    for (const item of book.items) {
      if (!tierIds.has(item.tier)) {
        throw new Error(`收集册「${book.name}」的「${item.name}」挂了一个不存在的档：${item.tier}`);
      }
      if (seenItems.has(item.id)) {
        throw new Error(`收集册「${book.name}」的格子 id 重复：${item.id}`);
      }
      seenItems.add(item.id);
    }
  }
})();

const listBooks = () => BOOKS;

const getBook = (bookId) => BOOKS.find((book) => book.id === bookId) || null;

// 读一份收集进度。所有收集册接口进来都先跑这个，跟 ensureStarlight 一个路数
async function loadProgress(store, userId) {
  const owned = new Set(await store.smembers(collectionKey(userId)));
  // 集齐时间存成 hash：字段是 <本id> → 完成时间戳，**只在集齐那一刻写一次**。
  // 「完成于 X」那行字从这里读 —— 别想着用「已购数 == 总格数」现场推，
  // 那样推得出"齐了"，推不出**日期**（8.2）
  const done = (await store.hgetall(doneKey(userId))) || {};
  return { owned, done };
}

// 买一格。成功返回 { ok: true, ... }，失败返回 { ok: false, message }，
// 由路由把 message 原样给前端（跟 starlight.js 的 advanceTask 一个约定）。
async function buyItem(store, userId, bookId, itemId) {
  const book = getBook(bookId);
  if (!book) return { ok: false, message: '没有这本收集册' };

  const items = itemsOf(book);
  const item = items.find((it) => it.id === itemId);
  if (!item) return { ok: false, message: '这本里没有这样东西' };

  // **锁 key 必须跟抽卡那条路用同一个**（services/starlight.js 的 advanceTask）。
  // 两边动的是同一份 roco_balance：抽卡 +N（hincrby）、这里 -N。而
  // hincrby 在两个 store 里都是「读出 → 加 → 写回」，不是原子的，
  // 各抢各的锁就会撞车 —— 一边加一边减，后写的把先写的盖掉，凭空少一笔钱。
  //
  // 用 `starlight:` 而不是一个中立的 key，是因为这笔钱就存在
  // `wishstar:starlight:<userId>` 那把 hash 里，锁按被保护的资源命名最不容易走偏。
  // 两条路都是「进锁 → 直接干活」，没有嵌套，共用一把锁不会死锁
  return withLock(`starlight:${userId}`, async () => {
    // 先 ensure 一次：roco_balance 的老数据迁移（补成 roco_total）就在
    // ensureStarlight 里，不先跑一遍这里读到的是 undefined
    await ensureStarlight(store, userId);

    const { owned, done } = await loadProgress(store, userId);
    const member = memberOf(bookId, itemId);

    // 已经买过就挡掉。**没有单独的「整本已集齐」判断是故意的**：
    // 集齐了就意味着每一格都 owned，下面这一条自然把所有的都挡住，
    // 而「集齐就是终点、不能再买」这个语义就是这么来的（8.4）。
    // 而且以后往这本里补一格新的，那一格还能买 —— 多写一条整本判断反而会把路堵死
    if (owned.has(member)) {
      return { ok: false, message: `「${item.name}」已经下过锅了` };
    }

    const paid = await spendRoco(store, userId, item.price);
    if (!paid.ok) {
      return { ok: false, message: `洛克贝不够，还差 ${item.price - paid.balance}` };
    }

    await store.sadd(collectionKey(userId), member);

    const now = Date.now();
    const justDone = owned.size + 1 >= items.length;
    if (justDone) await store.hset(doneKey(userId), { [bookId]: String(now) });

    // 支出流水。前端**已经支持 expenditure** 了（金额那里只给 income 加正号，
    // CSS 里 .log-amount.expenditure 也有样式），后端记一条就行（8.7）
    await addLog(store, userId, {
      type: 'expenditure',
      category: 'collection_buy',
      amount: -item.price,
      unit: '洛克贝',
      description: `${book.action}「${item.name}」花掉 ${item.price} 洛克贝`
    });

    const state = await ensureStarlight(store, userId);
    return {
      ok: true,
      item,
      price: item.price,
      // 扣完之后的余额，路由直接发给前端刷新卡片，不用再请求一次
      balance: state.rocoBalance,
      justDone,
      doneAt: justDone ? now : null
    };
  });
}

module.exports = {
  collectionKey,
  doneKey,
  memberOf,
  listBooks,
  getBook,
  itemsOf,
  loadProgress,
  buyItem
};
