import { soundEngine } from '../audio/soundEngine.js';
import { storage } from '../utils/storage.js';
import { shareUtil } from '../utils/share.js';
import { shareCardManager } from '../utils/shareCard.js';
import { getDemoTrack } from '../data/demoTracks.js';
import {
  LANGUAGES,
  getSpotDescription,
  getSpotName,
  getSpotSecondaryName,
  t
} from '../utils/i18n.js';
import { getFallbackCover } from '../utils/imageFallback.js';
import { getSpotLyrics } from '../data/lyricsData.js';

function formatTime(seconds = 0) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getSafeExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export class PlayerManager {
  constructor({ spots, onSpotChange, onExit, showToast, getLanguage = () => LANGUAGES.ZH }) {
    this.spots = spots;
    this.onSpotChange = onSpotChange;
    this.onExit = onExit;
    this.showToast = showToast;
    this.getLanguage = getLanguage;

    this.currentSpot = null;
    this.currentLyrics = [];
    this.currentLyricIndex = -1;
    this.currentPhotoIndex = 0;
    this.photoTimer = null;
    this.isAutoTourActive = false;
    this.autoTourTimer = null;
    this.autoTourIntervalSec = 35;

    this.isZenMode = false;
    this.idleTimer = null;
    this.visualizerAnimationId = null;

    // Elements cache
    this.overlay = document.getElementById('immersive-player');
    this.uiLayer = document.getElementById('player-ui-layer');
    this.bgCanvas = document.getElementById('player-bg-canvas');
    this.photoDots = document.getElementById('player-photo-dots');
    this.visualizerContainer = document.getElementById('player-visualizer');

    this.initVisualizer();
    this.bindEvents();
  }

  initVisualizer() {
    if (!this.visualizerContainer) return;
    this.visualizerContainer.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const bar = document.createElement('div');
      bar.className = 'viz-bar';
      this.visualizerContainer.appendChild(bar);
    }
  }

  bindEvents() {
    // ==================== Segmented Morphic View Switcher Dock ====================
    const storyCard = document.getElementById('player-story-card');
    const commentsCard = document.getElementById('player-floating-comments');
    const tabStoryBtn = document.getElementById('btn-player-tab-story') || document.getElementById('btn-mobile-toggle-story');
    const tabGalleryBtn = document.getElementById('btn-player-tab-gallery') || document.getElementById('btn-mobile-toggle-gallery');
    const tabCommentsBtn = document.getElementById('btn-player-tab-comments') || document.getElementById('btn-mobile-toggle-comments');
    const closeStoryBtn = document.getElementById('btn-close-story-sheet');
    const closeCommentsBtn = document.getElementById('btn-close-comments-sheet');

    const toggleStoryCard = (forceState) => {
      const isCurrentlyOpen = storyCard?.classList.contains('panel-open') || storyCard?.classList.contains('mobile-open') || storyCard?.classList.contains('open');
      const targetState = forceState !== undefined ? forceState : !isCurrentlyOpen;
      
      storyCard?.classList.toggle('panel-open', targetState);
      storyCard?.classList.toggle('mobile-open', targetState);
      storyCard?.classList.toggle('open', targetState);
      tabStoryBtn?.classList.toggle('active', targetState);
      tabStoryBtn?.setAttribute('aria-pressed', String(targetState));

      if (targetState) {
        // Mutually exclusive: close comments when opening story
        commentsCard?.classList.remove('panel-open', 'mobile-open', 'open');
        tabCommentsBtn?.classList.remove('active');
        tabCommentsBtn?.setAttribute('aria-pressed', 'false');
      }
    };

    const toggleCommentsCard = (forceState) => {
      const isCurrentlyOpen = commentsCard?.classList.contains('panel-open') || commentsCard?.classList.contains('mobile-open') || commentsCard?.classList.contains('open');
      const targetState = forceState !== undefined ? forceState : !isCurrentlyOpen;
      
      commentsCard?.classList.toggle('panel-open', targetState);
      commentsCard?.classList.toggle('mobile-open', targetState);
      commentsCard?.classList.toggle('open', targetState);
      tabCommentsBtn?.classList.toggle('active', targetState);
      tabCommentsBtn?.setAttribute('aria-pressed', String(targetState));

      if (targetState) {
        // Mutually exclusive: close story when opening comments
        storyCard?.classList.remove('panel-open', 'mobile-open', 'open');
        tabStoryBtn?.classList.remove('active');
        tabStoryBtn?.setAttribute('aria-pressed', 'false');
      }
    };

    if (this.overlay) {
      this.overlay.addEventListener('mousemove', () => this.handleUserActivity());
      this.overlay.addEventListener('click', (e) => {
        if (this.uiLayer.classList.contains('ui-hidden')) {
          this.revealUI();
        }
        if (!e.target.closest('#player-story-card') &&
            !e.target.closest('#player-floating-comments') &&
            !e.target.closest('#player-view-switcher-dock') &&
            !e.target.closest('#player-gallery-modal') &&
            !e.target.closest('#player-control-island') &&
            !e.target.closest('.player-top-header') &&
            !e.target.closest('.comment-card-like-btn') &&
            !e.target.closest('.comment-sub-like-btn')) {
          toggleStoryCard(false);
          toggleCommentsCard(false);
        }
      });
    }

    tabStoryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStoryCard();
    });

    tabCommentsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCommentsCard();
    });

    tabGalleryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openGallery();
    });

    closeStoryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStoryCard(false);
    });

    closeCommentsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCommentsCard(false);
    });

    const galleryBtn = document.getElementById('player-gallery-btn');
    const closeGalleryBtn = document.getElementById('btn-close-gallery-modal');
    const galleryBackdrop = document.getElementById('gallery-modal-backdrop');

    galleryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openGallery();
    });

    closeGalleryBtn?.addEventListener('click', () => this.closeGallery());
    galleryBackdrop?.addEventListener('click', () => this.closeGallery());

    this.initGalleryUpload();

    // ==================== Progress Bar Seeking & Audio Events ====================
    const progressTrack = document.getElementById('player-progress-track');
    const handleSeek = (e) => {
      if (!progressTrack) return;
      const rect = progressTrack.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX ?? 0);
      const clickX = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const duration = soundEngine.getDuration();
      if (duration > 0) {
        soundEngine.seek(ratio * duration);
      }
    };

    if (progressTrack) {
      let isDragging = false;
      progressTrack.addEventListener('mousedown', (e) => {
        isDragging = true;
        handleSeek(e);
      });
      window.addEventListener('mousemove', (e) => {
        if (isDragging) handleSeek(e);
      });
      window.addEventListener('mouseup', () => {
        isDragging = false;
      });

      progressTrack.addEventListener('touchstart', (e) => {
        isDragging = true;
        handleSeek(e);
      }, { passive: true });
      window.addEventListener('touchmove', (e) => {
        if (isDragging) handleSeek(e);
      }, { passive: true });
      window.addEventListener('touchend', () => {
        isDragging = false;
      });
    }

    const miniProgress = document.getElementById('mini-island-progress');
    miniProgress?.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = miniProgress.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const duration = soundEngine.getDuration();
      if (duration > 0) {
        soundEngine.seek(ratio * duration);
      }
    });

    // Subscribe to sound engine events
    soundEngine.subscribe((event, data) => {
      if (event === 'timeUpdate') {
        this.updateProgress(data);
        this.updateLyrics(data.currentTime);
      } else if (event === 'playStateChange') {
        this.updatePlayButton(data.isPlaying);
      } else if (event === 'trackChange') {
        if (data.track) {
          const dockSongTitle = document.getElementById('player-dock-song-title');
          const dockSongArtist = document.getElementById('player-dock-song-artist');
          if (dockSongTitle && dockSongArtist) {
            dockSongTitle.textContent = data.track.title;
            dockSongArtist.textContent = data.track.creator;
          }
          this.renderLyrics(data.spot || this.currentSpot, data.track);
        }
      } else if (event === 'trackEnded') {
        this.playRandomNextSpot();
      }
    });

    const closeBtn = document.getElementById('player-close-btn');
    const mobileBackBtn = document.getElementById('player-mobile-back-btn');
    const handleClose = (e) => {
      e?.stopPropagation?.();
      e?.preventDefault?.();
      this.close();
    };
    closeBtn?.addEventListener('click', handleClose);
    closeBtn?.addEventListener('touchend', handleClose);
    mobileBackBtn?.addEventListener('click', handleClose);
    mobileBackBtn?.addEventListener('touchend', handleClose);

    window.addEventListener('keydown', (e) => {
      if (!this.currentSpot || !this.overlay.classList.contains('active')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowRight') {
        this.nextSpot();
      } else if (e.code === 'ArrowLeft') {
        this.prevSpot();
      } else if (e.code === 'KeyZ') {
        this.toggleZenMode();
      } else if (e.code === 'KeyF') {
        this.toggleFullscreen();
      } else if (e.code === 'Escape') {
        const modal = document.getElementById('player-gallery-modal');
        if (modal?.classList.contains('open')) {
          this.closeGallery();
        } else {
          this.close();
        }
      }
    });
  }

  handleUserActivity() {
    this.revealUI();
    if (this.isZenMode) {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (this.isZenMode && this.currentSpot) {
          this.uiLayer.classList.add('ui-hidden');
        }
      }, 4000);
    }
  }

  revealUI() {
    this.uiLayer.classList.remove('ui-hidden');
  }

  openSpot(spot, autoStartAudio = true) {
    if (!spot) return;
    this.currentSpot = spot;
    this.currentPhotoIndex = 0;

    this.renderSpotInfo(spot);
    this.renderPhotos();
    this.updateFavoriteButton();

    this.overlay.classList.add('active');
    shareUtil.updateUrl(spot.id);

    if (autoStartAudio) {
      soundEngine.playSpot(spot);
      this.updatePlayButton(false);
    } else {
      if (soundEngine.currentSpot?.id !== spot.id) soundEngine.pause();
      this.updatePlayButton(soundEngine.isPlaying);
    }

    this.startPhotoSlideshow();
    this.startVisualizerLoop();

    if (this.onSpotChange) {
      this.onSpotChange(spot);
    }
  }

  setLanguage() {
    if (!this.currentSpot) return;
    this.renderSpotInfo(this.currentSpot);
    this.renderPhotos();
    const modal = document.getElementById('player-gallery-modal');
    if (modal?.classList.contains('open')) {
      this.renderGalleryModal();
    }
  }

  renderSpotInfo(spot) {
    const language = this.getLanguage();

    // Titles
    const titleEl = document.getElementById('player-spot-title');
    if (titleEl) titleEl.textContent = getSpotName(spot, language);

    const enTitleEl = document.getElementById('player-spot-en-title');
    if (enTitleEl) enTitleEl.textContent = getSpotSecondaryName(spot, language);

    // Poetic Story Quote
    const storyEl = document.getElementById('player-story-quote');
    if (storyEl) storyEl.textContent = getSpotDescription(spot, language);

    // AI Audio Formula
    const formulaEl = document.getElementById('player-audio-formula');
    if (formulaEl) {
      const rec = spot.audioRecipe || {};
      const scale = language === LANGUAGES.EN ? t('regionalMode', language) : rec.scale;
      const instruments = language === LANGUAGES.EN ? t('localInstruments', language) : rec.instruments;
      formulaEl.innerHTML = `<span><strong>${escapeHtml(t('scaleLabel', language))}：</strong>${escapeHtml(scale)}</span><span class="formula-separator">·</span><span><strong>${escapeHtml(t('instrumentsLabel', language))}：</strong>${escapeHtml(instruments)}</span><span class="formula-separator">·</span><span><strong>${escapeHtml(t('tempoLabel', language))}：</strong>${Number(rec.bpm) || 72} BPM</span>`;
    }

    const creditEl = document.getElementById('player-track-credit');
    const track = getDemoTrack(spot);
    if (creditEl) {
      const prefix = spot.audioTrack?.url ? t('userUpload', language) : t('demoMusic', language);
      const credit = [prefix, `${track.title} — ${track.creator}`, track.license].filter(Boolean).join(' · ');
      const safeSourceUrl = getSafeExternalUrl(track.sourceUrl);
      creditEl.replaceChildren();
      if (safeSourceUrl) {
        const link = document.createElement('a');
        link.href = safeSourceUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = credit;
        creditEl.appendChild(link);
      } else {
        creditEl.textContent = credit;
      }
    }

    const dockSongTitle = document.getElementById('player-dock-song-title');
    const dockSongArtist = document.getElementById('player-dock-song-artist');
    if (dockSongTitle && dockSongArtist) {
      dockSongTitle.textContent = track.title;
      dockSongArtist.textContent = track.creator;
    }

    // Render NetEase Cloud Style Subtitle Lyrics
    this.renderLyrics(spot, track);
  }

  renderLyrics(spot, track) {
    const container = document.getElementById('player-lyrics-scroll-wrap');
    if (!container) return;
    const lyrics = getSpotLyrics(spot, track);
    this.currentLyrics = lyrics;
    this.currentLyricIndex = -1;

    container.innerHTML = lyrics.map((line, index) => {
      return `<p class="lyric-line ${index === 0 ? 'active' : ''}" data-time="${line.time}" data-index="${index}">${line.text}</p>`;
    }).join('');

    // Clicking any lyric line jumps directly to that timestamp
    container.querySelectorAll('.lyric-line').forEach(lineEl => {
      lineEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const time = parseFloat(lineEl.dataset.time || '0');
        soundEngine.seek(time);
      });
    });
  }

  updateLyrics(currentTime) {
    if (!this.currentLyrics || !this.currentLyrics.length) return;
    let activeIndex = 0;
    for (let i = 0; i < this.currentLyrics.length; i++) {
      if (this.currentLyrics[i].time <= currentTime) {
        activeIndex = i;
      } else {
        break;
      }
    }

    if (activeIndex !== this.currentLyricIndex) {
      this.currentLyricIndex = activeIndex;
      const lyricsContainer = document.getElementById('player-lyrics-container');
      const lines = lyricsContainer?.querySelectorAll('.lyric-line');
      if (lines && lines.length) {
        lines.forEach((line, i) => {
          line.classList.toggle('active', i === activeIndex);
        });
        const activeEl = lines[activeIndex];
        if (activeEl && lyricsContainer) {
          const containerHeight = lyricsContainer.clientHeight;
          const lineTop = activeEl.offsetTop;
          const lineHeight = activeEl.clientHeight;
          lyricsContainer.scrollTo({
            top: lineTop - (containerHeight / 2) + (lineHeight / 2),
            behavior: 'smooth'
          });
        }
      }
    }
  }

  updateProgress({ currentTime = 0, duration = 0, progress = 0 } = {}) {
    const curTimeEl = document.getElementById('player-time-current');
    const totalTimeEl = document.getElementById('player-time-total');
    const fillEl = document.getElementById('player-progress-fill');
    const thumbEl = document.getElementById('player-progress-thumb');
    const miniFillEl = document.getElementById('mini-progress-fill');

    if (curTimeEl) curTimeEl.textContent = formatTime(currentTime);
    if (totalTimeEl && duration > 0) totalTimeEl.textContent = formatTime(duration);
    const pct = Math.max(0, Math.min(100, (progress || 0) * 100));
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (thumbEl) thumbEl.style.left = `${pct}%`;
    if (miniFillEl) miniFillEl.style.width = `${pct}%`;
  }

  renderPhotos() {
    if (!this.bgCanvas || !this.currentSpot) return;
    const photos = storage.getSpotPhotos(this.currentSpot);
    this.activePhotos = photos;
    this.bgCanvas.innerHTML = '';
    this.photoDots.innerHTML = '';

    photos.forEach((url, index) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = getSpotName(this.currentSpot, this.getLanguage());
      img.className = `scenery-slide-img ${index === 0 ? 'visible' : ''}`;
      img.loading = 'eager';
      img.decoding = 'async';
      img.fetchPriority = index === 0 ? 'high' : 'auto';
      img.onerror = () => {
        if (!img.dataset.fallbackApplied) {
          img.dataset.fallbackApplied = 'true';
          img.src = getFallbackCover(this.currentSpot?.category);
        }
      };
      this.bgCanvas.appendChild(img);

      // Dot indicator
      const dot = document.createElement('div');
      dot.className = `scenery-dot ${index === 0 ? 'active' : ''}`;
      dot.title = t('photo', this.getLanguage(), { number: index + 1 });
      dot.addEventListener('click', () => this.switchPhoto(index));
      this.photoDots.appendChild(dot);
    });

    const galleryBadge = document.getElementById('player-tab-gallery-badge') || document.getElementById('mobile-gallery-badge');
    if (galleryBadge) {
      galleryBadge.textContent = String(photos.length);
    }
  }

  switchPhoto(index) {
    const imgs = this.bgCanvas?.querySelectorAll('.scenery-slide-img') || [];
    const dots = this.photoDots?.querySelectorAll('.scenery-dot') || [];
    if (!imgs.length) return;

    this.currentPhotoIndex = (index + imgs.length) % imgs.length;

    const activeImage = imgs[this.currentPhotoIndex];
    if (activeImage && !activeImage.hasAttribute('src') && activeImage.dataset.src) {
      activeImage.src = activeImage.dataset.src;
      activeImage.fetchPriority = 'high';
    }

    imgs.forEach((img, i) => {
      img.classList.toggle('visible', i === this.currentPhotoIndex);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === this.currentPhotoIndex);
    });

    // Sync gallery modal card active state if open
    const modal = document.getElementById('player-gallery-modal');
    if (modal?.classList.contains('open')) {
      const cards = modal.querySelectorAll('.gallery-card');
      cards.forEach((card, i) => {
        card.classList.toggle('active-wallpaper', i === this.currentPhotoIndex);
      });
    }
  }

  nextPhoto() {
    this.switchPhoto(this.currentPhotoIndex + 1);
  }

  prevPhoto() {
    this.switchPhoto(this.currentPhotoIndex - 1);
  }

  startPhotoSlideshow() {
    this.stopPhotoSlideshow();
    this.photoTimer = setInterval(() => {
      this.nextPhoto();
    }, 10000);
  }

  stopPhotoSlideshow() {
    if (this.photoTimer) {
      clearInterval(this.photoTimer);
      this.photoTimer = null;
    }
  }

  // ==================== Photo Gallery & Contribution Modal ====================
  openGallery() {
    if (!this.currentSpot) return;
    const modal = document.getElementById('player-gallery-modal');
    if (!modal) return;
    this.showGalleryView('grid');
    this.renderGalleryModal();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  closeGallery() {
    const modal = document.getElementById('player-gallery-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    this.showGalleryView('grid');
  }

  showGalleryView(view = 'grid') {
    const gridView = document.getElementById('gallery-view-grid');
    const uploadView = document.getElementById('gallery-view-upload');
    const uploadTriggerBtn = document.getElementById('btn-open-gallery-upload');
    if (view === 'upload') {
      if (gridView) gridView.style.display = 'none';
      if (uploadView) uploadView.style.display = 'block';
      if (uploadTriggerBtn) uploadTriggerBtn.style.display = 'none';
    } else {
      if (gridView) gridView.style.display = 'block';
      if (uploadView) uploadView.style.display = 'none';
      if (uploadTriggerBtn) uploadTriggerBtn.style.display = 'inline-flex';
    }
  }

  renderGalleryModal() {
    if (!this.currentSpot) return;
    const records = storage.getSpotPhotoRecords(this.currentSpot, getSpotName(this.currentSpot, this.getLanguage()));
    const container = document.getElementById('gallery-cards-container');
    const countBadge = document.getElementById('gallery-count-badge');
    const spotNameEl = document.getElementById('gallery-spot-name');

    if (spotNameEl) {
      spotNameEl.textContent = `${getSpotName(this.currentSpot, this.getLanguage())} · ${t('spotGalleryTitle', this.getLanguage())}`;
    }
    if (countBadge) {
      countBadge.textContent = `${records.length} 张壁纸`;
    }
    if (!container) return;

    container.innerHTML = records.map((record, index) => {
      const isActive = index === this.currentPhotoIndex;
      const tag = record.isBuiltin
        ? `<span class="gallery-builtin-tag">精选</span>`
        : `<span class="gallery-builtin-tag" style="color: #38bdf8;">共创</span>`;

      return `
        <div class="gallery-card ${isActive ? 'active-wallpaper' : ''}" data-photo-index="${index}" data-photo-id="${escapeHtml(record.id)}">
          <div class="gallery-card-thumb-wrap">
            <img src="${escapeHtml(record.url)}" alt="${escapeHtml(record.caption || '')}" class="gallery-card-thumb" loading="lazy" />
            ${isActive ? `<span class="gallery-active-badge">当前壁纸</span>` : ''}
            ${tag}
            <button type="button" class="gallery-card-like-btn ${record.liked ? 'liked' : ''}" data-photo-id="${escapeHtml(record.id)}" title="为这幅壁纸点赞 (高赞优先轮播)">
              <span class="like-heart">${record.liked ? '已赞' : '赞'}</span>
              <span class="like-num">${record.likes || 0}</span>
            </button>
          </div>
          <div class="gallery-card-info">
            <span class="gallery-card-caption">${escapeHtml(record.caption || '胜景留影')}</span>
            <div class="gallery-card-meta">
              <span>作者 · ${escapeHtml(record.author || '摄影师')}</span>
              ${!record.isBuiltin ? `<button type="button" class="gallery-delete-photo-btn" data-photo-id="${escapeHtml(record.id)}" title="删除此照片" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 11px;">删除</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Photo like / upvote button click
    container.querySelectorAll('.gallery-card-like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const photoId = btn.dataset.photoId;
        if (photoId) {
          const res = storage.togglePhotoLike(photoId);
          btn.classList.toggle('liked', res.liked);
          const heart = btn.querySelector('.like-heart');
          const num = btn.querySelector('.like-num');
          if (heart) heart.textContent = res.liked ? '已赞' : '赞';
          if (num) num.textContent = res.count;
          this.showToast(res.liked ? '已为壁纸点赞！高赞照片将优先轮播' : '已取消点赞');
          // Re-sort wallpapers so highest-liked ranked photos appear first in gallery & slideshow
          this.renderPhotos();
          this.renderGalleryModal();
        }
      });
    });

    container.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.gallery-delete-photo-btn') || e.target.closest('.gallery-card-like-btn')) return;
        const idx = Number(card.dataset.photoIndex);
        if (!isNaN(idx)) {
          this.switchPhoto(idx);
          this.renderGalleryModal();
          this.showToast('已切换至此壁纸！');
        }
      });
    });

    container.querySelectorAll('.gallery-delete-photo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const photoId = btn.dataset.photoId;
        if (photoId && this.currentSpot) {
          storage.deleteSpotPhoto(this.currentSpot.id, photoId);
          this.renderPhotos();
          this.renderGalleryModal();
          this.showToast('已删除该共创照片');
        }
      });
    });
  }

  initGalleryUpload() {
    const fileInput = document.getElementById('gallery-file-input');
    const dropzone = document.getElementById('gallery-dropzone');
    const promptEl = document.getElementById('gallery-dropzone-prompt');
    const previewEl = document.getElementById('gallery-file-preview');
    const previewImg = document.getElementById('gallery-preview-img');
    const removeFileBtn = document.getElementById('btn-gallery-remove-file');
    const uploadForm = document.getElementById('gallery-upload-form');
    const cancelBtn = document.getElementById('btn-cancel-gallery-upload');
    const triggerUploadBtn = document.getElementById('btn-open-gallery-upload');

    let currentFileDataUrl = null;

    triggerUploadBtn?.addEventListener('click', () => this.showGalleryView('upload'));
    cancelBtn?.addEventListener('click', () => this.showGalleryView('grid'));

    dropzone?.addEventListener('click', (e) => {
      if (e.target.closest('#btn-gallery-remove-file')) return;
      fileInput?.click();
    });

    const handleFile = (file) => {
      if (!file || !file.type.startsWith('image/')) {
        this.showToast('请选择有效的图片文件 (JPG / PNG / WebP)');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1920;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          currentFileDataUrl = canvas.toDataURL('image/jpeg', 0.85);

          if (previewImg) previewImg.src = currentFileDataUrl;
          if (promptEl) promptEl.style.display = 'none';
          if (previewEl) previewEl.style.display = 'block';
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    };

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    removeFileBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentFileDataUrl = null;
      if (fileInput) fileInput.value = '';
      if (previewImg) previewImg.src = '';
      if (previewEl) previewEl.style.display = 'none';
      if (promptEl) promptEl.style.display = 'flex';
    });

    uploadForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!currentFileDataUrl) {
        this.showToast('请先选择或拖拽一张壁纸图片');
        return;
      }
      if (!this.currentSpot) return;

      const authorInput = document.getElementById('gallery-author-input');
      const captionInput = document.getElementById('gallery-caption-input');
      const author = authorInput?.value?.trim() || '旅行摄影师';
      const caption = captionInput?.value?.trim() || '胜景壁纸';

      const newPhoto = storage.addSpotPhoto(this.currentSpot.id, {
        url: currentFileDataUrl,
        author,
        caption
      });

      currentFileDataUrl = null;
      if (fileInput) fileInput.value = '';
      if (previewImg) previewImg.src = '';
      if (previewEl) previewEl.style.display = 'none';
      if (promptEl) promptEl.style.display = 'flex';
      if (captionInput) captionInput.value = '';

      this.renderPhotos();
      this.renderGalleryModal();
      this.showGalleryView('grid');

      if (newPhoto.status === 'approved') {
        this.showToast(t('photoApprovedToast', this.getLanguage()));
      } else {
        this.showToast(t('photoPendingToast', this.getLanguage()));
      }
    });
  }

  // Navigation Between Spots
  nextSpot() {
    if (!this.currentSpot) return;
    const currentIndex = this.spots.findIndex(s => s.id === this.currentSpot.id);
    const nextIndex = (currentIndex + 1) % this.spots.length;
    this.openSpot(this.spots[nextIndex]);
  }

  playRandomNextSpot() {
    if (!this.spots.length) return;

    const currentTrack = getDemoTrack(this.currentSpot);
    const otherSpots = this.spots.filter(spot => spot.id !== this.currentSpot?.id && getDemoTrack(spot).url);
    const differentTrackSpots = otherSpots.filter(spot => {
      const track = getDemoTrack(spot);
      const sameId = Boolean(currentTrack?.id && track?.id && currentTrack.id === track.id);
      const sameUrl = Boolean(currentTrack?.url && track?.url && currentTrack.url === track.url);
      return !sameId && !sameUrl;
    });
    const candidates = differentTrackSpots.length ? differentTrackSpots : otherSpots;
    const randomSpot = candidates[Math.floor(Math.random() * candidates.length)];

    if (randomSpot) this.openSpot(randomSpot, true);
  }

  prevSpot() {
    if (!this.currentSpot) return;
    const currentIndex = this.spots.findIndex(s => s.id === this.currentSpot.id);
    const prevIndex = (currentIndex - 1 + this.spots.length) % this.spots.length;
    this.openSpot(this.spots[prevIndex]);
  }

  randomRoam() {
    const otherSpots = this.spots.filter(s => !this.currentSpot || s.id !== this.currentSpot.id);
    const randomSpot = otherSpots[Math.floor(Math.random() * otherSpots.length)] || this.spots[0];
    if (randomSpot) {
      this.openSpot(randomSpot, true);
      this.showToast(t('roamTo', this.getLanguage(), { name: getSpotName(randomSpot, this.getLanguage()) }));
    }
  }

  // Auto Cruise Mode (Desktop Wallpaper Tour)
  toggleAutoTour() {
    this.isAutoTourActive = !this.isAutoTourActive;
    if (this.isAutoTourActive) {
      if (!this.currentSpot) {
        const spot = this.spots[Math.floor(Math.random() * this.spots.length)] || this.spots[0];
        this.openSpot(spot, true);
      } else {
        this.nextSpot();
      }
      this.showToast(t('autoTourOn', this.getLanguage()));
      if (this.autoTourTimer) clearInterval(this.autoTourTimer);
      this.autoTourTimer = setInterval(() => {
        this.nextSpot();
      }, 16000);
    } else {
      this.showToast(t('autoTourOff', this.getLanguage()));
      if (this.autoTourTimer) {
        clearInterval(this.autoTourTimer);
        this.autoTourTimer = null;
      }
    }
    return this.isAutoTourActive;
  }

  // Zen Mode / Fullscreen
  toggleZenMode() {
    this.isZenMode = !this.isZenMode;
    if (this.isZenMode) {
      this.uiLayer.classList.add('ui-hidden');
      this.showToast(t('zenOn', this.getLanguage()));
    } else {
      this.uiLayer.classList.remove('ui-hidden');
      clearTimeout(this.idleTimer);
    }
    const zenBtn = document.getElementById('player-zen-btn');
    zenBtn?.classList.toggle('active', this.isZenMode);
    zenBtn?.setAttribute('aria-pressed', String(this.isZenMode));
    return this.isZenMode;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      this.showToast(t('fullscreenOn', this.getLanguage()));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  // Audio & Visualizer
  togglePlay() {
    if (!this.currentSpot) return;
    soundEngine.togglePlay(this.currentSpot);
    this.updatePlayButton(soundEngine.isPlaying);
  }

  updatePlayButton(isPlaying) {
    const playBtn = document.getElementById('player-play-btn');
    if (!playBtn) return;
    playBtn.innerHTML = isPlaying
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
    playBtn.setAttribute('aria-pressed', String(isPlaying));
  }

  startVisualizerLoop() {
    const bars = this.visualizerContainer?.querySelectorAll('.viz-bar') || [];
    if (!bars.length) return;

    const render = () => {
      if (this.overlay.classList.contains('active') && soundEngine.isPlaying) {
        const data = soundEngine.getVisualizerData();
        bars.forEach((bar, i) => {
          const val = data[i * 2] || 0;
          const height = Math.max(3, (val / 255) * 16);
          bar.style.height = `${height}px`;
        });
      }
      this.visualizerAnimationId = requestAnimationFrame(render);
    };

    if (this.visualizerAnimationId) {
      cancelAnimationFrame(this.visualizerAnimationId);
    }
    this.visualizerAnimationId = requestAnimationFrame(render);
  }

  // Favorites & Share
  toggleFavorite() {
    if (!this.currentSpot) return;
    const { isFavorite } = storage.toggleFavorite(this.currentSpot.id);
    this.updateFavoriteButton();
    this.showToast(isFavorite
      ? t('favoriteAdded', this.getLanguage(), { name: getSpotName(this.currentSpot, this.getLanguage()) })
      : t('favoriteRemoved', this.getLanguage()));
    return isFavorite;
  }

  updateFavoriteButton() {
    const favBtn = document.getElementById('player-fav-btn');
    if (!favBtn || !this.currentSpot) return;
    const isFav = storage.isFavorite(this.currentSpot.id);
    favBtn.classList.toggle('active', isFav);
    favBtn.setAttribute('aria-pressed', String(isFav));
    favBtn.innerHTML = isFav
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" color="#fb7185"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
  }

  shareCurrentSpot() {
    if (!this.currentSpot) return;
    shareCardManager.open(this.currentSpot);
  }

  close() {
    this.overlay.classList.remove('active');
    this.stopPhotoSlideshow();
    shareUtil.updateUrl(null);
    if (this.onExit) {
      this.onExit(this.currentSpot);
    }
  }
}
