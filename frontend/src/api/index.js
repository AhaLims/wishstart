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
  // 实现通用愿望：消耗指定数量的碎片
  realizeWish: (wishId, fragments) => api.post(`/wishes/${wishId}/realize`, { fragments })
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

// 工作时间 API
export const workApi = {
  startSession: (data) => api.post('/work/sessions', data),
  endSession: (sessionId, data) => api.post(`/work/sessions/${sessionId}/end`, data),
  settle: (userId) => api.post('/work/settle', { userId }),
  getToday: (userId) => api.get(`/work/today?userId=${userId}`),
  getStatus: (userId) => api.get(`/work/status?userId=${userId}`)
}

// 星光值 API（独立于星星体系的小玩法）
export const starlightApi = {
  getState: (userId) => api.get(`/starlight?userId=${userId}`),
  createTask: (data) => api.post('/starlight/tasks', data),
  updateTask: (taskId, data) => api.put(`/starlight/tasks/${taskId}`, data),
  deleteTask: (taskId) => api.delete(`/starlight/tasks/${taskId}`),
  completeTask: (taskId) => api.post(`/starlight/tasks/${taskId}/complete`),
  // 不传 count 就是把待入库的全部收走
  collect: (userId, count) => api.post('/starlight/collect', { userId, count })
}

// 同步 API
export const syncApi = {
  exportSnapshot: () => api.get('/sync/export'),
  importSnapshot: (snapshot) => api.post('/sync/import', { snapshot })
}
