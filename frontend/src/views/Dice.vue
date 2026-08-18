<template>
  <div class="dice-page">
    <h1>掷骰子</h1>

    <div class="info-box">
      <p>当前星星: {{ currentStars }}</p>
      <p>掷骰子次数: {{ diceCount }}</p>
      <p>今日获得星星: {{ todayStars }}</p>
    </div>

    <div class="dice-box">
      <div class="dice">{{ diceValue }}</div>
    </div>

    <p class="hint">每获得5颗星星 = 1次掷骰子机会</p>
    <p class="hint">今日获得5颗星星以上才能使用掷骰子次数</p>

    <button
      class="btn-roll"
      :disabled="diceCount <= 0 || todayStars < 5"
      @click="rollDice"
    >
      🎲 在线掷骰子
    </button>

    <div class="manual-section">
      <h3>线下掷骰子记录</h3>
      <p class="hint">如果你在线下掷了骰子，可以在这里记录并消耗1次掷骰子次数</p>
      <div class="manual-input">
        <input
          v-model.number="manualDiceValue"
          type="number"
          min="1"
          max="6"
          placeholder="输入点数(1-6)"
        />
        <button
          class="btn-manual"
          :disabled="diceCount <= 0 || manualDiceValue < 1 || manualDiceValue > 6"
          @click="submitManualDice"
        >
          记录
        </button>
      </div>
    </div>

    <div v-if="result" class="result">
      <p>点数: {{ result.diceResult }}</p>
      <p>获得星星: +{{ result.starsEarned }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { diceApi } from '../api'

const userStore = useUserStore()
const diceCount = ref(0)
const diceValue = ref(1)
const result = ref(null)
const todayStars = ref(0)
const manualDiceValue = ref(null)

const currentStars = computed(() => userStore.stats?.currentStars || 0)

const fetchDiceStatus = async () => {
  const res = await diceApi.checkStatus(userStore.userId)
  if (res.code === 0) {
    diceCount.value = res.data.diceCount || 0
    todayStars.value = res.data.todayStars || 0
  }
}

const rollDice = async () => {
  // 先发送请求获取结果
  let res
  try {
    res = await diceApi.roll(userStore.userId)
  } catch (error) {
    alert('掷骰子失败')
    return
  }

  if (res.code !== 0) {
    alert(res.message)
    return
  }

  // 动画效果
  let times = 0
  const interval = setInterval(() => {
    diceValue.value = Math.floor(Math.random() * 6) + 1
    times++
    if (times > 10) {
      clearInterval(interval)
      // 动画结束后设置为服务端返回的真实结果
      diceValue.value = res.data.diceResult
      result.value = res.data
      userStore.fetchStats()
      fetchDiceStatus()
    }
  }, 80)
}

const submitManualDice = async () => {
  if (!manualDiceValue.value || manualDiceValue.value < 1 || manualDiceValue.value > 6) {
    alert('请输入1-6的点数')
    return
  }

  try {
    const res = await diceApi.submitManual(userStore.userId, manualDiceValue.value)
    if (res.code === 0) {
      alert(`记录成功！获得 ${res.data.starsEarned} 颗星星`)
      manualDiceValue.value = null
      await userStore.fetchStats()
      await fetchDiceStatus()
    } else {
      alert(res.message || '记录失败')
    }
  } catch (error) {
    alert('记录失败')
  }
}

onMounted(async () => {
  await userStore.fetchStats()
  await fetchDiceStatus()
})
</script>

<style scoped>
.dice-page {
  text-align: center;
  padding: 20px;
}

h1 {
  color: #FFD700;
  margin-bottom: 30px;
}

.info-box {
  background: rgba(22, 33, 62, 0.8);
  padding: 15px;
  border-radius: 10px;
  margin-bottom: 30px;
  display: inline-block;
}

.info-box p {
  margin: 5px 0;
  color: #fff;
}

.dice-box {
  margin: 30px 0;
}

.dice {
  width: 100px;
  height: 100px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border-radius: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 50px;
  font-weight: bold;
  color: #1A1A2E;
}

.hint {
  color: #aaa;
  margin-bottom: 20px;
}

.btn-roll {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border: none;
  padding: 15px 40px;
  font-size: 18px;
  border-radius: 10px;
  cursor: pointer;
  color: #1A1A2E;
  font-weight: bold;
}

.btn-roll:disabled {
  background: #555;
  cursor: not-allowed;
}

.result {
  margin-top: 30px;
  background: rgba(22, 33, 62, 0.8);
  padding: 20px;
  border-radius: 10px;
}

.result p {
  color: #fff;
  margin: 10px 0;
}

.manual-section {
  margin-top: 40px;
  padding: 20px;
  background: rgba(22, 33, 62, 0.8);
  border-radius: 10px;
}

.manual-section h3 {
  color: #FFD700;
  margin-bottom: 10px;
}

.manual-input {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 15px;
}

.manual-input input {
  width: 100px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #4A90D9;
  background: rgba(26, 26, 46, 0.8);
  color: #fff;
  text-align: center;
  font-size: 16px;
}

.btn-manual {
  background: #4A90D9;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  color: #fff;
  font-weight: bold;
}

.btn-manual:disabled {
  background: #555;
  cursor: not-allowed;
}
</style>
