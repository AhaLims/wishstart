// 收集册：洛克贝的消费去向。页面在 /starlight（洛克贝卡片正下方），
// 规则细节见 docs/核心功能 第 8 条、实现上的取舍见 services/collections.js。
const express = require('express');
const router = express.Router();
const { ensureStarlight } = require('../services/starlight');
const { listBooks, itemsOf, loadProgress, buyItem } = require('../services/collections');

// 组装给前端的形状：每本 + 已购格子 + 集齐时间 + 当前可花余额。
// 余额跟着一起发，前端买完直接拿响应里的新值刷新卡片，不用再拉一次接口。
async function buildCollections(store, userId) {
  const state = await ensureStarlight(store, userId);
  const { owned, done } = await loadProgress(store, userId);

  const books = listBooks().map((book) => {
    const items = itemsOf(book);
    const ownedIds = items.filter((it) => owned.has(`${book.id}:${it.id}`)).map((it) => it.id);

    return {
      id: book.id,
      name: book.name,
      container: book.container,
      action: book.action,
      doneTitle: book.doneTitle,
      doneNote: book.doneNote,
      // 档只给名字和价格（前端按档分组显示用），格子上的 price 是摊好的
      tiers: book.tiers.map((t) => ({ id: t.id, name: t.name, price: t.price })),
      // **顺序就是锅里的摆放顺序**，前端不要再排一次
      items,
      owned: ownedIds,
      ownedCount: ownedIds.length,
      totalCount: items.length,
      // 没集齐就是 null，**不能给 0** —— 0 会被前端 formatTime 成 1970 年
      doneAt: done[book.id] ? parseInt(done[book.id]) : null
    };
  });

  return {
    rocoBalance: state.rocoBalance,
    rocoTotal: state.rocoTotal,
    books
  };
}

// 获取收集册进度（含可花余额）
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    res.json({ code: 0, data: await buildCollections(req.redis, userId) });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 买一格（把一样东西下锅）
router.post('/:bookId/buy', async (req, res) => {
  try {
    const { bookId } = req.params;
    const { userId, itemId } = req.body;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }
    if (!itemId) {
      return res.json({ code: 1, message: '缺少itemId参数' });
    }

    const result = await buyItem(req.redis, userId, bookId, itemId);
    // 洛克贝不够、已经买过 —— 都不是错误，就是买不成，把话原样给前端
    if (!result.ok) {
      return res.json({ code: 1, message: result.message });
    }

    res.json({
      code: 0,
      data: {
        // 整份最新进度一起回去：流水也多了一条，前端拿到直接整体替换，
        // 免得买完卡片上的余额和流水还是旧的
        ...(await buildCollections(req.redis, userId)),
        // 这几个只跟「这一次」有关，不入库，只在响应里带出去 ——
        // 前端拿它播「掉进锅里」那一下动画
        bought: {
          bookId,
          itemId,
          name: result.item.name,
          emoji: result.item.emoji,
          price: result.price
        },
        justDone: result.justDone,
        doneAt: result.doneAt
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;
