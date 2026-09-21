<template>
  <div class="tasks">
    <h1 class="page-title">任务管理</h1>

    <!-- 添加任务按钮 -->
    <div class="header-actions">
      <button class="btn btn-primary" @click="showAddModal = true">+ 添加任务</button>
    </div>

    <!-- 任务列表 -->
    <div v-if="tasks.length" class="tasks-grid">
      <div v-for="task in tasks" :key="task.id" class="task-card">
        <div class="task-header">
          <h3 class="task-name">{{ task.name }}</h3>
          <div class="task-header-right">
            <span v-if="task.task_type === 'time'" class="task-type-badge">⏱ 时间型</span>
            <span class="task-status" :class="task.status">{{ task.status === 'finished' ? '已完成' : '进行中' }}</span>
          </div>
        </div>

        <div class="task-info">
          <div class="task-stars" v-if="task.reward_stars === '1'">
            <span class="star-icon">⭐</span>
            <span class="number">{{ task.stars_per_complete }}</span>
            <span class="unit">星/次</span>
          </div>

          <div class="task-progress">
            <template v-if="task.task_type === 'time'">
              <!-- 没有计时器了，完成全靠手动点，所以只能说这个数字是几次 -->
              <span>每 {{ task.minutes_per_complete }} 分钟算 1 次</span>
            </template>
            <span v-else-if="task.max_complete > 0">
              已完成 {{ task.current_complete }} / {{ task.max_complete }} 次
            </span>
            <span v-else>无限次数</span>
          </div>
        </div>

        <div class="task-rewards">
          <span v-if="task.reward_stars === '1'" class="reward-tag">⭐</span>
          <span v-if="task.reward_half_draw === '1'" class="reward-tag">半价抽卡</span>
          <span v-if="task.reward_draw === '1'" class="reward-tag">抽卡</span>
        </div>

        <div class="task-actions">
          <button
            v-if="task.status !== 'finished'"
            class="btn btn-success"
            @click="completeTask(task.id)"
          >
            完成
          </button>
          <button class="btn btn-danger" @click="deleteTask(task.id)">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-state-icon">📋</div>
      <p>还没有任务，快添加一个吧！</p>
    </div>

    <!-- 添加任务弹框 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <h3 class="modal-title">添加任务</h3>

        <div class="form-group">
          <label class="label">任务名称</label>
          <input v-model="newTask.name" class="input" placeholder="输入任务名称" />
        </div>

        <div class="form-group">
          <label class="label">任务类型</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" value="general" v-model="newTask.taskType" />
              ✅ 通用型（手动完成）
            </label>
            <label class="radio-label">
              <input type="radio" value="time" v-model="newTask.taskType" />
              ⏱ 时间型（按分钟数记次数，手动完成）
            </label>
          </div>
        </div>

        <div class="form-group" v-if="newTask.taskType === 'time'">
          <label class="label">工作多少分钟算 1 次</label>
          <input v-model.number="newTask.minutesPerComplete" type="number" min="1" class="input" />
        </div>

        <div class="form-group">
          <label class="label">限制完成次数（0或不填表示不限制）</label>
          <input v-model.number="newTask.maxComplete" type="number" class="input" />
        </div>

        <div class="form-group">
          <label class="label">奖励（单选）</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" value="stars" v-model="newTask.rewardType" />
              ⭐ 星星
            </label>
            <label class="radio-label">
              <input type="radio" value="halfDraw" v-model="newTask.rewardType" />
              🎴 半价抽卡
            </label>
            <label class="radio-label">
              <input type="radio" value="draw" v-model="newTask.rewardType" />
              🎴 抽卡次数
            </label>
          </div>
        </div>

        <div class="form-group" v-if="newTask.rewardType === 'stars'">
          <label class="label">完成一次获得星星</label>
          <input v-model.number="newTask.starsPerComplete" type="number" class="input" />
        </div>

        <div class="modal-actions">
          <button class="btn btn-primary" @click="addTask">保存</button>
          <button class="btn" @click="showAddModal = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { taskApi } from '../api'

const userStore = useUserStore()
const tasks = ref([])
const showAddModal = ref(false)

const newTask = ref({
  name: '',
  taskType: 'general',
  minutesPerComplete: 25,
  starsPerComplete: 1,
  maxComplete: 0,
  rewardType: 'stars'
})

const fetchTasks = async () => {
  try {
    const res = await taskApi.getTasks(userStore.userId)
    if (res.code === 0) {
      tasks.value = res.data
    }
  } catch (error) {
    console.error('Fetch tasks error:', error)
  }
}

const addTask = async () => {
  if (!newTask.value.name) return

  // 根据奖励类型转换数据
  const taskData = {
    userId: userStore.userId,
    name: newTask.value.name,
    taskType: newTask.value.taskType,
    minutesPerComplete: newTask.value.minutesPerComplete || 25,
    maxComplete: newTask.value.maxComplete,
    starsPerComplete: newTask.value.rewardType === 'stars' ? newTask.value.starsPerComplete : 0,
    rewardStars: newTask.value.rewardType === 'stars',
    rewardHalfDraw: newTask.value.rewardType === 'halfDraw',
    rewardDraw: newTask.value.rewardType === 'draw'
  }

  try {
    const res = await taskApi.createTask(taskData)

    if (res.code === 0) {
      showAddModal.value = false
      newTask.value = {
        name: '',
        taskType: 'general',
        minutesPerComplete: 25,
        starsPerComplete: 1,
        maxComplete: 0,
        rewardType: 'stars'
      }
      await fetchTasks()
      await userStore.fetchStats()
    } else {
      alert(res.message || '添加失败')
    }
  } catch (error) {
    alert('添加失败')
  }
}

const completeTask = async (taskId) => {
  try {
    const res = await taskApi.completeTask(taskId)

    if (res.code === 0) {
      let message = ''
      const hasStarsReward = res.data.rewards && res.data.rewards.includes('星星')
      const hasHalfDrawReward = res.data.rewards && res.data.rewards.includes('半价抽卡')
      const hasDrawReward = res.data.rewards && res.data.rewards.includes('抽卡')

      if (res.data.starsEarned > 0) {
        // 有星星奖励
        message = `获得 ${res.data.starsEarned} 颗星星！${res.data.isWeekendDouble ? '（周末加倍）' : ''}`
        // 如果还有其他奖励
        const otherRewards = []
        if (hasHalfDrawReward) otherRewards.push('半价抽卡')
        if (hasDrawReward) otherRewards.push('抽卡')
        if (otherRewards.length > 0) {
          message += `，还获得：${otherRewards.join('、')}`
        }
      } else if (hasHalfDrawReward || hasDrawReward) {
        // 只有半价抽卡或抽卡奖励，没有星星
        const otherRewards = []
        if (hasHalfDrawReward) otherRewards.push('半价抽卡')
        if (hasDrawReward) otherRewards.push('抽卡')
        message = `完成任务！获得：${otherRewards.join('、')}`
      } else {
        message = '任务完成！'
      }
      alert(message)
      await fetchTasks()
      await userStore.fetchStats()
    } else {
      alert(res.message || '完成失败')
    }
  } catch (error) {
    alert('完成失败')
  }
}

const deleteTask = async (taskId) => {
  if (!confirm('确定要删除这个任务吗？')) return

  try {
    const res = await taskApi.deleteTask(taskId)
    if (res.code === 0) {
      await fetchTasks()
    }
  } catch (error) {
    alert('删除失败')
  }
}

onMounted(() => {
  fetchTasks()
})
</script>

<style scoped>
.header-actions {
  margin-bottom: 1.5rem;
}

.tasks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.task-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.task-name {
  font-size: 1.2rem;
  font-weight: 700;
}

.task-status {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.task-header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.task-type-badge {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.4);
  border-radius: 8px;
  font-size: 0.75rem;
  color: #FFD700;
}

.task-status.active {
  background: rgba(46, 204, 113, 0.2);
  color: #2ECC71;
}

.task-status.finished {
  background: rgba(155, 89, 182, 0.2);
  color: #9B59B6;
}

.task-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
  color: #B0B0B0;
}

.task-stars {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.task-stars .unit {
  font-size: 0.8rem;
  margin-left: 0.25rem;
}

.task-rewards {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.reward-tag {
  padding: 0.25rem 0.5rem;
  background: rgba(74, 144, 217, 0.2);
  border-radius: 8px;
  font-size: 0.8rem;
}

.task-actions {
  display: flex;
  gap: 0.5rem;
}

.task-actions .btn {
  flex: 1;
  padding: 0.5rem;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}
</style>
