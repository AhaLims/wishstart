// 北京时间（Asia/Shanghai，UTC+8，无夏令时）日期/小时工具
// 注意：中国无夏令时，直接加 8 小时偏移即可得到北京日历日期。

function getBeijingDate(now = new Date()) {
  const offsetMs = 8 * 60 * 60 * 1000;
  return new Date(now.getTime() + offsetMs).toISOString().split('T')[0];
}

function getBeijingHour(now = new Date()) {
  return (now.getUTCHours() + 8) % 24;
}

module.exports = { getBeijingDate, getBeijingHour };
