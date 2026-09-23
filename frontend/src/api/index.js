import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000
})

// 响应拦截
api.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

// 用户API
export const userApi = {
  getUser: (userId) => api.get(`/users/${userId}`),
  setName: (userId, name) => api.post(`/users/${userId}/name`, { name }),
  initUser: (userId) => api.post(`/users/init/${userId}`)
}

// 任务API
export const taskApi = {
  createTask: (data) => api.post('/tasks', data),
  getTasks: (userId) => api.get(`/tasks?userId=${userId}`),
  getTask: (taskId) => api.get(`/tasks/${taskId}`),
  updateTask: (taskId, data) => api.put(`/tasks/${taskId}`, data),
  deleteTask: (taskId) => api.delete(`/tasks/${taskId}`),
  completeTask: (taskId) => api.post(`/tasks/${taskId}/complete`)
}

// 记录API
export const recordApi = {
  quickRecord: (data) => api.post('/records/quick', data),
  getRecords: (userId, date) => api.get(`/records?userId=${userId}&date=${date}`),
  getRecordsRange: (userId, startDate, endDate) =>
    api.get(`/records/range?userId=${userId}&startDate=${startDate}&endDate=${endDate}`),
  deleteRecord: (recordId, userId, date) =>
    api.delete(`/records/${recordId}?userId=${userId}&date=${date}`)
}

// 骰子API
export const diceApi = {
  roll: (userId) => api.post('/dice', { userId }),
  submitManual: (userId, diceValue) => api.post('/dice/manual', { userId, diceValue }),
  checkStatus: (userId, date) => api.get(`/dice?userId=${userId}&date=${date}`)
}

// 愿望API
export const wishApi = {
  createWish: (data) => api.post('/wishes', data),
  getWishes: (userId) => api.get(`/wishes?userId=${userId}`),
  getWish: (wishId) => api.get(`/wishes/${wishId}`),
  updateWish: (wishId, data) => api.put(`/wishes/${wishId}`, data),
  deleteWish: (wishId) => api.delete(`/wishes/${wishId}`),
  completeWish: (wishId) => api.post(`/wishes/${wishId}/complete`),
  // 转换通用愿望的碎片，两个出口共用这一块弹窗：
  // - realize：实现新愿望，起个名字 + 消耗指定数量的碎片，出来的会进「已完成」
  // - transfer：把碎片转给某个还没集满的普通愿望（补它缺的那几个），上限是目标的缺口
  realizeWish: (wishId, fragments, name) => api.post(`/wishes/${wishId}/realize`, { fragments, name }),
  transferFragments: (wishId, targetWishId, fragments) =>
    api.post(`/wishes/${wishId}/transfer`, { targetWishId, fragments })
}

// 抽卡API
export const drawApi = {
  draw: (data) => api.post('/draws', data),
  submitManual: (data) => api.post('/draws/manual', data),
  getDraws: (userId, limit) => api.get(`/draws?userId=${userId}&limit=${limit || 20}`)
}

// 统计API
export const statsApi = {
  getStats: (userId) => api.get(`/stats?userId=${userId}`),
  getLogs: (userId, limit) => api.get(`/stats/logs?userId=${userId}&limit=${limit || 50}`)
}

export default api

// 星光值 API（独立于星星体系的小玩法）
export const starlightApi = {
  getState: (userId) => api.get(`/starlight?userId=${userId}`),
  createTask: (data) => api.post('/starlight/tasks', data),
  updateTask: (taskId, data) => api.put(`/starlight/tasks/${taskId}`, data),
  // 真删：记录和两个索引一起清掉，找不回来。**待办区和已完成区的「删除」共用它**
  // （docs 9.6）—— 待办上那个出口 2026-09-23 从「放弃」改成了直接删
  deleteTask: (taskId) => api.delete(`/starlight/tasks/${taskId}`),
  // 一条待办的两个动作（docs 9.2）。**两个都各抽一次精灵**，所以都是 POST，
  // 都会返回 spirit（「完成」赶上今天抽完了那次是 null）
  startTask: (taskId) => api.post(`/starlight/tasks/${taskId}/start`),
  completeTask: (taskId) => api.post(`/starlight/tasks/${taskId}/complete`),
  // 「删除」不在这一组里：它不推进状态，是把这条整个抹掉（见上面 deleteTask）。
  // 原来还有个 abandonTask，2026-09-23 跟后端那条路由一起删了
  // 原来还有个 collect（手动把待入库的许愿星收进总数），
  // 现在凝结出来就直接进总数了，这条路径和后端那个接口一起去掉了
}

// 收集册 API（洛克贝唯一的消费去向，页面在星光值页里）
export const collectionApi = {
  getState: (userId) => api.get(`/collections?userId=${userId}`),
  buy: (bookId, data) => api.post(`/collections/${bookId}/buy`, data)
}

// 同步 API
export const syncApi = {
  exportSnapshot: () => api.get('/sync/export'),
  importSnapshot: (snapshot) => api.post('/sync/import', { snapshot })
}
