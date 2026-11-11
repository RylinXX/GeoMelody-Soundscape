# 地韵 GeoMelody · 景观 AI 音乐工坊 (GeoMelody-Soundscape)

**GeoMelody-Soundscape** · 以三维地图探索世界，用声音感知地理与景观的 AI 音乐探索工坊。

[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r185-black?logo=threedotjs)
![MapTiler](https://img.shields.io/badge/MapTiler-SDK%20v4-00b4d8)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.9--3.12-3776AB?logo=python&logoColor=white)
![Online](https://img.shields.io/badge/online-etgq.com-10b981)

[线上体验](https://etgq.com/) · [小程序工程](mp-geomelody/README.md) · [生产源审计](SERVER-SYNC.md) · [产品评估记录](PRODUCT-REVIEW.md)

---

## 项目简介

GeoMelody 是一个以地理位置为入口的视听探索项目：转动三维数字地球，从全球视角进入具体景点，在地域专属的 AI 纯音乐与自然声中沉浸旅行。前端使用 Vite、原生 JavaScript、Three.js 与 MapTiler SDK 构建 3D 地球 / 2D 地图两种视口；社区共享点位、评论与媒体上传由仓库内的 Python 标准库服务与 SQLite 提供，生产环境部署在 `etgq.com`。同一套内容还提供独立的微信小程序端（`mp-geomelody/`），支持锁屏后台播放与分享卡片。

> 声音、图片和地理素材的可用性受资源配置、网络服务与授权限制影响；页面内容为景观主题的创作与演示，不能理解为实时地理实况。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 三维地球 / 平面地图 | Three.js 自定义地球（昼夜纹理、云层、星空、太阳晨昏线）与 MapTiler 2D 地图一键切换，支持全屏沉浸与桌面巡航模式 |
| 全球景观库 | 143 个景观条目（133 个表格景点 + 10 个海洋探索点），每个条目含 3 张精选壁纸、坐标、分类与标签，内置七大洲 + 海洋快捷导航 |
| AI 音景 | 每个景观匹配地域风格的 Suno AI 纯音乐；曲目由 `src/data/demoTracks.js` 与 `src/data/sunoTracksManifest.json` 维护，音频资源位于 `public/audio/` |
| 自然音效混音台 | 基于 Web Audio API 的程序化环境音（雨、海浪、风、鸟鸣、篝火、钟声），逐通道调节音量，与音乐混音 |
| 沉浸式播放器 | 唱片旋转动效、逐句歌词字幕、音量控制、全屏视听页、自动续播与播放状态以实际播放结果为准 |
| 精选发现 | 「让一个地方，陪你片刻」精选面板，按水乡 / 山野 / 海岛等主题编排推荐，不依赖地图加载完成 |
| 社区共创 | 用户发布音景（标题、作者、简介、分类、必填音频与封面、手动确认的公开坐标）、评论与回复、点赞；照片共创支持审核模式 |
| 收藏与榜单 | 本地收藏夹、最近收听记录，以及按内容目录选编的景观榜单（非听众热度排名） |
| 分享与海报 | 生成带二维码的视听分享海报，复制当前景观的分享链接 |
| 双语与主题 | 简体中文 / English 实时切换；内置多套地图皮肤与偏好设置 |
| 微信小程序端 | `mp-geomelody/` 独立工程：3D 全景漫游 WebView、原生播放器、锁屏后台听歌、好友 / 朋友圈分享卡片与云端内容热更新 |

## 技术栈

| 分层 | 技术 |
| --- | --- |
| 前端构建 | Vite 6（Node.js `^18 \|\| ^20 \|\| >=22`，推荐 20 LTS / 22+） |
| 前端运行时 | 原生 ES Modules + JavaScript，Three.js `^0.185` |
| 地图 | MapTiler SDK `^4.1`（浏览器端 Key + 来源白名单） |
| UI / 资源 | 原生 DOM / CSS、Lucide 图标、qrcode 二维码 |
| 音频 | Web Audio API 程序化环境音 + HTMLAudio 参考曲目 |
| 后端 | Python 3.9–3.12 标准库 `http.server` + SQLite（WAL），无第三方依赖 |
| 数据 | 静态景观与曲目数据（JS / JSON）、`server/data/` 社区数据库、`server/uploads/` 媒体文件 |
| 部署 | Nginx 静态前端 + `/api/`、`/uploads/` 反向代理到本机 8765；systemd 托管 Python 服务 |
| 小程序 | 微信小程序原生框架（`mp-geomelody/`） |

## 目录结构

```text
GeoMelody-Soundscape/
├── index.html                 # 单页入口：地球、播放器、社区、设置等 UI
├── vite.config.js             # 开发服务器与 /api、/uploads 代理
├── src/
│   ├── main.js                # 页面装配、导航、榜单、设置、混音台入口
│   ├── discovery.js           # 精选发现面板
│   ├── audio/soundEngine.js   # Web Audio 程序化音景与播放状态机
│   ├── map/                   # 地球、贴图、星空、晨昏线、2D 地图协作
│   ├── player/                # 播放器、歌词、图集、分享卡
│   ├── community/             # 发布、评论、点赞、昵称与定位
│   ├── data/                  # 景观库、曲目清单、分类、歌词、世界边界
│   ├── styles/                # 地图、播放器、社区、混音台等样式
│   └── utils/                 # i18n、本地存储、定位、图片兜底、分享
├── public/                    # 地球纹理、壁纸、音频、Logo、世界 GeoJSON
├── server/
│   ├── api_server.py          # 社区 API：点位 / 评论 / 发布 / 定位 / 健康检查 / 媒体
│   ├── geomelody-api.service  # systemd 单元示例
│   ├── geomelody-rsyslog.logrotate
│   ├── data/                  # SQLite 运行数据（不提交）
│   └── uploads/               # 用户音频与封面（不提交）
├── mp-geomelody/              # 微信小程序源码工程（独立构建，非网页产物）
├── scripts/                   # 数据集构建、素材处理、曲目与 prompts 导出脚本
├── tests/                     # Node 播放测试 + Python 社区 API 隔离测试
├── .env.example               # 环境变量示例（空值）
├── SERVER-SYNC.md             # 生产源同步审计与运行数据边界
└── PRODUCT-REVIEW.md          # 产品评估与改版记录
```

## 快速开始

### 环境要求

- Node.js 20 LTS 或 22+（Vite 6 要求 `^18 || ^20 || >=22`）
- Python 3.9–3.12（后端服务使用标准库 `cgi`，Python 3.13 已移除该模块）
- 一个 MapTiler Cloud 账号与浏览器端 Key（仅浏览 2D 地图时需要）

### 前端

```sh
npm ci
cp .env.example .env.local   # 填入 VITE_MAPTILER_KEY
npm run dev                  # http://localhost:5173
npm run build                # 产物输出到 dist/
npm run preview              # 本地预览构建产物
```

`.env.local` 变量说明：

| 变量 | 说明 |
| --- | --- |
| `VITE_MAPTILER_KEY` | MapTiler 浏览器端 Key，请在 MapTiler Cloud 限制允许的来源域名与配额；浏览器侧 Key 不能当作服务器秘密 |
| `VITE_API_BASE_URL` | 可选。同域部署时留空；前后端分离时填完整源，如 `https://api.example.com` |

开发服务器默认 5173 端口，并将 `/api`、`/uploads` 代理到 `127.0.0.1:8765`。Vite 自动换端口时，代理会把同源的 `localhost/127.0.0.1` 开发 Origin 规范化为 `http://127.0.0.1:5173`，避免投稿被后端来源校验拒绝；生产来源白名单不受影响。

### 社区 API

```sh
python3 server/api_server.py 8765
```

首次启动会自动创建 `server/data/community_spots.db` 及 `server/uploads/` 下的封面 / 音频目录。浏览 3D 地球与静态音景不需要该服务；发布、评论、点赞同步等社区功能需要它运行。

### 测试

```sh
npm test                              # Node 播放逻辑回归测试
python3 tests/community_api_test.py   # 社区 API：上传、坐标校验、匿名读取、点位分页
```

后端测试使用临时数据库与合成音频，不写入真实投稿数据。

## 后端 API 与配置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/community/spots`（别名 `/api/spots`） | 社区点位，`cursor` 游标分页（每页 200），响应含 `nextCursor` |
| GET | `/api/community/comments`（别名 `/api/comments`） | 指定 `spotId` 的评论列表 |
| POST | `/api/community/publish`（别名 `/api/publish`） | 发布音景：multipart 或 JSON，必填音频与有效经纬度 |
| POST | `/api/community/comments`（别名 `/api/comments`） | 发表评论 / 回复 |
| GET | `/api/locate` | 返回客户端 IP 与服务端兜底位置（仅作参考，不用于发布坐标） |
| GET | `/api/health` | 服务与存储健康状态（`ok` / `degraded`），供部署探活 |
| GET | `/uploads/*` | 用户媒体静态服务，支持 Range 请求与长缓存 |

服务通过环境变量配置，均有安全默认值：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GEOMELODY_HOST` | `127.0.0.1` | 监听地址，默认只允许本机反代访问 |
| `GEOMELODY_DATA_DIR` | `server/data` | SQLite 数据目录 |
| `GEOMELODY_UPLOADS_DIR` | `server/uploads` | 媒体上传目录 |
| `GEOMELODY_ALLOWED_ORIGINS` | `https://etgq.com,https://www.etgq.com,http://localhost:5173,http://127.0.0.1:5173` | 允许提交内容的来源，逗号分隔 |
| `GEOMELODY_MAX_COVER_BYTES` | `10485760`（10MB） | 单张封面上限 |
| `GEOMELODY_MAX_AUDIO_BYTES` | `50331648`（48MB） | 单个音频上限 |
| `GEOMELODY_MAX_REQUEST_BYTES` | `62914560`（60MB） | 单次请求上限 |

上传接口会按扩展名白名单（图片 / 音频）、大小上限和真实路径校验落盘；带 `Origin` 的写请求必须命中来源白名单。磁盘不足时返回 507 与明确错误码，健康检查同时报告剩余空间。

## 生产部署

生产域名是 `etgq.com`：静态前端由 Nginx 提供，`/api/` 转发到本机 Python 服务的 8765 端口，`/uploads/` 提供用户媒体。

```nginx
# 片段示例：实际配置以服务器为准
location /api/     { proxy_pass http://127.0.0.1:8765; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
location /uploads/ { proxy_pass http://127.0.0.1:8765; }
```

1. `npm run build` 生成 `dist/`，发布前构建，再替换前端产物；不要直接拿压缩后的线上 JavaScript 反写源文件。
2. 用 `server/geomelody-api.service` 作为 systemd 单元模板（示例中 `User=www`、`WorkingDirectory=/www/wwwroot/etgq.com/server`，按实际路径调整），`systemctl daemon-reload && systemctl restart geomelody-api`。
3. 日志轮转可参考 `server/geomelody-rsyslog.logrotate`，按实际日志路径调整。
4. 公共点位接口返回 `nextCursor`，前端逐页加载全部点位；旧前端只能加载首页，因此部署分页修复时需同时更新前后端。
5. 上线前检查地图资源、播放器、API、移动布局与跨域配置。

**运行数据边界**：保留 `server/data/` 和 `server/uploads/` 等运行数据；数据库、上传文件、日志和密钥单独管理、单独备份。代码仓库不是用户内容备份，也不应提交真实运行数据（`.gitignore` 已排除 `server/data/`、`server/uploads/`、`server/logs/` 与 `*.db` 等）。

## 注意事项

- **定位与坐标**：投稿必须包含有效经纬度和音频。发布页支持手动修改落点，并需勾选确认坐标与歌曲将公开；网络定位仅作参考，定位失败不会回退到默认坐标。
- **地图密钥**：MapTiler Key 只放在浏览器端环境变量中，并配置来源与配额限制；不要把密钥写进仓库或当作服务器秘密。
- **内容合规**：音频、图片、地图和用户内容应具有可使用的权利。仓库历史素材与表格不代表完整授权清单，正式发布前仍需审核；用户生成内容应建立审核与下架机制。
- **安全边界**：生产环境默认只监听 `127.0.0.1`，由 Nginx 反代；来源白名单、上传大小与扩展名限制不要随意放开。密钥、数据库与上传文件不随仓库同步。
- **项目边界**：此项目与运输业务、人效平台相互独立，页面内容不构成实时地理或出行信息。

## 微信小程序端

`mp-geomelody/` 是独立的小程序源码工程，包含首页 3D 全景漫游 WebView、原生播放器、关于页与分享能力，使用 `wx.getBackgroundAudioManager()` 实现锁屏 / 后台播放。上线前需在微信公众平台配置业务域名 `etgq.com` 与 request / downloadFile 合法域名，详细步骤见 [mp-geomelody/README.md](mp-geomelody/README.md)。

## 许可与素材

本仓库未附开源许可证文件（无 `LICENSE`）。除另有说明外，代码、文案与项目素材版权归项目作者所有；未经授权请勿复制、再分发或用于商业用途。第三方库遵循各自许可证（Three.js、MapTiler SDK、Lucide、qrcode、Vite 等）；景观图片、音频与地图数据的使用请以原始授权为准。

## 沿革与致谢

- 项目从「GeoMelody 三维地球 + 景观音乐」原型迭代为「地韵 GeoMelody · 景观 AI 音乐工坊」，逐步补齐社区共创、沉浸播放器、精选发现、移动端体验与生产部署文档。
- 生产环境与源仓库的同步边界、运行数据管理记录见 [SERVER-SYNC.md](SERVER-SYNC.md)；2026-09 的产品评估、问题处置与验收记录见 [PRODUCT-REVIEW.md](PRODUCT-REVIEW.md)。
- 感谢 Three.js、MapTiler、Vite、Lucide、qrcode 等开源项目，以及为景观库、壁纸与 AI 音乐提供素材与工具的合作方。
