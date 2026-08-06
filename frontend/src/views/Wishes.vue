<template>
  <div class="wishes">
    <h1 class="page-title">我的愿望</h1>

    <!-- 添加愿望按钮 -->
    <div class="header-actions">
      <button class="btn btn-primary" @click="showAddModal = true">+ 添加愿望</button>
    </div>

    <!-- 愿望列表 -->
    <div v-if="wishes.length" class="wishes-grid">
      <div v-for="wish in wishes" :key="wish.id" class="wish-card">
        <div class="wish-image">
          <img v-if="wish.image_url" :src="wish.image_url" :alt="wish.name" />
          <div v-else class="wish-placeholder">🎁</div>
        </div>

        <div class="wish-info">
          <h3 class="wish-name">{{ wish.name }}</h3>

          <div class="wish-progress">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: (wish.current_fragments / wish.total_fragments * 100) + '%' }"
              ></div>
            </div>
            <div class="progress-text">
              {{ wish.current_fragments }} / {{ wish.total_fragments }} 碎片
            </div>
          </div>

          <div class="wish-status" :class="wish.status">
            {{ wish.status === 'completed' ? '✅ 已完成' : '📥 收集中' }}
          </div>
        </div>

        <div class="wish-actions">
          <button
            v-if="wish.status !== 'completed' && parseInt(wish.current_fragments) >= parseInt(wish.total_fragments)"
            class="btn btn-success"
            @click="completeWish(wish.id)"
          >
            合成愿望
          </button>
          <button class="btn btn-danger" @click="deleteWish(wish.id)">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-state-icon">🎁</div>
      <p>还没有愿望，快添加一个吧！</p>
    </div>

    <!-- 添加愿望弹框 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <h3 class="modal-title">添加愿望</h3>

        <div class="form-group">
          <label class="label">愿望名称</label>
          <input v-model="newWish.name" class="input" placeholder="输入愿望名称" />
        </div>

        <div class="form-group">
          <label class="label">图片URL（可选）</label>
          <input v-model="newWish.imageUrl" class="input" placeholder="输入图片链接" />
        </div>

        <div class="form-group">
          <label class="label">需要碎片数量</label>
          <input v-model.number="newWish.totalFragments" type="number" class="input" />
        </div>

        <div class="modal-actions">
          <button class="btn btn-primary" @click="addWish">保存</button>
          <button class="btn" @click="showAddModal = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { wishApi } from '../api'

const userStore = useUserStore()
const wishes = ref([])
const showAddModal = ref(false)

const newWish = ref({
  name: '',
  imageUrl: '',
  totalFragments: 10
})

const fetchWishes = async () => {
  try {
    const res = await wishApi.getWishes(userStore.userId)
    if (res.code === 0) {
      wishes.value = res.data
    }
  } catch (error) {
    console.error('Fetch wishes error:', error)
  }
}

const addWish = async () => {
  if (!newWish.value.name) return

  try {
    const res = await wishApi.createWish({
      userId: userStore.userId,
      ...newWish.value
    })

    if (res.code === 0) {
      showAddModal.value = false
      newWish.value = {
        name: '',
        imageUrl: '',
        totalFragments: 10
      }
      await fetchWishes()
    } else {
      alert(res.message || '添加失败')
    }
  } catch (error) {
    alert('添加失败')
  }
}

const completeWish = async (wishId) => {
  if (!confirm('确定要合成这个愿望吗？')) return

  try {
    const res = await wishApi.completeWish(wishId)
    if (res.code === 0) {
      alert(`🎉 愿望「${res.data.wishName}」已合成完成！`)
      await fetchWishes()
    } else {
      alert(res.message || '合成失败')
    }
  } catch (error) {
    alert('合成失败')
  }
}

const deleteWish = async (wishId) => {
  if (!confirm('确定要删除这个愿望吗？')) return

  try {
    const res = await wishApi.deleteWish(wishId)
    if (res.code === 0) {
      await fetchWishes()
    }
  } catch (error) {
    alert('删除失败')
  }
}

onMounted(() => {
  fetchWishes()
})
</script>

<style scoped>
.header-actions {
  margin-bottom: 1.5rem;
}

.wishes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.wish-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.wish-image {
  width: 100%;
  height: 150px;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1rem;
  background: rgba(26, 26, 46, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wish-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wish-placeholder {
  font-size: 4rem;
}

.wish-name {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.wish-progress {
  margin-bottom: 1rem;
}

.progress-bar {
  height: 8px;
  background: rgba(74, 144, 217, 0.2);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4A90D9, #9B59B6);
  transition: width 0.3s ease;
}

.progress-text {
  text-align: center;
  font-size: 0.9rem;
  color: #B0B0B0;
}

.wish-status {
  text-align: center;
  padding: 0.5rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-weight: 600;
}

.wish-status.completed {
  background: rgba(46, 204, 113, 0.2);
  color: #2ECC71;
}

.wish-status.collecting {
  background: rgba(74, 144, 217, 0.2);
  color: #4A90D9;
}

.wish-actions {
  display: flex;
  gap: 0.5rem;
}

.wish-actions .btn {
  flex: 1;
  padding: 0.5rem;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}
</style>
