// 所有收集册的登记处。**加一本 = 加一个数据文件 + 在这里 require 一行**，
// 别的地方一律不用动（8.9）。
//
// 数组顺序就是页面上「本」的顺序，第一本排前面。
const hotpot = require('./hotpot');

module.exports = [hotpot];
