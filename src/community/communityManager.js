import { storage } from '../utils/storage.js';
import { LANGUAGES, getSpotLocation, getSpotName, t } from '../utils/i18n.js';
import { getDemoTrack } from '../data/demoTracks.js';
import { HOT_COMMENTS_DATABASE } from '../data/hotComments.js';
import { resolveUserLocation } from '../utils/geoLocator.js';
import { requestJson } from '../utils/api.js';

const MAX_COVER_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 48 * 1024 * 1024;

const LOCATION_PRESETS = [
  { id: 'hangzhou', name: '中国 · 杭州西湖', enName: 'China · Hangzhou West Lake', country: '中国', lat: 30.2428, lng: 120.1504 },
  { id: 'beijing', name: '中国 · 北京故宫', enName: 'China · Beijing Forbidden City', country: '中国', lat: 39.9163, lng: 116.3971 },
  { id: 'shanghai', name: '中国 · 上海外滩', enName: 'China · Shanghai The Bund', country: '中国', lat: 31.2402, lng: 121.4905 },
  { id: 'suzhou', name: '中国 · 苏州平江路', enName: 'China · Suzhou Pingjiang Road', country: '中国', lat: 31.3142, lng: 120.6309 },
  { id: 'wuzhen', name: '中国 · 乌镇水乡', enName: 'China · Wuzhen Water Town', country: '中国', lat: 30.7447, lng: 120.4842 },
  { id: 'chengdu', name: '中国 · 成都锦里', enName: 'China · Chengdu Jinli', country: '中国', lat: 30.6486, lng: 104.0494 },
  { id: 'dali', name: '中国 · 大理洱海', enName: 'China · Dali Erhai Lake', country: '中国', lat: 25.7100, lng: 100.2600 },
  { id: 'dunhuang', name: '中国 · 敦煌莫高窟', enName: 'China · Dunhuang Mogao Caves', country: '中国', lat: 40.0360, lng: 94.8020 },
  { id: 'lhasa', name: '中国 · 西藏布达拉宫', enName: 'China · Tibet Potala Palace', country: '中国', lat: 29.6578, lng: 91.1172 },
  { id: 'tokyo', name: '日本 · 东京浅草', enName: 'Japan · Tokyo Asakusa', country: '日本', lat: 35.7148, lng: 139.7967 },
  { id: 'kyoto', name: '日本 · 京都岚山', enName: 'Japan · Kyoto Arashiyama', country: '日本', lat: 35.0116, lng: 135.6778 },
  { id: 'paris', name: '法国 · 巴黎塞纳河畔', enName: 'France · Paris Seine River', country: '法国', lat: 48.8566, lng: 2.3522 },
  { id: 'london', name: '英国 · 伦敦泰晤士河', enName: 'United Kingdom · London Thames', country: '英国', lat: 51.5072, lng: -0.1276 },
  { id: 'santorini', name: '希腊 · 圣托里尼爱琴海', enName: 'Greece · Santorini Aegean Sea', country: '希腊', lat: 36.3932, lng: 25.4615 },
  { id: 'reykjavik', name: '冰岛 · 雷克雅未克极光', enName: 'Iceland · Reykjavik Aurora', country: '冰岛', lat: 64.1466, lng: -21.9426 },
  { id: 'new-york', name: '美国 · 纽约中央公园', enName: 'United States · New York Central Park', country: '美国', lat: 40.7851, lng: -73.9683 },
  { id: 'sydney', name: '澳大利亚 · 悉尼歌剧院', enName: 'Australia · Sydney Opera House', country: '澳大利亚', lat: -33.8568, lng: 151.2153 }
];

const FALLBACK_COVER = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stripEmoji(value = '') {
  return String(value)
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u2300-\u23FF\u2600-\u27BF]/gu, '')
    .replace(/[\uFE0E\uFE0F\u200D]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function seedLikeCount(spotId) {
  return 18 + [...String(spotId)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 86;
}

function avatarHue(author) {
  return [...String(author)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
}

function getLikeLabel(liked, language) {
  if (language === LANGUAGES.EN) return liked ? 'Liked' : 'Like';
  return liked ? '已赞' : '赞';
}

const COMMENT_COLLECTIONS = {
  peaceful: [
    {
      author: '把晚风装进口袋', enAuthor: 'Pocketful of Wind', likes: 2386,
      text: '这段旋律不是把人带离生活，而是把散落在生活里的自己慢慢领回来。看到「{place}」的光点亮起时，耳机里的风也有了方向。',
      enText: 'This music does not carry me away from life; it gently gathers the pieces of me that life scattered. When {placeEn} lights up on the map, even the wind in my headphones finds a direction.',
      createdAt: '2026-08-14T22:18:00.000Z',
      reply: { author: '云端散步者', enAuthor: 'Cloud Walker', text: '“风也有了方向”这句，和这张地图太配了。', enText: '“Even the wind finds a direction” fits this map perfectly.' }
    },
    {
      author: '凌晨两点半', enAuthor: '2:30 AM', likes: 1642,
      text: '整理完最后一份文件，城市已经很安静了。没有歌词催我想起谁，只有一片缓慢铺开的声音，替我把今天轻轻收好。',
      enText: 'I finished the last file after the city had gone quiet. No lyrics asked me to remember anyone; the slowly unfolding sound simply put the day away for me.',
      createdAt: '2026-08-13T18:42:00.000Z'
    },
    {
      author: '听见山谷', enAuthor: 'Listening Valley', likes: 987,
      text: '低频像远处的水面，中间偶尔亮起的音色像山路转弯后的灯。它没有讲故事，却给每个人留出了一段自己的叙事。',
      enText: 'The low end feels like distant water, and the occasional bright tone is a lamp beyond a bend in the mountain road. It tells no story, leaving room for each listener’s own.',
      createdAt: '2026-08-11T09:16:00.000Z'
    },
    {
      author: '青苔与雨', enAuthor: 'Moss and Rain', likes: 526,
      text: '建议把音量调到刚好盖住键盘声的位置。你会发现工作没有变少，但心里那条很急的河，流得慢了一点。',
      enText: 'Set the volume just high enough to cover the keyboard. The work will not shrink, but the hurried river inside you may flow a little slower.',
      createdAt: '2026-08-09T07:55:00.000Z'
    },
    {
      author: '地图上没有终点', enAuthor: 'No End on the Map', likes: 214,
      text: '第一次听是在出发前，后来每到一个陌生城市都放一次。音乐没变，窗外的光变了，我也就知道自己真的走了很远。',
      enText: 'I first heard it before leaving home and played it again in every unfamiliar city. The music stayed the same while the light outside changed; that was how I knew I had traveled far.',
      createdAt: '2026-08-15T07:30:00.000Z'
    }
  ],
  'moonlight-sonata': [
    {
      author: '月亮迟到了', enAuthor: 'The Moon Was Late', likes: 3197,
      text: '月光并没有照亮整个夜晚，它只是让黑暗有了轮廓。第一乐章也是这样：不替你解决难过，只陪你看清它。',
      enText: 'Moonlight does not illuminate the whole night; it merely gives darkness an outline. This movement is the same: it does not solve sorrow, but stays until you can see it clearly.',
      createdAt: '2026-08-15T00:12:00.000Z',
      reply: { author: '旧钢琴的灰', enAuthor: 'Dust on an Old Piano', text: '真正的安慰大概就是不急着让人振作。', enText: 'Perhaps real comfort is not rushing someone to recover.' }
    },
    {
      author: '第十四号窗户', enAuthor: 'Window No. 14', likes: 2014,
      text: '地图转到欧洲的时候，和弦正好落下来。两百年前写下的夜色，今天仍能穿过一块屏幕，停在一个普通人的房间里。',
      enText: 'The chord descended just as the globe turned toward Europe. A night written two centuries ago can still cross a screen and settle in an ordinary room.',
      createdAt: '2026-08-13T21:05:00.000Z'
    },
    {
      author: '慢半拍的人', enAuthor: 'Half a Beat Behind', likes: 1258,
      text: '以前只觉得它悲伤，后来才听见里面还有克制。真正深的情绪不是喊出来的，是每一次想加速又忍住的节拍。',
      enText: 'I once heard only sadness; later I heard restraint. The deepest emotion is not shouted—it lives in every beat that wants to rush and chooses not to.',
      createdAt: '2026-08-10T13:44:00.000Z'
    },
    {
      author: '莱茵河边的信', enAuthor: 'A Letter by the Rhine', likes: 674,
      text: '把画面停在「{place}」，不要切照片。让钢琴自己把远处、旧日和未说完的话，一层一层推到窗前。',
      enText: 'Pause the image at {placeEn}. Let the piano bring distance, old days, and unfinished words to the window one layer at a time.',
      createdAt: '2026-08-08T19:20:00.000Z'
    },
    {
      author: '白键之间', enAuthor: 'Between White Keys', likes: 308,
      text: '推荐夜里听，但别把房间全关黑。留一盏很小的灯，你会明白为什么有些沉默也需要被看见。',
      enText: 'Listen at night, but do not darken the room completely. Leave one small lamp on; some silences need to be seen.',
      createdAt: '2026-08-15T06:40:00.000Z'
    }
  ],
  'chill-beat': [
    {
      author: '末班地铁靠窗', enAuthor: 'Last Train Window', likes: 2788,
      text: '鼓点像城市还没睡着的心跳，窗外的楼一栋栋退后。白天来不及消化的事，到了末班车上，终于有了缓冲的拍子。',
      enText: 'The beat is the heartbeat of a city still awake as buildings slide past the window. Things the day gave me no time to process finally find a rhythm on the last train.',
      createdAt: '2026-08-14T17:36:00.000Z',
      reply: { author: '下一站下车', enAuthor: 'Getting Off Next Stop', text: '这首歌最适合车厢里灯光轻轻晃的时候。', enText: 'Best heard while the carriage lights sway gently.' }
    },
    {
      author: '咖啡续到第三杯', enAuthor: 'Third Coffee', likes: 1733,
      text: '它很懂得把存在感收在背景里：不会抢走注意力，却在你卡住的时候递来下一步。适合写字、画图，也适合什么都不完成。',
      enText: 'It knows how to stay in the background—never stealing focus, yet handing you the next step when you stall. Good for writing, drawing, or completing nothing at all.',
      createdAt: '2026-08-12T10:25:00.000Z'
    },
    {
      author: '霓虹灯维修员', enAuthor: 'Neon Repairer', likes: 1120,
      text: '贝斯很松，鼓却稳，像一个看起来随意的人其实把生活安排得很好。希望以后每座城市都有自己的这一版。',
      enText: 'The bass is loose while the drums stay steady, like someone who seems casual but has life quietly organized. I hope every city gets its own version.',
      createdAt: '2026-08-10T15:48:00.000Z'
    },
    {
      author: '雨落在出租车顶', enAuthor: 'Rain on a Taxi Roof', likes: 648,
      text: '在「{place}」的夜景里循环到第三遍，突然觉得赶路也不全是狼狈，有时候只是城市在替你打拍子。',
      enText: 'By the third loop over the night view of {placeEn}, rushing no longer felt entirely frantic. Sometimes the city is simply keeping time for you.',
      createdAt: '2026-08-08T12:04:00.000Z'
    },
    {
      author: '今天准时下班', enAuthor: 'Left Work on Time', likes: 327,
      text: '收藏它不是为了某个特别的日子，是为了那些很普通、但也值得被温柔对待的星期二。',
      enText: 'I saved it not for a special day, but for ordinary Tuesdays that still deserve a little kindness.',
      createdAt: '2026-08-15T08:10:00.000Z'
    }
  ],
  community: [
    {
      author: '第一位听众', enAuthor: 'First Listener', likes: 168,
      text: '最喜欢的不是录音有多完美，而是它真的来自这里。风声、脚步和一点点不整齐，反而让地点变得可信。',
      enText: 'What I love is not technical perfection, but that it truly came from this place. Wind, footsteps, and small imperfections make the location believable.',
      createdAt: '2026-08-14T12:18:00.000Z'
    },
    {
      author: '城市采声计划', enAuthor: 'City Field Notes', likes: 92,
      text: '谢谢愿意把自己的城市交给陌生人听见。希望下一次还能录到不同季节、不同时间的版本。',
      enText: 'Thank you for letting strangers hear your city. I hope we get versions from different seasons and different hours next time.',
      createdAt: '2026-08-12T06:40:00.000Z'
    },
    {
      author: '路过这颗光点', enAuthor: 'Passing This Light', likes: 41,
      text: '地图上的一个点，因为有了声音，就不再只是坐标了。',
      enText: 'A point on the map stops being only a coordinate once it has a sound.',
      createdAt: '2026-08-09T18:20:00.000Z'
    }
  ]
};

function createSeedComments(spot) {
  const track = getDemoTrack(spot);
  const hotList = HOT_COMMENTS_DATABASE[track.id] || COMMENT_COLLECTIONS[track.id] || COMMENT_COLLECTIONS.peaceful;
  const backupList = COMMENT_COLLECTIONS.community;
  const fullCollection = [...hotList, ...backupList];

  return fullCollection.map((comment, index) => {
    const replies = [];
    if (comment.reply) {
      replies.push({
        id: `${spot.id}-${track.id}-reply-${index + 1}-1`,
        author: comment.reply.author,
        enAuthor: comment.reply.enAuthor,
        replyToAuthor: null,
        text: comment.reply.text.replaceAll('{place}', spot.name),
        enText: (comment.reply.enText || comment.reply.text).replaceAll('{placeEn}', spot.enName || spot.name),
        likes: Math.floor((comment.likes || 10) * 0.15) + 1,
        liked: false,
        createdAt: comment.createdAt
      });
    }
    if (comment.replies && Array.isArray(comment.replies)) {
      comment.replies.forEach((r, rIdx) => {
        replies.push({
          id: `${spot.id}-${track.id}-reply-${index + 1}-${rIdx + 1}`,
          author: r.author,
          enAuthor: r.enAuthor,
          replyToAuthor: r.replyToAuthor || null,
          text: r.text.replaceAll('{place}', spot.name),
          enText: (r.enText || r.text).replaceAll('{placeEn}', spot.enName || spot.name),
          likes: r.likes || Math.floor((comment.likes || 10) * 0.1) + 1,
          liked: false,
          createdAt: r.createdAt || comment.createdAt
        });
      });
    }
    return {
      ...comment,
      id: `${spot.id}-${track.id}-hot-${index + 1}`,
      text: comment.text.replaceAll('{place}', spot.name),
      enText: comment.enText.replaceAll('{placeEn}', spot.enName || spot.name),
      liked: false,
      isSeed: true,
      replies
    };
  });
}

export class CommunityManager {
  constructor({ spots, getLanguage, showToast, onPublish, onBeforeOpen }) {
    this.spots = spots;
    this.getLanguage = getLanguage;
    this.showToast = showToast;
    this.onPublish = onPublish;
    this.onBeforeOpen = onBeforeOpen;
    this.activeSpot = spots[0] || null;
    this.activeTab = 'publish';
    this.commentSort = 'hot';
    this.replyingTarget = null; // { rootId, targetAuthor, targetId }

    this.drawer = document.getElementById('community-drawer');
    this.backdrop = document.getElementById('community-drawer-backdrop');
    this.toggleButton = document.getElementById('btn-toggle-community');
    this.form = document.getElementById('community-publish-form');
    this.commentsForm = document.getElementById('community-comment-form');
    this.commentsList = document.getElementById('community-comments-list');
    this.playerCommentForm = document.getElementById('player-comment-form');
    this.playerCommentsList = document.getElementById('player-comments-list');

    this.currentLocationCoords = null;

    this.bindEvents();
    this.setActiveSpot(this.activeSpot);
    this.updateUserNicknameDisplays();
  }

  updateUserNicknameDisplays() {
    const nick = stripEmoji(storage.getUserNickname(t('musicTraveler', this.getLanguage()))) || t('musicTraveler', this.getLanguage());
    const pName = document.getElementById('player-user-name-display');
    const cName = document.getElementById('community-user-name-display');
    const pubAuthorInput = document.getElementById('community-publish-author-input');
    if (pName) pName.textContent = nick;
    if (cName) cName.textContent = nick;
    if (pubAuthorInput && !pubAuthorInput.value) pubAuthorInput.placeholder = nick;
  }

  expandCommentForm(formType = 'player') {
    const isPlayer = formType === 'player';
    const compactBar = document.getElementById(isPlayer ? 'player-comment-compact-bar' : 'community-comment-compact-bar');
    const expandedPanel = document.getElementById(isPlayer ? 'player-comment-expanded-panel' : 'community-comment-expanded-panel');
    const textarea = document.getElementById(isPlayer ? 'player-comment-text-input' : 'community-comment-text-input');

    this.updateUserNicknameDisplays();
    if (compactBar) compactBar.style.display = 'none';
    if (expandedPanel) {
      expandedPanel.style.display = 'flex';
    }
    if (textarea) {
      setTimeout(() => textarea.focus(), 50);
    }
  }

  collapseCommentForm(formType = 'player') {
    const isPlayer = formType === 'player';
    const compactBar = document.getElementById(isPlayer ? 'player-comment-compact-bar' : 'community-comment-compact-bar');
    const expandedPanel = document.getElementById(isPlayer ? 'player-comment-expanded-panel' : 'community-comment-expanded-panel');
    const nicknameRow = document.getElementById(isPlayer ? 'player-nickname-edit-row' : 'community-nickname-edit-row');

    if (expandedPanel) expandedPanel.style.display = 'none';
    if (compactBar) compactBar.style.display = 'flex';
    if (nicknameRow) nicknameRow.style.display = 'none';
  }

  toggleNicknameEdit(formType = 'player') {
    const isPlayer = formType === 'player';
    const nicknameRow = document.getElementById(isPlayer ? 'player-nickname-edit-row' : 'community-nickname-edit-row');
    const authorInput = document.getElementById(isPlayer ? 'player-comment-author-input' : 'community-comment-author-input');
    if (!nicknameRow) return;

    const isVisible = nicknameRow.style.display === 'flex';
    if (isVisible) {
      nicknameRow.style.display = 'none';
    } else {
      nicknameRow.style.display = 'flex';
      if (authorInput) {
        authorInput.value = storage.getUserNickname(t('musicTraveler', this.getLanguage()));
        setTimeout(() => {
          authorInput.focus();
          authorInput.select();
        }, 50);
      }
    }
  }

  saveNickname(formType = 'player') {
    const isPlayer = formType === 'player';
    const authorInput = document.getElementById(isPlayer ? 'player-comment-author-input' : 'community-comment-author-input');
    const nicknameRow = document.getElementById(isPlayer ? 'player-nickname-edit-row' : 'community-nickname-edit-row');
    const val = stripEmoji(authorInput?.value || '');
    if (val) {
      storage.setUserNickname(val);
      this.updateUserNicknameDisplays();
      this.showToast(`已保存昵称为「${val}」`);
    }
    if (nicknameRow) nicknameRow.style.display = 'none';
  }

  setReplyTarget(target, formType = 'auto') {
    this.replyingTarget = target;
    const targetType = formType === 'player' ? 'player' : (formType === 'drawer' ? 'drawer' : (this.drawer?.classList.contains('open') ? 'drawer' : 'player'));
    this.expandCommentForm(targetType);
    this.updateReplyingUI(targetType);
  }

  cancelReply() {
    this.replyingTarget = null;
    this.updateReplyingUI();
  }

  updateReplyingUI(focusedFormType = 'auto') {
    const language = this.getLanguage();
    const author = this.replyingTarget?.targetAuthor;

    // 1. Community Drawer Replying Bar
    const drawerBar = document.getElementById('community-replying-bar');
    const drawerTextarea = document.getElementById('community-comment-text-input');
    if (drawerBar) {
      if (this.replyingTarget) {
        drawerBar.style.display = 'flex';
        const nameEl = drawerBar.querySelector('.replying-name');
        if (nameEl) nameEl.textContent = `@${author}`;
        if (drawerTextarea) {
          drawerTextarea.placeholder = `${t('replyTo', language, { name: author })}…`;
        }
      } else {
        drawerBar.style.display = 'none';
        if (drawerTextarea) {
          drawerTextarea.placeholder = t('commentPlaceholder', language);
        }
      }
    }

    // 2. Immersive Player Replying Bar
    const playerBar = document.getElementById('player-replying-bar');
    const playerTextarea = document.getElementById('player-comment-text-input');
    if (playerBar) {
      if (this.replyingTarget) {
        playerBar.style.display = 'flex';
        const nameEl = playerBar.querySelector('.replying-name');
        if (nameEl) nameEl.textContent = `@${author}`;
        if (playerTextarea) {
          playerTextarea.placeholder = `${t('replyTo', language, { name: author })}…`;
        }
      } else {
        playerBar.style.display = 'none';
        if (playerTextarea) {
          playerTextarea.placeholder = t('postCommentPlaceholder', language);
        }
      }
    }

    if (this.replyingTarget) {
      if (focusedFormType === 'drawer' && drawerTextarea) {
        drawerTextarea.focus();
      } else if (focusedFormType === 'player' && playerTextarea) {
        playerTextarea.focus();
      } else {
        if (this.drawer?.classList.contains('open') && drawerTextarea) {
          drawerTextarea.focus();
        } else if (playerTextarea) {
          playerTextarea.focus();
        }
      }
    }
  }

  bindEvents() {
    ['pub-current-lat', 'pub-current-lng'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.locationRequest = (this.locationRequest || 0) + 1;
        document.getElementById('pub-confirm-location').checked = false;
        document.getElementById('current-loc-display').textContent = '手动落点 · 请核对经纬度后确认';
      });
    });
    this.toggleButton?.addEventListener('click', () => this.toggle('publish'));
    this.backdrop?.addEventListener('click', () => this.close());
    document.getElementById('btn-close-community-drawer')?.addEventListener('click', () => this.close());

    document.getElementById('btn-refresh-publish-loc')?.addEventListener('click', () => {
      this.fetchCurrentLocation(true);
    });

    document.querySelectorAll('[data-community-tab]').forEach(button => {
      button.addEventListener('click', () => this.selectTab(button.dataset.communityTab));
    });

    document.querySelectorAll('[data-comment-sort]').forEach(button => {
      button.addEventListener('click', () => {
        this.commentSort = button.dataset.commentSort === 'latest' ? 'latest' : 'hot';
        this.renderComments();
      });
    });

    document.getElementById('player-comments-btn')?.addEventListener('click', () => this.open('comments', this.activeSpot));
    document.getElementById('player-like-btn')?.addEventListener('click', () => this.toggleSpotLike());
    document.getElementById('community-spot-like-btn')?.addEventListener('click', () => this.toggleSpotLike());

    // Compact Trigger Bar Click Handlers (Expands form)
    document.getElementById('player-compact-fake-input')?.addEventListener('click', () => this.expandCommentForm('player'));
    document.getElementById('player-compact-trigger-btn')?.addEventListener('click', () => this.expandCommentForm('player'));
    document.getElementById('community-compact-fake-input')?.addEventListener('click', () => this.expandCommentForm('drawer'));
    document.getElementById('community-compact-trigger-btn')?.addEventListener('click', () => this.expandCommentForm('drawer'));

    // Collapse Form Handlers
    document.getElementById('btn-collapse-player-form')?.addEventListener('click', () => {
      this.collapseCommentForm('player');
      this.cancelReply();
    });
    document.getElementById('btn-collapse-community-form')?.addEventListener('click', () => {
      this.collapseCommentForm('drawer');
      this.cancelReply();
    });

    // Nickname User Chip and Save Handlers
    document.getElementById('player-comment-user-chip')?.addEventListener('click', () => this.toggleNicknameEdit('player'));
    document.getElementById('btn-save-player-nickname')?.addEventListener('click', () => this.saveNickname('player'));
    document.getElementById('player-comment-author-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveNickname('player');
      }
    });

    document.getElementById('community-comment-user-chip')?.addEventListener('click', () => this.toggleNicknameEdit('drawer'));
    document.getElementById('btn-save-community-nickname')?.addEventListener('click', () => this.saveNickname('drawer'));
    document.getElementById('community-comment-author-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveNickname('drawer');
      }
    });

    // Cancel reply triggers
    document.getElementById('btn-cancel-community-reply')?.addEventListener('click', () => this.cancelReply());
    document.getElementById('btn-cancel-player-reply')?.addEventListener('click', () => this.cancelReply());

    // Player Quick Comment Form
    this.playerCommentForm?.addEventListener('submit', event => {
      event.preventDefault();
      this.addPlayerComment();
    });

    // Quick Feeling Tags in Player
    this.form?.addEventListener('submit', event => {
      event.preventDefault();
      this.publishPost();
    });
    this.commentsForm?.addEventListener('submit', event => {
      event.preventDefault();
      this.addComment();
    });

    const handleCommentListClick = (event) => {
      if (!this.activeSpot) return;

      // 1. Delete root comment
      const deleteButton = event.target.closest('[data-comment-delete]');
      if (deleteButton) {
        storage.deleteComment(this.activeSpot.id, deleteButton.dataset.commentDelete);
        this.renderComments();
        return;
      }

      // 2. Delete sub-comment
      const subDelBtn = event.target.closest('[data-sub-del-id]');
      if (subDelBtn) {
        const rootId = subDelBtn.dataset.subDelRoot;
        const replyId = subDelBtn.dataset.subDelId;
        storage.deleteComment(this.activeSpot.id, rootId, replyId);
        this.renderComments();
        return;
      }

      // 3. Like sub-comment
      const subLikeBtn = event.target.closest('[data-sub-like-id]');
      if (subLikeBtn) {
        const rootId = subLikeBtn.dataset.subLikeRoot;
        const replyId = subLikeBtn.dataset.subLikeId;
        storage.toggleCommentLike(this.activeSpot.id, rootId, replyId);
        this.renderComments();
        return;
      }

      // 4. Like root comment
      const likeBtn = event.target.closest('[data-comment-like]');
      if (likeBtn) {
        storage.toggleCommentLike(this.activeSpot.id, likeBtn.dataset.commentLike);
        this.renderComments();
        return;
      }

      // 5. Reply to sub-comment (via reply button or clicking on sub-comment row)
      const subItem = event.target.closest('.sub-comment-item, .player-sub-item');
      const subReplyBtn = event.target.closest('[data-sub-reply-root]');
      if (subReplyBtn || (subItem && !event.target.closest('button'))) {
        const rootId = subReplyBtn ? subReplyBtn.dataset.subReplyRoot : subItem?.querySelector('[data-sub-reply-root]')?.dataset.subReplyRoot;
        const author = subReplyBtn ? subReplyBtn.dataset.subReplyAuthor : (subItem?.querySelector('.sub-comment-author, .player-sub-author')?.textContent.trim() || '');
        const formType = (event.target.closest('#player-comments-list')) ? 'player' : 'drawer';

        if (rootId && author) {
          document.querySelectorAll('.highlight-reply-target').forEach(el => el.classList.remove('highlight-reply-target'));
          subItem?.classList.add('highlight-reply-target');
          setTimeout(() => subItem?.classList.remove('highlight-reply-target'), 1800);

          this.setReplyTarget({ rootId, targetAuthor: author }, formType);
          return;
        }
      }

      // 6. Reply to root comment (via reply button or clicking on comment content)
      const commentCard = event.target.closest('.community-comment, .player-comment-card');
      const replyButton = event.target.closest('[data-comment-reply]');
      if (replyButton || (commentCard && !event.target.closest('button'))) {
        const rootId = replyButton ? replyButton.dataset.commentReply : (commentCard?.querySelector('[data-comment-reply]')?.dataset.commentReply || '');
        const author = replyButton ? replyButton.dataset.author : (commentCard?.querySelector('strong, .comment-author-name')?.textContent.trim() || '');
        const formType = (event.target.closest('#player-comments-list')) ? 'player' : 'drawer';

        if (rootId && author) {
          document.querySelectorAll('.highlight-reply-target').forEach(el => el.classList.remove('highlight-reply-target'));
          commentCard?.classList.add('highlight-reply-target');
          setTimeout(() => commentCard?.classList.remove('highlight-reply-target'), 1800);

          this.setReplyTarget({ rootId, targetAuthor: author }, formType);
          return;
        }
      }
    };

    this.commentsList?.addEventListener('click', handleCommentListClick);
    this.playerCommentsList?.addEventListener('click', handleCommentListClick);

    document.getElementById('community-cover-input')?.addEventListener('change', event => {
      this.updateFileLabel('community-cover-file-name', event.target.files?.[0]);
    });
    document.getElementById('community-audio-input')?.addEventListener('change', event => {
      this.updateFileLabel('community-audio-file-name', event.target.files?.[0]);
    });
  }

  async fetchCurrentLocation(force = false) {
    const display = document.getElementById('current-loc-display');
    const dot = document.getElementById('current-loc-dot');
    const latInput = document.getElementById('pub-current-lat');
    const lngInput = document.getElementById('pub-current-lng');

    if (!force && latInput?.value && lngInput?.value) return;
    const request = this.locationRequest = (this.locationRequest || 0) + 1;
    document.getElementById('pub-confirm-location').checked = false;
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';

    if (display) display.textContent = '正在获取当前实时定位…';
    if (dot) dot.className = 'current-loc-indicator';

    try {
      const loc = await resolveUserLocation();
      if (request !== this.locationRequest) return;
      if (!loc || loc.source === 'default' || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng) || Math.abs(loc.lat) > 90 || Math.abs(loc.lng) > 180) throw new Error('No valid location');
      const lat = loc.lat;
      const lng = loc.lng;
      this.currentLocationCoords = { lat, lng };
      const cityDesc = loc.city ? ` · ${loc.city}` : '';
      const sourceLabel = { 'ip-network': '网络估算', 'server-ip': '网络估算', cached: '历史位置', 'browser-gps': '设备定位', 'miniprogram-gps': '传入坐标' }[loc.source] || '参考位置';
      if (display) display.textContent = `${sourceLabel}${cityDesc} · 请核对下方坐标，不准确可手动修改`;
      if (dot) dot.className = 'current-loc-indicator success';
      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;
    } catch (err) {
      if (request !== this.locationRequest) return;
      console.warn('[Publish Location Geolocation]', err);
      this.currentLocationCoords = null;
      if (display) display.textContent = '未获取到有效位置，请手动填写发布坐标';
      if (dot) dot.className = 'current-loc-indicator error';
      if (latInput) latInput.value = '';
      if (lngInput) lngInput.value = '';
    }
  }

  updateFileLabel(elementId, file) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = file?.name || t('noFileSelected', this.getLanguage());
  }

  open(tab = 'publish', spot = this.activeSpot) {
    this.onBeforeOpen?.();
    if (spot) this.setActiveSpot(spot);
    this.selectTab(tab);
    this.drawer?.classList.add('open');
    this.backdrop?.classList.add('open');
    this.drawer?.setAttribute('aria-hidden', 'false');
    this.toggleButton?.classList.add('active');
    this.toggleButton?.setAttribute('aria-expanded', 'true');
    if (tab === 'publish') {
      this.fetchCurrentLocation();
    }
  }

  close() {
    this.drawer?.classList.remove('open');
    this.backdrop?.classList.remove('open');
    this.drawer?.setAttribute('aria-hidden', 'true');
    this.toggleButton?.classList.remove('active');
    this.toggleButton?.setAttribute('aria-expanded', 'false');
  }

  toggle(tab = 'publish') {
    if (this.drawer?.classList.contains('open')) this.close();
    else this.open(tab);
  }

  selectTab(tab) {
    this.activeTab = tab === 'comments' ? 'comments' : 'publish';
    document.querySelectorAll('[data-community-tab]').forEach(button => {
      const active = button.dataset.communityTab === this.activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-community-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.communityPanel === this.activeTab);
    });
    if (this.activeTab === 'comments') this.renderComments();
  }

  setLanguage() {
    this.updateFileLabel('community-cover-file-name', document.getElementById('community-cover-input')?.files?.[0]);
    this.updateFileLabel('community-audio-file-name', document.getElementById('community-audio-input')?.files?.[0]);
    this.setActiveSpot(this.activeSpot);
  }

  setActiveSpot(spot) {
    if (!spot) return;
    this.activeSpot = spot;
    this.cancelReply();
    this.ensureActiveComments();
    const name = getSpotName(spot, this.getLanguage());
    const location = getSpotLocation(spot, this.getLanguage());
    const image = document.getElementById('community-active-spot-image');
    if (image) {
      image.src = spot.photos?.[0] || FALLBACK_COVER;
      image.alt = name;
    }
    const nameElement = document.getElementById('community-active-spot-name');
    const locationElement = document.getElementById('community-active-spot-location');
    if (nameElement) nameElement.textContent = name;
    if (locationElement) locationElement.textContent = `${location} · ${getDemoTrack(spot).title}`;
    this.renderEngagement();
    this.renderComments();
  }

  renderEngagement() {
    if (!this.activeSpot) return;
    const likeState = storage.getSpotLike(this.activeSpot.id, seedLikeCount(this.activeSpot.id));
    const comments = this.ensureActiveComments();
    const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);

    document.querySelectorAll('[data-spot-like-count]').forEach(element => {
      element.textContent = String(likeState.count);
    });
    document.querySelectorAll('[data-spot-comment-count]').forEach(element => {
      element.textContent = String(totalCount);
    });

    const playerCommentsBadge = document.getElementById('player-comments-count-badge');
    if (playerCommentsBadge) playerCommentsBadge.textContent = String(totalCount);
    const tabCommentsBadge = document.getElementById('player-tab-comments-badge') || document.getElementById('mobile-comments-badge');
    if (tabCommentsBadge) tabCommentsBadge.textContent = String(totalCount);

    [document.getElementById('player-like-btn'), document.getElementById('community-spot-like-btn')].forEach(button => {
      button?.classList.toggle('active', likeState.liked);
      button?.classList.toggle('liked', likeState.liked);
      button?.setAttribute('aria-pressed', String(likeState.liked));
      const heartIcon = button?.querySelector('.like-heart-icon');
      if (heartIcon) heartIcon.textContent = getLikeLabel(likeState.liked, this.getLanguage());
    });
  }

  toggleSpotLike() {
    if (!this.activeSpot) return;
    storage.toggleSpotLike(this.activeSpot.id, seedLikeCount(this.activeSpot.id));
    this.renderEngagement();
  }

  ensureActiveComments() {
    if (!this.activeSpot) return [];
    const track = getDemoTrack(this.activeSpot);
    return storage.ensureComments(
      this.activeSpot.id,
      createSeedComments(this.activeSpot),
      `nested-v2-${track.id}`
    );
  }

  renderComments() {
    if (!this.activeSpot) return;
    const language = this.getLanguage();
    const comments = [...this.ensureActiveComments()].sort((a, b) => (
      this.commentSort === 'latest'
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : Number(b.likes || 0) - Number(a.likes || 0) || new Date(b.createdAt) - new Date(a.createdAt)
    ));

    document.querySelectorAll('[data-comment-sort]').forEach(button => {
      const active = button.dataset.commentSort === this.commentSort;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    // 1. Render in Community Drawer
    if (this.commentsList) {
      if (!comments.length) {
        this.commentsList.innerHTML = `<div class="community-empty">${t('noComments', language)}</div>`;
      } else {
        const pinnedId = this.commentSort === 'hot' && comments[0]?.likes > 0 ? comments[0].id : null;
        this.commentsList.innerHTML = comments.map(comment => {
          const author = stripEmoji(language === LANGUAGES.EN ? (comment.enAuthor || comment.author) : comment.author);
          const text = stripEmoji(language === LANGUAGES.EN ? (comment.enText || comment.text) : comment.text);
          const date = new Intl.DateTimeFormat(language === LANGUAGES.EN ? 'en-US' : 'zh-CN', {
            month: 'short', day: 'numeric'
          }).format(new Date(comment.createdAt));
          const replies = comment.replies || [];

          return `
            <article class="community-comment ${comment.id === pinnedId ? 'pinned' : ''}">
              <div class="comment-meta">
                <span class="comment-avatar" style="--avatar-hue:${avatarHue(author)}">${escapeHtml(author).slice(0, 1).toUpperCase()}</span>
                <div class="comment-author-block">
                  <strong>${escapeHtml(author)}${comment.isSeed ? (language === LANGUAGES.EN ? ' · Demo' : ' · 示例评论') : ''}</strong>
                  <span>${date}</span>
                </div>
                ${comment.id === pinnedId ? `<span class="pinned-badge">${t('pinnedComment', language)}</span>` : ''}
              </div>
              <p class="comment-content">${escapeHtml(text)}</p>
              <div class="comment-actions">
                <button class="comment-reply-btn" type="button" data-comment-reply="${comment.id}" data-author="${escapeHtml(author)}">${t('reply', language)}</button>
                <button class="comment-like-btn ${comment.liked ? 'active' : ''}" type="button" data-comment-like="${comment.id}" aria-pressed="${Boolean(comment.liked)}">
                  <span>${getLikeLabel(comment.liked, language)}</span><span>${Number(comment.likes || 0).toLocaleString(language === LANGUAGES.EN ? 'en-US' : 'zh-CN')}</span>
                </button>
                ${comment.isUser ? `<button class="comment-delete-btn" type="button" data-comment-delete="${comment.id}">${t('deleteComment', language)}</button>` : ''}
              </div>

              ${replies.length > 0 ? `
                <div class="comment-sub-thread">
                  ${replies.map(sub => {
                    const subAuthor = stripEmoji(language === LANGUAGES.EN ? (sub.enAuthor || sub.author) : sub.author);
                    const subText = stripEmoji(language === LANGUAGES.EN ? (sub.enText || sub.text) : sub.text);
                    const subDate = new Intl.DateTimeFormat(language === LANGUAGES.EN ? 'en-US' : 'zh-CN', {
                      month: 'numeric', day: 'numeric'
                    }).format(new Date(sub.createdAt || comment.createdAt));
                    const replyTo = sub.replyToAuthor;

                    return `
                      <div class="sub-comment-item">
                        <div class="sub-comment-main">
                          <span class="sub-comment-author">${escapeHtml(subAuthor)}</span>
                          ${replyTo ? `
                            <span class="sub-comment-reply-label">回复</span>
                            <span class="sub-comment-target-author">@${escapeHtml(replyTo)}</span>
                          ` : ''}
                          <span class="sub-comment-colon">：</span>
                          <span class="sub-comment-text">${escapeHtml(subText)}</span>
                        </div>
                        <div class="sub-comment-footer">
                          <span class="sub-comment-time">${subDate}</span>
                          <div class="sub-comment-actions">
                            <button class="sub-reply-action-btn" type="button" data-sub-reply-root="${comment.id}" data-sub-reply-author="${escapeHtml(subAuthor)}">${t('reply', language)}</button>
                            <button class="sub-like-action-btn ${sub.liked ? 'active' : ''}" type="button" data-sub-like-root="${comment.id}" data-sub-like-id="${sub.id}">
                              <span>${getLikeLabel(sub.liked, language)}</span><span>${Number(sub.likes || 0)}</span>
                            </button>
                            ${sub.isUser ? `<button class="sub-del-action-btn" type="button" data-sub-del-root="${comment.id}" data-sub-del-id="${sub.id}">${t('deleteComment', language)}</button>` : ''}
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : ''}
            </article>`;
        }).join('');
      }
    }

    // 2. Render in Immersive Player Floating Comments Modal
    if (this.playerCommentsList) {
      if (!comments.length) {
        this.playerCommentsList.innerHTML = `<div style="color: var(--text-muted); font-size: 11px; padding: 12px 0; text-align: center;">${t('noComments', language)}</div>`;
      } else {
        this.playerCommentsList.innerHTML = comments.map(comment => {
          const author = stripEmoji(language === LANGUAGES.EN ? (comment.enAuthor || comment.author) : comment.author);
          const text = stripEmoji(language === LANGUAGES.EN ? (comment.enText || comment.text) : comment.text);
          const date = new Intl.DateTimeFormat(language === LANGUAGES.EN ? 'en-US' : 'zh-CN', {
            month: 'numeric', day: 'numeric'
          }).format(new Date(comment.createdAt));
          const replies = comment.replies || [];

          return `
            <div class="player-comment-card">
              <div class="comment-card-header">
                <div class="comment-author-info">
                  <span class="comment-avatar" style="--avatar-hue:${avatarHue(author)}">${escapeHtml(author).slice(0, 1).toUpperCase()}</span>
                  <span class="comment-author-name">${escapeHtml(author)}${comment.isSeed ? (language === LANGUAGES.EN ? ' · Demo' : ' · 示例评论') : ''}</span>
                  <span class="comment-time">${date}</span>
                </div>
                <div class="comment-header-actions">
                  <button class="player-comment-reply-trigger" type="button" data-comment-reply="${comment.id}" data-author="${escapeHtml(author)}">${t('reply', language)}</button>
                  <button class="comment-card-like-btn ${comment.liked ? 'active' : ''}" type="button" data-comment-like="${comment.id}">
                    <span>${getLikeLabel(comment.liked, language)}</span><span>${Number(comment.likes || 0)}</span>
                  </button>
                </div>
              </div>
              <div class="comment-body">${escapeHtml(text)}</div>

              ${replies.length > 0 ? `
                <div class="player-sub-thread">
                  ${replies.map(sub => {
                    const subAuthor = stripEmoji(language === LANGUAGES.EN ? (sub.enAuthor || sub.author) : sub.author);
                    const subText = stripEmoji(language === LANGUAGES.EN ? (sub.enText || sub.text) : sub.text);
                    const replyTo = sub.replyToAuthor;

                    return `
                      <div class="player-sub-item">
                        <div class="player-sub-content">
                          <span class="player-sub-author">${escapeHtml(subAuthor)}</span>
                          ${replyTo ? `
                            <span class="player-sub-reply-tag">回复</span>
                            <span class="player-sub-target">@${escapeHtml(replyTo)}</span>
                          ` : ''}
                          <span class="player-sub-colon">：</span>
                          <span class="player-sub-text">${escapeHtml(subText)}</span>
                        </div>
                        <div class="player-sub-meta">
                          <button class="player-sub-reply-btn" type="button" data-sub-reply-root="${comment.id}" data-sub-reply-author="${escapeHtml(subAuthor)}">${t('reply', language)}</button>
                          <button class="player-sub-like-btn ${sub.liked ? 'active' : ''}" type="button" data-sub-like-root="${comment.id}" data-sub-like-id="${sub.id}">
                            <span>${getLikeLabel(sub.liked, language)}</span><span>${Number(sub.likes || 0)}</span>
                          </button>
                          ${sub.isUser ? `<button class="player-sub-del-btn" type="button" data-sub-del-root="${comment.id}" data-sub-del-id="${sub.id}">${t('deleteComment', language)}</button>` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : ''}
            </div>`;
        }).join('');
      }
    }

    this.renderEngagement();
  }

  addComment() {
    if (!this.activeSpot || !this.commentsForm) return;
    const textInput = document.getElementById('community-comment-text-input');
    const text = stripEmoji(textInput?.value || '');
    const author = stripEmoji(storage.getUserNickname(t('musicTraveler', this.getLanguage()))) || t('musicTraveler', this.getLanguage());
    if (!text) return;

    if (this.replyingTarget) {
      storage.addReply(this.activeSpot.id, this.replyingTarget.rootId, {
        id: `reply-${Date.now()}`,
        author,
        text,
        replyToAuthor: this.replyingTarget.targetAuthor,
        likes: 0,
        liked: false,
        isUser: true,
        createdAt: new Date().toISOString()
      });
      this.cancelReply();
    } else {
      storage.addComment(this.activeSpot.id, {
        id: `comment-${Date.now()}`,
        author,
        text,
        likes: 0,
        liked: false,
        isUser: true,
        createdAt: new Date().toISOString(),
        replies: []
      });
    }

    if (textInput) textInput.value = '';
    this.collapseCommentForm('drawer');
    this.renderComments();
    this.showToast(t('commentAdded', this.getLanguage()));
  }

  addPlayerComment() {
    if (!this.activeSpot) return;
    const textInput = document.getElementById('player-comment-text-input');
    const text = stripEmoji(textInput?.value || '');
    const author = stripEmoji(storage.getUserNickname(t('musicTraveler', this.getLanguage()))) || t('musicTraveler', this.getLanguage());
    if (!text) return;

    if (this.replyingTarget) {
      storage.addReply(this.activeSpot.id, this.replyingTarget.rootId, {
        id: `reply-${Date.now()}`,
        author,
        text,
        replyToAuthor: this.replyingTarget.targetAuthor,
        likes: 0,
        liked: false,
        isUser: true,
        createdAt: new Date().toISOString()
      });
      this.cancelReply();
    } else {
      storage.addComment(this.activeSpot.id, {
        id: `comment-${Date.now()}`,
        author,
        text,
        likes: 0,
        liked: false,
        isUser: true,
        createdAt: new Date().toISOString(),
        replies: []
      });
    }

    if (textInput) textInput.value = '';
    this.collapseCommentForm('player');
    this.renderComments();
    this.showToast(t('commentAdded', this.getLanguage()));
  }

  async publishPost() {
    if (!this.form) return;
    if (!this.form.reportValidity()) return;
    const formData = new FormData(this.form);
    const title = stripEmoji(formData.get('title') || '');
    const defaultNick = stripEmoji(storage.getUserNickname(t('musicTraveler', this.getLanguage()))) || t('musicTraveler', this.getLanguage());
    const author = stripEmoji(formData.get('author') || '') || defaultNick;
    const description = stripEmoji(formData.get('description') || '');
    const coverFile = formData.get('cover');
    const audioFile = formData.get('audio');
    if (!title || !description) return;

    formData.set('title', title);
    formData.set('author', author);
    formData.set('description', description);

    if (coverFile instanceof File && coverFile.size > MAX_COVER_BYTES) {
      this.showToast(this.getLanguage() === LANGUAGES.EN ? 'Cover image must be under 10 MB.' : '封面图片不能超过 10MB。');
      return;
    }
    if (audioFile instanceof File && audioFile.size > MAX_AUDIO_BYTES) {
      this.showToast(this.getLanguage() === LANGUAGES.EN ? 'Audio file must be under 48 MB.' : '音频文件不能超过 48MB。');
      return;
    }

    const lat = Number(formData.get('currentLat'));
    const lng = Number(formData.get('currentLng'));
    if (!String(formData.get('currentLat') || '').trim() || !String(formData.get('currentLng') || '').trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !document.getElementById('pub-confirm-location')?.checked) {
      this.showToast('请填写有效经纬度并确认公开落点');
      return;
    }
    if (!(audioFile instanceof File) || audioFile.size === 0) {
      this.showToast('请上传音乐文件后再发布');
      return;
    }
    const locationName = `坐标 · ${lng.toFixed(2)}°E, ${lat.toFixed(2)}°N`;
    const country = '当前位置';

    const hasAudioUpload = audioFile instanceof File && audioFile.size > 0;
    const hasCoverUpload = coverFile instanceof File && coverFile.size > 0;
    const coverUrl = FALLBACK_COVER;
    const audioTrack = hasAudioUpload ? {
      id: `pending-upload-${Date.now()}`,
      title: audioFile.name.replace(/\.[^.]+$/, ''),
      creator: author,
      url: '',
      license: t('userUpload', this.getLanguage()),
      sourceUrl: ''
    } : null;

    const id = `community-${Date.now()}`;
    const spot = {
      id,
      name: title,
      enName: title,
      location: locationName,
      country: country,
      category: 'town',
      lat,
      lng,
      description,
      tags: ['用户投稿', 'Community'],
      photos: [coverUrl],
      author,
      isCommunity: true,
      audioTrack,
      audioRecipe: {
        style: 'regional_acoustic',
        bpm: 72,
        scale: '用户专属原声音景',
        instruments: audioTrack ? audioTrack.title : '专属上传原声音乐',
        naturalSound: 'wind'
      }
    };

    const submitButton = this.form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
    }

    let publishedSpot;
    try {
      const data = await requestJson('/api/community/publish', {
        method: 'POST',
        body: formData
      });
      if (!data?.spot?.id) {
        throw new Error('服务器没有返回有效点位');
      }
      if (hasAudioUpload && !data.spot.audioTrack?.url) {
        throw new Error('音频没有成功保存到服务器');
      }
      if (hasCoverUpload && !data.spot.photos?.[0]) {
        throw new Error('封面没有成功保存到服务器');
      }
      publishedSpot = { ...spot, ...data.spot, serverSynced: true };
    } catch (error) {
      console.error('[GeoMelody Community] Publish failed:', error);
      const message = error?.message || (this.getLanguage() === LANGUAGES.EN ? 'Publish failed. Please try again.' : '发布失败，请稍后重试。');
      this.showToast(this.getLanguage() === LANGUAGES.EN ? `Publish failed: ${message}` : `发布失败：${message}`);
      return;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
      }
    }

    // Keep a small local metadata cache only after the server confirms publication.
    storage.saveCommunityPost(publishedSpot);

    if (!this.spots.some(s => s.id === publishedSpot.id)) {
      this.spots.unshift(publishedSpot);
    }
    this.form.reset();
    this.updateFileLabel('community-cover-file-name');
    this.updateFileLabel('community-audio-file-name');
    this.setActiveSpot(publishedSpot);
    this.close();
    this.onPublish?.(publishedSpot);
    this.showToast(t('publishedSuccess', this.getLanguage(), { name: publishedSpot.name }));
  }
}
