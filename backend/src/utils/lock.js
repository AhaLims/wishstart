// 进程内互斥。原来长在 services/wishState.js 里，后来星光值那边也要用，就搬到这里。
//
// 用来保护「读 → 判断 → 写」这种中间隔着 await 的窗口：不锁的话两个并发请求
// 会双双读到同一份状态、双双判定可以继续。抽卡/补记碎片（扣资源）和
// 完成星光值任务（抽精灵不放回）都靠它。
//
// 仅进程内有效，够用：json / 内存存储本来就是单进程；Redis 模式下多进程部署才需要
// 换成 Redis 的 SETNX 锁。

const locks = new Map();

async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  locks.set(key, current);

  await prev;
  try {
    return await fn();
  } finally {
    if (locks.get(key) === current) locks.delete(key);
    release();
  }
}

module.exports = { withLock };
