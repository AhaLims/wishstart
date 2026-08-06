import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { userApi, statsApi } from '../api'

export const useUserStore = defineStore('user', () => {
  const userId = ref(localStorage.getItem('wishstar_userId') || 'default_user')
  const userInfo = ref(null)
  const stats = ref(null)

  // 初始化用户
  const initUser = async () => {
    try {
      localStorage.setItem('wishstar_userId', userId.value)
      const res = await userApi.getUser(userId.value)
      if (res.code === 0) {
        userInfo.value = res.data
      }
    } catch (error) {
      console.error('Init user error:', error)
    }
  }

  // 获取统计
  const fetchStats = async () => {
    try {
      const res = await statsApi.getStats(userId.value)
      if (res.code === 0) {
        stats.value = res.data
      }
    } catch (error) {
      console.error('Fetch stats error:', error)
    }
  }

  // 更新用户名称
  const updateName = async (name) => {
    try {
      const res = await userApi.setName(userId.value, name)
      if (res.code === 0) {
        userInfo.value.name = name
      }
      return res
    } catch (error) {
      console.error('Update name error:', error)
    }
  }

  // 刷新数据
  const refresh = async () => {
    await initUser()
    await fetchStats()
  }

  return {
    userId,
    userInfo,
    stats,
    initUser,
    fetchStats,
    updateName,
    refresh
  }
})
