// 愿望配图：把前端传来的 dataURL 落到磁盘，返回可访问的相对路径。
//
// 存放位置由 UPLOADS_DIR 决定，因为三种运行方式的数据目录不一样：
//   - 本地/网页服务模式：默认 <backend>/uploads
//   - Electron 桌面版：由 main.js 传 app.getPath('userData')/uploads，跟数据文件放一起
// 图片只是文件，Redis / JSON / 内存三种存储都不需要任何改动——
// wish hash 里存的只是一个普通字符串字段（形如 /uploads/a3f8c1d29b4e7f60.jpg）。
//
// 文件名 = 图片内容的 sha256 前 16 位 + 扩展名，好处是同一张图重复上传自动去重、
// 名字不可枚举、且天然避开中文名与路径穿越问题。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const URL_PREFIX = '/uploads';

// 单张图片上限。前端已经压到最大边 800px（通常几十 KB），这里只是兜底。
const MAX_IMAGE_BYTES = Number(process.env.WISH_IMAGE_MAX_BYTES) || 3 * 1024 * 1024;

let uploadsDir = process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR;

// Electron 需要把图片目录指到 userData，由 createApp 调用
function setUploadsDir(dir) {
  if (dir) uploadsDir = path.resolve(dir);
}

function getUploadsDir() {
  return uploadsDir;
}

function ensureUploadsDir() {
  fs.mkdirSync(getUploadsDir(), { recursive: true });
}

// 靠文件头判断真实类型，不信任前端给的 MIME / 扩展名
function detectImageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' &&
      buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

// 只放行我们自己生成的文件名样式，挡掉 ../ 之类的路径穿越
function sanitizeFilename(filename) {
  if (typeof filename !== 'string') return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(filename)) return null;
  if (filename.includes('..')) return null;
  return filename;
}

// 从 /uploads/xxx.jpg 还原出文件名
function filenameFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = /^\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]{0,120})$/.exec(url);
  return m ? sanitizeFilename(m[1]) : null;
}

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const idx = dataUrl.indexOf(',');
  if (idx === -1 || !dataUrl.startsWith('data:')) return null;
  if (!dataUrl.slice(5, idx).includes('base64')) return null;
  return Buffer.from(dataUrl.slice(idx + 1), 'base64');
}

// 保存 dataURL 图片，返回 { filename, url }。内容相同的图片只会落一份文件。
function saveWishImage(dataUrl) {
  const buf = decodeDataUrl(dataUrl);
  if (!buf || buf.length === 0) {
    throw new Error('图片数据无效');
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error(`图片过大，请控制在 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB 以内`);
  }

  const ext = detectImageExt(buf);
  if (!ext) {
    throw new Error('只支持 JPG / PNG / GIF / WebP 格式的图片');
  }

  const filename = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) + '.' + ext;
  const target = path.join(getUploadsDir(), filename);

  ensureUploadsDir();
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, buf);
  }

  return { filename, url: `${URL_PREFIX}/${filename}` };
}

// 删除愿望配图。文件名是内容哈希，可能被多个愿望共用，所以要先确认没人再引用。
async function deleteWishImageIfUnreferenced(store, imageUrl) {
  const filename = filenameFromUrl(imageUrl);
  if (!filename) return false;

  const wishKeys = await store.keys('wishstar:wish:*');
  for (const key of wishKeys) {
    const wish = await store.hgetall(key);
    if (wish && filenameFromUrl(wish.image) === filename) return false;
  }

  try {
    fs.unlinkSync(path.join(getUploadsDir(), filename));
    return true;
  } catch (error) {
    return false;
  }
}

// ---------- 快照同步用：把图片本身也带过去 ----------

// 从快照里挑出真正被愿望引用到的图片文件名（不带上没人用的孤儿文件）
function collectReferencedFilenames(snapshot) {
  const filenames = new Set();
  if (!snapshot || !snapshot.data) return filenames;

  for (const [key, item] of Object.entries(snapshot.data)) {
    if (item && item.t === 'hash' && item.f) {
      const filename = filenameFromUrl(item.f.image);
      if (filename) filenames.add(filename);
    }
  }
  return filenames;
}

// 读成 base64（不含 data: 前缀），文件不存在返回 null
function readImageBase64(filename) {
  const safe = sanitizeFilename(filename);
  if (!safe) return null;

  const target = path.join(getUploadsDir(), safe);
  if (!fs.existsSync(target)) return null;

  try {
    return fs.readFileSync(target).toString('base64');
  } catch (error) {
    return null;
  }
}

// 把快照里的 base64 写回磁盘。文件名与内容都会校验，导入不可信文件也安全。
function writeImageBase64(filename, base64) {
  const safe = sanitizeFilename(filename);
  if (!safe || typeof base64 !== 'string') return false;

  const buf = Buffer.from(base64, 'base64');
  if (!detectImageExt(buf)) return false;

  ensureUploadsDir();
  const target = path.join(getUploadsDir(), safe);
  // 内容寻址：同名文件内容必然相同，已存在就不用重写
  if (fs.existsSync(target)) return true;

  try {
    fs.writeFileSync(target, buf);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  URL_PREFIX,
  MAX_IMAGE_BYTES,
  getUploadsDir,
  setUploadsDir,
  detectImageExt,
  filenameFromUrl,
  saveWishImage,
  deleteWishImageIfUnreferenced,
  collectReferencedFilenames,
  readImageBase64,
  writeImageBase64
};
