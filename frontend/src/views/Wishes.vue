<template>
  <div class="wishes">
    <h1 class="page-title">我的愿望</h1>

    <!-- 添加愿望按钮 -->
    <div class="header-actions">
      <button class="btn btn-primary" @click="showAddModal = true">+ 添加愿望</button>
    </div>

    <!-- 抽卡面板。原本是独立一页，并进这里是因为补记碎片和线上抽卡共用同一套
         消耗档（免费 → 半价 → 全价 5⭐），拆在两页反而看不清次数是怎么被花掉的 -->
    <div class="draw-panel">
      <div class="draw-counts">
        <div class="count-card">
          <span class="count-icon">⭐</span>
          <div class="count-info">
            <div class="count-value number">{{ stats?.currentStars || 0 }}</div>
            <div class="count-label">可用星星</div>
          </div>
        </div>

        <div class="count-card">
          <span class="count-icon">🎲</span>
          <div class="count-info">
            <div class="count-value number">{{ stats?.diceCount || 0 }}</div>
            <div class="count-label">掷骰子次数</div>
          </div>
        </div>

        <div class="count-card">
          <span class="count-icon">🎴</span>
          <div class="count-info">
            <div class="count-value number">{{ stats?.drawCount || 0 }}</div>
            <div class="count-label">免费抽卡次数</div>
          </div>
        </div>

        <div class="count-card">
          <span class="count-icon">💰</span>
          <div class="count-info">
            <div class="count-value number">{{ stats?.halfDrawCount || 0 }}</div>
            <div class="count-label">半价抽卡次数</div>
          </div>
        </div>
      </div>

      <!-- 消耗方式不用选，系统按资源自动挑一档，这里只提前说明会用哪一档 -->
      <div class="draw-mode" :class="{ 'draw-mode-empty': !canDraw }">
        <template v-if="canDraw">
          <span class="mode-label">本次抽卡</span>
          <span class="mode-name">{{ nextDrawMode.label }}</span>
          <span class="mode-cost">{{ nextDrawMode.cost }}</span>
        </template>
        <template v-else>
          <span class="mode-label">暂时抽不了</span>
          <span class="mode-cost">抽卡次数和星星都不够，先去完成任务攒一点吧</span>
        </template>
      </div>

      <button
        class="btn btn-primary draw-btn"
        :disabled="!canDraw || isDrawing"
        @click="doDraw"
      >
        {{ isDrawing ? '抽卡中...' : '🎰 开始抽卡' }}
      </button>
      <p v-if="canDraw" class="draw-hint">
        从所有收集中且未集满的愿望里随机抽一个 · 优先免费，其次半价，都没有才全价 5 ⭐
      </p>
    </div>

    <!-- 通用型愿望（系统自动创建，始终置顶） -->
    <div v-if="generalWish" class="wishes-section">
      <h2 class="section-title">通用愿望</h2>
      <div class="wish-card general">
        <div class="wish-image">
          <img
            v-if="showImage(generalWish)"
            :src="generalWish.image"
            class="wish-photo"
            :alt="generalWish.name"
            @error="markImageBroken(generalWish)"
          />
          <div v-else class="wish-placeholder">{{ generalWish.icon || '🌟' }}</div>
        </div>

        <div class="wish-info">
          <h3 class="wish-name">
            {{ generalWish.name }}
            <span class="tag-general">通用</span>
          </h3>

          <!-- 没有碎片上限，所以不画进度条，只显示当前持有量 -->
          <div class="fragment-count">
            <span class="fragment-number">{{ generalCurrent }}</span>
            <span class="fragment-unit">个碎片</span>
            <span class="fragment-worth">≈ ¥{{ fragmentsToPrice(generalCurrent) }}</span>
          </div>

          <div class="wish-status general">
            🌟 无上限 · 永不过期 · 已实现 {{ generalRealizeCount }} 次
          </div>
        </div>

        <div class="wish-actions">
          <!-- 「转换」是碎片出口的唯一入口：实现新愿望 / 补充给已有愿望两种模式，
               都在同一个弹窗里选。不在每张愿望卡上再挂一个「补充碎片」按钮 ——
               那样碎片有两个出口，迟早长出两套校验 -->
          <button
            class="btn btn-success"
            :disabled="generalCurrent < 1"
            @click="openConvertModal"
          >
            转换
          </button>
          <button
            class="btn btn-primary"
            :disabled="recordingId === generalWish.id"
            @click="recordFragment(generalWish)"
          >
            {{ recordingId === generalWish.id ? '记录中...' : '补记碎片' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 收集中 / 已集满待合成 -->
    <div v-if="activeWishes.length" class="wishes-section">
      <h2 class="section-title">收集中</h2>
      <div class="wishes-grid">
        <div v-for="wish in activeWishes" :key="wish.id" class="wish-card">
          <div class="wish-image">
            <img
              v-if="showImage(wish)"
              :src="wish.image"
              class="wish-photo"
              :alt="wish.name"
              @error="markImageBroken(wish)"
            />
            <div v-else class="wish-placeholder">{{ wish.icon || '🎁' }}</div>
          </div>

          <div class="wish-info">
            <h3 class="wish-name">
              {{ wish.name }}
              <span class="wish-price">¥{{ wishPrice(wish) }}</span>
            </h3>

            <div class="wish-progress">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  :class="{ full: isWishReady(wish) }"
                  :style="{ width: progressPercent(wish) + '%' }"
                ></div>
              </div>
              <div class="progress-text">
                {{ wish.current_fragments }} / {{ wish.total_fragments }} 碎片
              </div>
            </div>

            <div class="wish-status" :class="isWishReady(wish) ? 'ready' : 'collecting'">
              {{ isWishReady(wish) ? '✨ 已集满，可以合成' : '📥 收集中' }}
            </div>

            <!-- 集满后才开始倒计时，过期就再也合不成了 -->
            <div
              v-if="isWishReady(wish)"
              class="countdown"
              :class="{ urgent: isExpiringSoon(wish) }"
            >
              ⏳ {{ formatRemaining(wish) }}
            </div>
          </div>

          <div class="wish-actions">
            <button
              v-if="isWishReady(wish)"
              class="btn btn-success"
              @click="completeWish(wish.id)"
            >
              合成愿望
            </button>
            <!-- 集满的愿望收不了碎片了，先合成再记 -->
            <button
              v-else
              class="btn btn-primary"
              :disabled="recordingId === wish.id"
              @click="recordFragment(wish)"
            >
              {{ recordingId === wish.id ? '记录中...' : '补记碎片' }}
            </button>
            <button class="btn" @click="openEditModal(wish)">编辑</button>
            <button class="btn btn-danger" @click="deleteWish(wish.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!activeWishes.length && !completedWishes.length && !expiredWishes.length" class="empty-state">
      <div class="empty-state-icon">🎁</div>
      <p>还没有愿望，快添加一个吧！</p>
    </div>

    <!-- 已过期未兑换的愿望 -->
    <div v-if="expiredWishes.length" class="wishes-section">
      <h2 class="section-title">已过期</h2>
      <div class="wishes-grid">
        <div v-for="wish in expiredWishes" :key="wish.id" class="wish-card expired">
          <div class="wish-image">
            <img
              v-if="showImage(wish)"
              :src="wish.image"
              class="wish-photo"
              :alt="wish.name"
              @error="markImageBroken(wish)"
            />
            <div v-else class="wish-placeholder">{{ wish.icon || '🎁' }}</div>
          </div>

          <div class="wish-info">
            <h3 class="wish-name">
              {{ wish.name }}
              <span class="wish-price">¥{{ wishPrice(wish) }}</span>
            </h3>

            <div class="wish-progress">
              <div class="progress-bar">
                <div class="progress-fill expired-fill" :style="{ width: progressPercent(wish) + '%' }"></div>
              </div>
              <div class="progress-text">
                {{ wish.current_fragments }} / {{ wish.total_fragments }} 碎片（已冻结）
              </div>
            </div>

            <div class="wish-status expired">
              ⌛ 已于 {{ formatDate(wish.expired_at) }} 过期，无法再兑换
            </div>
          </div>

          <div class="wish-actions">
            <button class="btn btn-danger" @click="deleteWish(wish.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 已完成的愿望 -->
    <div v-if="completedWishes.length" class="wishes-section">
      <h2 class="section-title">已完成</h2>
      <div class="wishes-grid completed-grid">
        <div v-for="wish in completedWishes" :key="wish.id" class="wish-card completed">
          <div class="wish-image">
            <img
              v-if="showImage(wish)"
              :src="wish.image"
              class="wish-photo"
              :alt="wish.name"
              @error="markImageBroken(wish)"
            />
            <div v-else class="wish-placeholder">{{ wish.icon || '🎁' }}</div>
          </div>

          <div class="wish-info">
            <h3 class="wish-name">
              {{ wish.name }}
              <span class="wish-price">¥{{ wishPrice(wish) }}</span>
            </h3>

            <div class="wish-progress">
              <div class="progress-bar">
                <div class="progress-fill completed-fill" style="width: 100%"></div>
              </div>
              <div class="progress-text">
                {{ wish.total_fragments }} / {{ wish.total_fragments }} 碎片
              </div>
            </div>

            <div class="wish-status completed">
              ✅ 已完成
            </div>
          </div>

          <div class="wish-actions">
            <button class="btn btn-danger" @click="deleteWish(wish.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加愿望弹框 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <h3 class="modal-title">添加愿望</h3>

        <div class="form-group">
          <label class="label">愿望名称</label>
          <input v-model="newWish.name" class="input" placeholder="输入愿望名称" />
        </div>

        <!-- 图标 / 图片 二选一 -->
        <div class="form-group">
          <label class="label">愿望代表</label>
          <div class="mode-switch">
            <button
              class="mode-btn"
              :class="{ active: newWish.imageMode === 'icon' }"
              @click="newWish.imageMode = 'icon'"
            >
              用图标
            </button>
            <button
              class="mode-btn"
              :class="{ active: newWish.imageMode === 'image' }"
              @click="newWish.imageMode = 'image'"
            >
              用图片
            </button>
          </div>

          <div v-if="newWish.imageMode === 'icon'" class="icon-selector">
            <div
              v-for="icon in iconOptions"
              :key="icon"
              class="icon-option"
              :class="{ selected: newWish.icon === icon }"
              @click="newWish.icon = icon"
            >
              {{ icon }}
            </div>
          </div>

          <div v-else class="image-picker">
            <div class="image-preview" :class="{ empty: !newWish.imageData }">
              <img v-if="newWish.imageData" :src="newWish.imageData" alt="配图预览" />
              <span v-else>还没有选择图片</span>
            </div>
            <div class="image-actions">
              <label class="btn btn-import">
                {{ newWish.imageData ? '换一张' : '选择图片' }}
                <input type="file" accept="image/*" class="hidden-input" @change="onPickImage($event, 'new')" />
              </label>
              <button v-if="newWish.imageData" class="btn" @click="newWish.imageData = ''">移除</button>
            </div>
            <p class="form-hint">上传前会自动缩到最大边 800px，一张图通常几十 KB</p>
          </div>
        </div>

        <div class="form-group">
          <label class="label">愿望价格（元）</label>
          <input v-model.number="newWish.price" type="number" min="1" class="input" />
          <p class="form-hint">
            {{ YUAN_PER_FRAGMENT }} 元 = 1 个碎片，这个愿望需要
            <strong>{{ previewFragments(newWish.price) }}</strong> 个碎片
          </p>
          <p class="form-hint">集满后有 7 天时间可以合成，过期就作废了</p>
        </div>

        <div class="modal-actions">
          <button class="btn btn-primary" @click="addWish">保存</button>
          <button class="btn" @click="showAddModal = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 编辑愿望弹框 -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <h3 class="modal-title">编辑愿望</h3>

        <div class="form-group">
          <label class="label">愿望名称</label>
          <input v-model="editWish.name" class="input" placeholder="输入愿望名称" />
        </div>

        <!-- 图标 / 图片 二选一 -->
        <div class="form-group">
          <label class="label">愿望代表</label>
          <div class="mode-switch">
            <button
              class="mode-btn"
              :class="{ active: editWish.imageMode === 'icon' }"
              @click="editWish.imageMode = 'icon'"
            >
              用图标
            </button>
            <button
              class="mode-btn"
              :class="{ active: editWish.imageMode === 'image' }"
              @click="editWish.imageMode = 'image'"
            >
              用图片
            </button>
          </div>

          <div v-if="editWish.imageMode === 'icon'" class="icon-selector">
            <div
              v-for="icon in iconOptions"
              :key="icon"
              class="icon-option"
              :class="{ selected: editWish.icon === icon }"
              @click="editWish.icon = icon"
            >
              {{ icon }}
            </div>
          </div>

          <div v-else class="image-picker">
            <div class="image-preview" :class="{ empty: !editImagePreview }">
              <img v-if="editImagePreview" :src="editImagePreview" alt="配图预览" />
              <span v-else>还没有选择图片</span>
            </div>
            <div class="image-actions">
              <label class="btn btn-import">
                {{ editImagePreview ? '换一张' : '选择图片' }}
                <input type="file" accept="image/*" class="hidden-input" @change="onPickImage($event, 'edit')" />
              </label>
              <button v-if="editImagePreview" class="btn" @click="clearEditImage">移除</button>
            </div>
            <p class="form-hint">上传前会自动缩到最大边 800px，一张图通常几十 KB</p>
          </div>
        </div>

        <div class="form-group">
          <label class="label">愿望价格（元）</label>
          <input v-model.number="editWish.price" type="number" min="1" class="input" />
          <p class="form-hint">
            {{ YUAN_PER_FRAGMENT }} 元 = 1 个碎片，这个愿望需要
            <strong>{{ previewFragments(editWish.price) }}</strong> 个碎片
          </p>
        </div>

        <div class="form-group">
          <label class="label">当前已有碎片</label>
          <input v-model.number="editWish.currentFragments" type="number" class="input" />
        </div>

        <div class="modal-actions">
          <button class="btn btn-primary" @click="updateWish">保存</button>
          <button class="btn" @click="showEditModal = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 转换弹框：通用愿望里那些碎片的两个出口，在这个弹窗里二选一 -->
    <div v-if="showConvertModal" class="modal-overlay" @click.self="closeConvert">
      <div class="modal">
        <h3 class="modal-title">转换碎片</h3>

        <p class="modal-sub">通用愿望里现有 {{ generalCurrent }} 个碎片</p>

        <!-- 两个出口长得很像（都是「花掉碎片换点什么」），所以先把这一步说清楚，
             免得填到一半才发现模式选错了 -->
        <div class="mode-switch">
          <button
            class="mode-btn"
            :class="{ active: convertMode === 'new' }"
            @click="convertMode = 'new'"
          >
            实现新愿望
          </button>
          <button
            class="mode-btn"
            :class="{ active: convertMode === 'topup' }"
            :disabled="!topupTargets.length"
            @click="convertMode = 'topup'"
          >
            补充给已有愿望
          </button>
        </div>

        <!-- 模式一：实现新愿望（原来的「实现」，只是换了文案） -->
        <template v-if="convertMode === 'new'">
          <div class="form-group">
            <label class="label">愿望名称</label>
            <input
              v-model="convertName"
              type="text"
              class="input"
              placeholder="这次实现的是什么？"
              maxlength="30"
              @keyup.enter="submitConvert"
            />
            <p class="form-hint">
              实现之后它会带着这个名字进「已完成」
            </p>
          </div>

          <div class="form-group">
            <label class="label">消耗碎片数量</label>
            <input
              v-model.number="convertAmount"
              type="number"
              class="input"
              :min="1"
              :max="generalCurrent"
            />
            <p class="form-hint">
              当前持有 {{ generalCurrent }} 个碎片，最多可以全部用完
            </p>
          </div>
        </template>

        <!-- 模式二：补充给已有愿望。碎片是**转过去**的，通用愿望这边会少 -->
        <template v-else>
          <div v-if="!topupTargets.length" class="form-hint">
            没有可补充的愿望 —— 收集中且还差碎片的普通愿望才会出现在这里
          </div>

          <template v-else>
            <div class="form-group">
              <label class="label">补充给哪个愿望</label>
              <select v-model="topupTargetId" class="input" @change="onTopupTargetChange">
                <option v-for="w in topupTargets" :key="w.id" :value="w.id">
                  {{ w.name }}（还差 {{ topupDeficitOf(w) }} 个碎片）
                </option>
              </select>
              <p class="form-hint">
                只能补给「收集中且还没集满」的愿望
              </p>
            </div>

            <div class="form-group">
              <label class="label">补充数量</label>
              <input
                v-model.number="topupAmount"
                type="number"
                class="input"
                :min="1"
                :max="topupMax"
              />
              <p class="form-hint">
                「{{ selectedTarget ? selectedTarget.name : '' }}」还差 {{ topupDeficit }} 个，
                上限 = 缺口和通用愿望持有量里更小的那个（这里最多 {{ topupMax }} 个）。
                <!-- 补满的那一刻它就直接进「已集满，可以合成」 -->
                <span v-if="topupAmount >= topupDeficit && topupDeficit > 0">
                  这一下刚好补满，它可以直接合成啦
                </span>
              </p>
            </div>
          </template>
        </template>

        <p v-if="convertError" class="form-error">{{ convertError }}</p>

        <div class="modal-actions">
          <button
            class="btn btn-primary"
            :disabled="submittingConvert"
            @click="convertMode === 'new' ? submitConvert() : submitTopup()"
          >
            {{ submittingConvert ? '处理中...' : (convertMode === 'new' ? '确认实现' : '确认补充') }}
          </button>
          <button class="btn" :disabled="submittingConvert" @click="closeConvert">取消</button>
        </div>
      </div>
    </div>

    <!-- 全站共用的下方浮窗（补记碎片 / 转换的结果提示）。
         原来这里是一段写在本文件 `<style scoped>` 里的 .toast，别的页面用不了，
         而且只有淡入没有淡出（到点是 v-if 直接摘节点）。提到 components/Toast.vue 了 -->
    <Toast :notice="notice" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user'
import { wishApi, drawApi } from '../api'
import Toast from '../components/Toast.vue'

const userStore = useUserStore()
const wishes = ref([])
const showAddModal = ref(false)
const showEditModal = ref(false)

// 转换弹窗。'new' = 实现新愿望（碎片换成一条新的已完成愿望），
// 'topup' = 把碎片转给某个还没集满的普通愿望
const showConvertModal = ref(false)
const convertMode = ref('new')
const convertAmount = ref(1)
const convertName = ref('')
const convertError = ref('')
const submittingConvert = ref(false)
const topupTargetId = ref('')
const topupAmount = ref(1)

// 倒计时用的"当前时间"，每秒刷新一次
const now = ref(Date.now())
let timer = null

// 可爱图标选项
const iconOptions = ['🎁', '🎀', '🎂', '🎉', '🎄', '🌸', '🌈', '⭐', '💎', '🎵', '🍰', '🍦', '🧸', '📱', '💻', '🎮']

// 价格换算：多少元 = 1 个碎片（与后端 wishState.js 保持一致）
const YUAN_PER_FRAGMENT = 5

// 价格 → 碎片数，不足一个碎片的余数向上取整
const previewFragments = (price) => {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return 0
  return Math.ceil(p / YUAN_PER_FRAGMENT)
}

// 愿望价格（元）。老数据没存 price，按碎片数反推
const wishPrice = (wish) => {
  const stored = parseInt(wish.price)
  if (!Number.isNaN(stored)) return stored
  return (parseInt(wish.total_fragments) || 0) * YUAN_PER_FRAGMENT
}

// 碎片数 → 等值金额（元），用来说明攒着的碎片一共值多少钱
const fragmentsToPrice = (fragments) => {
  const n = parseInt(fragments, 10)
  return Number.isNaN(n) ? 0 : n * YUAN_PER_FRAGMENT
}

// 配图上传前压缩到最大边 800px，否则手机照片一张就是好几 MB
const MAX_IMAGE_EDGE = 800
const JPEG_QUALITY = 0.85
const MAX_SOURCE_BYTES = 10 * 1024 * 1024

const newWish = ref({
  name: '',
  icon: '🎁',
  price: 50,
  imageMode: 'icon',   // 'icon' | 'image'
  imageData: ''        // 新选的图片（dataURL），提交时才上传
})

const editWish = ref({
  id: '',
  name: '',
  icon: '',
  price: 50,
  currentFragments: 0,
  imageMode: 'icon',
  imageData: '',       // 新选的图片（dataURL），空表示沿用原图
  imageUrl: ''         // 愿望当前的配图地址
})

// 已加载失败的配图，避免快照导入后图片缺失时一片空白（自动回退成图标）
const brokenImages = ref(new Set())

const showImage = (wish) => !!wish?.image && !brokenImages.value.has(wish.id)
const markImageBroken = (wish) => { brokenImages.value.add(wish.id) }

// 编辑弹窗里优先显示新选的图，否则显示原来的
const editImagePreview = computed(() => editWish.value.imageData || editWish.value.imageUrl)

const clearEditImage = () => {
  editWish.value.imageData = ''
  editWish.value.imageUrl = ''
}

// 把图片读进来、缩到最大边 800px、按 JPEG 重新导出
const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('读取图片失败'))
  reader.onload = () => {
    const img = new Image()
    img.onerror = () => reject(new Error('这个文件不是有效的图片'))
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height))
      const width = Math.max(1, Math.round(img.width * scale))
      const height = Math.max(1, Math.round(img.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      // JPEG 不支持透明通道，先铺白底，否则 PNG 的透明区域会变成黑块
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    }
    img.src = reader.result
  }
  reader.readAsDataURL(file)
})

const onPickImage = async (event, target) => {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return

  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }
  if (file.size > MAX_SOURCE_BYTES) {
    alert(`原图超过 ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)}MB，请换一张小一点的`)
    return
  }

  try {
    const dataUrl = await compressImage(file)
    if (target === 'new') {
      newWish.value.imageData = dataUrl
    } else {
      editWish.value.imageData = dataUrl
    }
  } catch (error) {
    alert(error.message || '图片处理失败')
  }
}

// 通用型愿望由系统自动创建，历史数据没有 wish_type 字段的按普通愿望处理
const isGeneralWish = (wish) => wish.wish_type === 'general'

const generalWish = computed(() => wishes.value.find(isGeneralWish) || null)
const generalCurrent = computed(() => parseInt(generalWish.value?.current_fragments) || 0)
const generalRealizeCount = computed(() => parseInt(generalWish.value?.realize_count) || 0)

// ---- 转换弹窗的「补充给已有愿望」模式 ----

// 一个愿望还差多少个碎片才集满。通用愿望没有上限，不参与
const topupDeficitOf = (wish) => {
  const total = parseInt(wish.total_fragments) || 0
  const current = parseInt(wish.current_fragments) || 0
  return Math.max(0, total - current)
}

// 可被补充的愿望：**收集中且还没集满**的普通愿望。
// 已集满的（缺口 0，没什么可补）、已过期 / 已完成的（补进去也换不出来）、
// 以及通用愿望自己（不能自己补自己）都不在候选里。
// 后端还会再判一遍 —— 这里只是别让用户选到一个点了就报错的东西
const topupTargets = computed(() =>
  wishes.value.filter(w =>
    !isGeneralWish(w) && w.status === 'collecting' && topupDeficitOf(w) > 0
  )
)

const selectedTarget = computed(() =>
  topupTargets.value.find(w => w.id === topupTargetId.value) || null
)

const topupDeficit = computed(() => (selectedTarget.value ? topupDeficitOf(selectedTarget.value) : 0))

// 上限是**两个数的较小者**：目标的缺口（补超了就溢出成负缺口）和通用愿望的持有量
const topupMax = computed(() => Math.min(topupDeficit.value, generalCurrent.value))

// 进行中：收集中 + 已集满待合成（不含通用愿望，也不含已过期）
const activeWishes = computed(() => {
  return wishes.value.filter(w =>
    !isGeneralWish(w) && (w.status === 'collecting' || w.status === 'ready')
  )
})

// 已完成（通用愿望永远不会出现在这里）
const completedWishes = computed(() => {
  return wishes.value.filter(w => w.status === 'completed' && !isGeneralWish(w))
})

// 已过期未兑换
const expiredWishes = computed(() => {
  return wishes.value.filter(w => w.status === 'expired')
})

// 是否已集满待合成 —— 以服务端状态为准，光看碎片数会把已过期的也算进来
const isWishReady = (wish) => wish.status === 'ready'

// 进度百分比（防止 total 为 0 时算出 Infinity）
const progressPercent = (wish) => {
  const total = parseInt(wish.total_fragments) || 0
  if (total <= 0) return 0
  const current = parseInt(wish.current_fragments) || 0
  return Math.min(100, Math.max(0, (current / total) * 100))
}

const isExpiringSoon = (wish) => {
  const expiresAt = parseInt(wish.expires_at)
  if (!expiresAt) return false
  return expiresAt - now.value < 24 * 3600 * 1000
}

const formatRemaining = (wish) => {
  const expiresAt = parseInt(wish.expires_at)
  if (!expiresAt) return '有效期计算中'

  const diff = expiresAt - now.value
  if (diff <= 0) return '即将过期'

  const totalMinutes = Math.floor(diff / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `还剩 ${days} 天 ${hours} 小时`
  if (hours > 0) return `还剩 ${hours} 小时 ${minutes} 分`
  return `还剩 ${minutes} 分 ${Math.floor(diff / 1000) % 60} 秒`
}

const formatDate = (timestamp) => {
  const ts = parseInt(timestamp)
  if (!ts) return '未知时间'
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

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

  const price = Number(newWish.value.price)
  if (!Number.isFinite(price) || price <= 0) {
    alert('请输入有效的价格')
    return
  }

  try {
    const payload = {
      userId: userStore.userId,
      name: newWish.value.name,
      price
    }

    // 图标和图片二选一
    if (newWish.value.imageMode === 'image' && newWish.value.imageData) {
      payload.image = newWish.value.imageData
    } else {
      payload.icon = newWish.value.icon
    }

    const res = await wishApi.createWish(payload)

    if (res.code === 0) {
      showAddModal.value = false
      newWish.value = {
        name: '',
        icon: '🎁',
        price: 50,
        imageMode: 'icon',
        imageData: ''
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

const openConvertModal = () => {
  // 默认走「实现新愿望」，那是这个功能原来的用法；
  // 数量默认填入当前全部碎片，用户可以改小
  convertMode.value = 'new'
  convertAmount.value = generalCurrent.value
  convertName.value = ''
  convertError.value = ''

  // 补碎片那边也预先挑好目标（列表里的第一个）并把数量填满缺口，
  // 这样切过去就能直接确认，不用再点两下
  topupTargetId.value = topupTargets.value.length ? topupTargets.value[0].id : ''
  topupAmount.value = topupMax.value

  showConvertModal.value = true
}

const closeConvert = () => {
  if (submittingConvert.value) return
  showConvertModal.value = false
}

// 换目标愿望时把数量重置成新目标的缺口 —— 不重置的话会留着上一个目标的数，
// 而那个数可能正好超过新目标的缺口，一点确认就报错
const onTopupTargetChange = () => {
  topupAmount.value = topupMax.value
  convertError.value = ''
}

// 后端那把锁是主力，这里只是别让手指头把请求打出去
const submitConvert = async () => {
  if (submittingConvert.value) return

  const amount = Number(convertAmount.value)
  const name = convertName.value.trim()

  if (!name) {
    convertError.value = '请填写这次实现的愿望名称'
    return
  }
  if (!Number.isInteger(amount) || amount < 1) {
    convertError.value = '请输入要消耗的碎片数量'
    return
  }
  if (amount > generalCurrent.value) {
    convertError.value = `碎片不足，当前只有 ${generalCurrent.value} 个碎片`
    return
  }

  convertError.value = ''
  submittingConvert.value = true
  try {
    const res = await wishApi.realizeWish(generalWish.value.id, amount, name)
    if (res.code === 0) {
      showConvertModal.value = false
      await fetchWishes()
      await userStore.fetchStats()
      showNotice({ text: `🎉「${name}」实现啦，已放进已完成 · 消耗 ${amount} 个碎片，还剩 ${res.data.currentFragments} 个` })
    } else {
      convertError.value = res.message || '实现失败'
    }
  } catch (error) {
    convertError.value = '实现失败'
  } finally {
    submittingConvert.value = false
  }
}

// 补充给已有愿望：碎片从通用愿望转过去，补满的那一刻目标直接变成「可以合成」
const submitTopup = async () => {
  if (submittingConvert.value) return

  const target = selectedTarget.value
  if (!target) {
    convertError.value = '请选择要补充的愿望'
    return
  }

  const amount = Number(topupAmount.value)
  if (!Number.isInteger(amount) || amount < 1) {
    convertError.value = '请输入要补充的碎片数量'
    return
  }
  if (amount > topupDeficit.value) {
    convertError.value = `「${target.name}」还差 ${topupDeficit.value} 个碎片，补多了就超了`
    return
  }
  if (amount > generalCurrent.value) {
    convertError.value = `碎片不足，通用愿望当前只有 ${generalCurrent.value} 个碎片`
    return
  }

  convertError.value = ''
  submittingConvert.value = true
  try {
    const res = await wishApi.transferFragments(generalWish.value.id, target.id, amount)
    if (res.code === 0) {
      showConvertModal.value = false
      await fetchWishes()
      const after = res.data.target
      const full = res.data.targetReady ? ' · 🎊 集满了，可以合成啦' : ''
      showNotice({
        text: `✨ 给「${after.name}」补了 ${amount} 个碎片` +
          `（${after.current_fragments}/${after.total_fragments}）` +
          `，通用愿望还剩 ${res.data.currentFragments} 个${full}`
      })
    } else {
      convertError.value = res.message || '补充失败'
    }
  } catch (error) {
    convertError.value = '补充失败'
  } finally {
    submittingConvert.value = false
  }
}

const deleteWish = async (wishId) => {
  if (!confirm('确定要删除这个愿望吗？')) return

  try {
    const res = await wishApi.deleteWish(wishId)
    if (res.code === 0) {
      await fetchWishes()
    } else {
      alert(res.message || '删除失败')
    }
  } catch (error) {
    alert('删除失败')
  }
}

const openEditModal = (wish) => {
  editWish.value = {
    id: wish.id,
    name: wish.name,
    icon: wish.icon || '🎁',
    price: wishPrice(wish),
    currentFragments: parseInt(wish.current_fragments),
    imageMode: wish.image ? 'image' : 'icon',
    imageData: '',
    imageUrl: wish.image || ''
  }
  showEditModal.value = true
}

const updateWish = async () => {
  if (!editWish.value.name) return

  const price = Number(editWish.value.price)
  if (!Number.isFinite(price) || price <= 0) {
    alert('请输入有效的价格')
    return
  }

  const payload = {
    name: editWish.value.name,
    price,
    currentFragments: editWish.value.currentFragments
  }

  if (editWish.value.imageMode === 'icon') {
    payload.icon = editWish.value.icon
    // 从图片切回图标时要显式清空配图，否则图片会一直留着
    payload.image = ''
  } else if (editWish.value.imageData) {
    payload.image = editWish.value.imageData
  }
  // 图片模式下没重新选图 → 两个字段都不传，保持原样

  try {
    const res = await wishApi.updateWish(editWish.value.id, payload)

    if (res.code === 0) {
      showEditModal.value = false
      await fetchWishes()
    } else {
      alert(res.message || '更新失败')
    }
  } catch (error) {
    alert('更新失败')
  }
}

// 正在补记碎片的愿望 id（空串 = 没有请求在飞）。
// 连点一下会连发好几个请求，前端这里把按钮禁掉是第一道，
// 后端 draws.js 里那把 per-user 的锁是第二道（多标签页、慢网络重试也挡得住）
const recordingId = ref('')

// 下方浮窗的状态。补记碎片是个可以连着点的动作，用 alert 每点一次弹一次太吵，
// 所以做成一闪而过的提示条。画的那部分在 components/Toast.vue（三个页面共用），
// 状态留在各页自己手里 —— 内容差别大，塞进组件反而要开一堆口子
const notice = ref(null)
let noticeTimer = null

const showNotice = (payload, type = 'success') => {
  notice.value = { type, ...payload }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = null }, 3500)
}

// 这次补记花了什么，跟后端 pickDrawMode 的三档一一对应
const drawCostText = (data) => {
  if (data.drawType === 'free') return '消耗 1 次抽卡次数'
  if (data.drawType === 'half') return `消耗 ${data.cost} ⭐ + 1 次半价次数`
  return `消耗 ${data.cost} ⭐`
}

// ---- 线上抽卡（原本是独立一页，现在搬进愿望页）----

const isDrawing = ref(false)
const stats = computed(() => userStore.stats)

// 消耗方式由后端按当前资源自动决定，前端这里只是提前算一遍给用户看。
// 规则必须和后端 pickDrawMode 保持一致：免费 → 半价 → 全价
const nextDrawMode = computed(() => {
  const stars = stats.value?.currentStars || 0
  const free = stats.value?.drawCount || 0
  const half = stats.value?.halfDrawCount || 0

  if (free >= 1) return { label: '免费抽卡', cost: `1次抽卡次数（还有 ${free} 次）`, affordable: true }
  if (half >= 1 && stars >= 3) return { label: '半价抽卡', cost: '3 ⭐ + 1次半价次数', affordable: true }
  if (stars >= 5) return { label: '全价抽卡', cost: '5 ⭐', affordable: true }
  return { label: '', cost: '', affordable: false }
})

const canDraw = computed(() => nextDrawMode.value.affordable)

// 线上抽卡：从所有收集中且未集满的愿望里随机抽一个（通用愿望也在池中，等权）。
// 后端有锁，这里只是别让手指头把请求打出去。
const doDraw = async () => {
  if (isDrawing.value) return
  isDrawing.value = true

  try {
    const res = await drawApi.draw({ userId: userStore.userId, type: 'stars' })

    if (res.code === 0) {
      const d = res.data
      const total = parseInt(d.totalFragments) || 0
      // 通用愿望没有上限，不带分母
      const progress = total > 0 ? `${d.currentFragments}/${total}` : `${d.currentFragments}`
      const full = d.isReady ? ' · 🎊 集满了，可以合成啦' : ''
      showNotice({ text: `抽到「${d.wishName}」碎片（${progress}）${full}` })
      await fetchWishes()
      await userStore.fetchStats()
    } else {
      showNotice({ text: res.message || '抽卡失败' }, 'error')
    }
  } catch (error) {
    showNotice({ text: '抽卡失败' }, 'error')
  } finally {
    isDrawing.value = false
  }
}

// 补记碎片：线下抽到了这个愿望的碎片，点一下就记一个
const recordFragment = async (wish) => {
  if (recordingId.value) return
  recordingId.value = wish.id

  try {
    const res = await drawApi.submitManual({ userId: userStore.userId, wishId: wish.id })

    if (res.code === 0) {
      const data = res.data
      const total = parseInt(data.totalFragments) || 0
      // 通用愿望没有上限，不带分母
      const progress = total > 0 ? `${data.currentFragments}/${total}` : `${data.currentFragments}`
      const full = data.isReady ? ' · 🎊 集满了，可以合成啦' : ''
      showNotice({ text: `「${data.wishName}」+1 碎片（${progress}）· ${drawCostText(data)}${full}` })
      await fetchWishes()
      await userStore.fetchStats()
    } else {
      showNotice({ text: res.message || '补记失败' }, 'error')
    }
  } catch (error) {
    showNotice({ text: '补记失败' }, 'error')
  } finally {
    recordingId.value = ''
  }
}

onMounted(() => {
  fetchWishes()
  // 抽卡面板要用到星星和抽卡次数，进页面就拉一次
  userStore.fetchStats()
  timer = setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  clearTimeout(noticeTimer)
})
</script>

<style scoped>
.header-actions {
  margin-bottom: 1.5rem;
}

/* ---- 抽卡面板（原抽卡页搬过来的）---- */

.draw-panel {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.draw-counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.count-card {
  background: rgba(26, 26, 46, 0.8);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid rgba(74, 144, 217, 0.15);
}

.count-icon {
  font-size: 1.4rem;
}

.count-value {
  font-size: 1.4rem;
  font-weight: 700;
}

.count-label {
  color: #B0B0B0;
  font-size: 0.85rem;
}

/* 消耗方式提示条：不让人选，只说明这次会用哪一档 */
.draw-mode {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  margin-bottom: 0.75rem;
  background: rgba(26, 26, 46, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.35);
  border-radius: 10px;
}

.draw-mode-empty {
  border-color: rgba(255, 255, 255, 0.12);
}

.draw-mode .mode-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

.draw-mode .mode-name {
  color: #4A90D9;
  font-weight: 700;
}

.draw-mode .mode-cost {
  margin-left: auto;
  color: #FFD700;
  font-size: 0.9rem;
}

.draw-mode-empty .mode-label {
  color: #FFD700;
  font-weight: 700;
}

.draw-mode-empty .mode-cost {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

.draw-btn {
  display: block;
  width: 100%;
  padding: 0.9rem 2rem;
  font-size: 1.1rem;
}

/* 这条是对上面那个框的注解，贴左边读起来才跟得住 */
.draw-hint {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
}

@media (max-width: 768px) {
  .draw-counts {
    grid-template-columns: repeat(2, 1fr);
  }
}

.wishes-section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 1.3rem;
  color: #B0B0B0;
  margin-bottom: 1rem;
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

.wish-card.completed {
  border-color: rgba(46, 204, 113, 0.3);
}

.wish-card.general {
  border-color: rgba(255, 215, 0, 0.4);
  background: linear-gradient(135deg, rgba(22, 33, 62, 0.9), rgba(74, 60, 20, 0.5));
  display: grid;
  grid-template-columns: 150px 1fr auto;
  gap: 1.5rem;
  align-items: center;
}

.wish-card.general .wish-image {
  margin-bottom: 0;
}

.wish-card.general .wish-actions {
  flex: none;
}

.wish-card.general .wish-actions .btn {
  min-width: 110px;
  padding: 0.7rem 1.2rem;
}

.wish-card.expired {
  border-color: rgba(150, 150, 150, 0.3);
  opacity: 0.75;
}

.wish-image {
  width: 100%;
  /* 竖构图，跟竖拍手机照片一样是 3:4。用 aspect-ratio 而不是固定高度，
     卡片宽度随网格变化时比例不会跟着跑偏 */
  aspect-ratio: 3 / 4;
  /* 让里面的占位图标能按这个框的大小来缩放（见 .wish-placeholder） */
  container-type: size;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1rem;
  background: rgba(26, 26, 46, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wish-placeholder {
  /* 换成竖构图后框变高了，固定字号在大卡片里会显得小，所以按框宽缩放。
     第一行是不支持容器单位时的兜底 */
  font-size: 4.5rem;
  font-size: clamp(2.5rem, 38cqw, 7rem);
}

.wish-name {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.wish-price {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  margin-left: 0.4rem;
  vertical-align: middle;
  border-radius: 999px;
  background: rgba(46, 204, 113, 0.18);
  color: #2ECC71;
}

.tag-general {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  margin-left: 0.5rem;
  vertical-align: middle;
  border-radius: 999px;
  background: rgba(255, 215, 0, 0.2);
  color: #FFD700;
}

/* 通用愿望：只显示数量，不画进度条 */
.fragment-count {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.fragment-number {
  font-size: 2.5rem;
  font-weight: 700;
  color: #FFD700;
  line-height: 1;
}

.fragment-unit {
  font-size: 0.95rem;
  color: #B0B0B0;
}

/* 这些碎片一共值多少钱 */
.fragment-worth {
  font-size: 0.85rem;
  font-weight: 700;
  color: #2ECC71;
  background: rgba(46, 204, 113, 0.12);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  margin-left: 0.3rem;
  align-self: center;
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

.progress-fill.full {
  background: linear-gradient(90deg, #FFD700, #FFA500);
}

.progress-fill.completed-fill {
  background: linear-gradient(90deg, #2ECC71, #27AE60);
}

.progress-fill.expired-fill {
  background: linear-gradient(90deg, #6B6B6B, #4A4A4A);
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

.wish-status.ready {
  background: rgba(255, 215, 0, 0.2);
  color: #FFD700;
}

.wish-status.general {
  background: rgba(255, 215, 0, 0.15);
  color: #FFD700;
}

.wish-status.expired {
  background: rgba(150, 150, 150, 0.2);
  color: #9E9E9E;
  font-size: 0.85rem;
}

.countdown {
  text-align: center;
  font-size: 0.9rem;
  color: #B0B0B0;
  margin-bottom: 1rem;
}

.countdown.urgent {
  color: #E74C3C;
  font-weight: 700;
}

.wish-actions {
  display: flex;
  gap: 0.5rem;
}

.wish-actions .btn {
  flex: 1;
  padding: 0.5rem;
}

.wish-actions .btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.form-hint {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #888;
}

/* 转换弹窗标题下面那行「通用愿望里现有 N 个碎片」——
   两种模式都要看这个数（实现新愿望看能花多少，补充给已有愿望看够不够挪），
   所以放在模式切换上面，切模式时不跟着变位置 */
.modal-sub {
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: #B0B0B0;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

/* 图标选择器 */
.icon-selector {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.5rem;
}

.icon-option {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  background: rgba(26, 26, 46, 0.8);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.icon-option:hover {
  background: rgba(74, 144, 217, 0.2);
}

.icon-option.selected {
  border-color: #4A90D9;
  background: rgba(74, 144, 217, 0.3);
}

/* 卡片上的配图 */
.wish-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 图标 / 图片 二选一切换 */
.mode-switch {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.mode-btn {
  flex: 1;
  padding: 0.5rem;
  border-radius: 8px;
  border: 2px solid transparent;
  background: rgba(26, 26, 46, 0.8);
  color: #B0B0B0;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
}

.mode-btn.active {
  border-color: #4A90D9;
  background: rgba(74, 144, 217, 0.3);
  color: #FFF;
}

/* 「补充给已有愿望」在没有可补的愿望时是灰的（点了也只能看到一句「没有可补充的愿望」） */
.mode-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 图片选择器 */
.image-picker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.image-preview {
  height: 150px;
  border-radius: 12px;
  background: rgba(26, 26, 46, 0.8);
  border: 2px dashed rgba(74, 144, 217, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #888;
  font-size: 0.9rem;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.image-actions {
  display: flex;
  gap: 0.5rem;
}

.image-actions .btn {
  flex: 1;
  padding: 0.5rem;
  text-align: center;
}

/* 用 label 包住 file input，样式上仍然是个按钮 */
.btn-import {
  cursor: pointer;
  display: inline-block;
}

/* 弹框里的行内报错：弹框不关，错误就贴在按钮上方 */
.form-error {
  color: #FF8A80;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

/* 这条提示从「只在本页 scoped 的 .toast」提到了 components/Toast.vue，
   三个页面共用 —— 原来那份只有淡入没有淡出，别的页面也用不了 */

.hidden-input {
  display: none;
}
</style>
