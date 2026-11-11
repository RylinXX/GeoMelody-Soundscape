import { SCENIC_SPOTS } from './data/spots.js';
import { CATEGORY_MAP } from './data/categories.js';
import { MAP_REGIONS, getRegionName } from './data/regions.js';
import { DEMO_TRACKS_LIST, getDemoTrack } from './data/demoTracks.js';
import { GlobeManager } from './map/globeManager.js';
import { PlayerManager } from './player/playerManager.js';
import { CommunityManager } from './community/communityManager.js';
import { soundEngine } from './audio/soundEngine.js';
import { storage, DEFAULT_SETTINGS } from './utils/storage.js';
import { shareUtil } from './utils/share.js';
import { shareCardManager } from './utils/shareCard.js';
import { initGlobalImageFallback, getFallbackCover } from './utils/imageFallback.js';
import { applyAirplaneSkin } from './map/airplaneSkin.js';
import { resolveUserLocation } from './utils/geoLocator.js';
import { initDiscovery } from './discovery.js';
import {
  LANGUAGES,
  applyTranslations,
  getCategoryName,
  getInitialLanguage,
  getSpotDescription,
  getSpotLocation,
  getSpotName,
  persistLanguage,
  t
} from './utils/i18n.js';

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Global Image Fallback Interceptor
  initGlobalImageFallback();

  const THEME_STORAGE_KEY = 'geomelody-map-style';
  const THEME_DEFAULT_VERSION_KEY = 'geomelody-map-default-version';
  const THEME_DEFAULT_VERSION = 'blue-globe-v2';
  let viewMode = '3d';
  let activeRegion = 'asia';
  let currentLanguage = getInitialLanguage();
  let currentSettings = storage.getSettings();
  let currentMapSkin = DEFAULT_SETTINGS.mapSkin;
  let migratedDefaultTheme = false;
  try {
    const savedMapSkin = localStorage.getItem(THEME_STORAGE_KEY);
    const needsDefaultMigration = localStorage.getItem(THEME_DEFAULT_VERSION_KEY) !== THEME_DEFAULT_VERSION;
    migratedDefaultTheme = needsDefaultMigration && (!savedMapSkin || savedMapSkin === '01-dark');
    currentMapSkin = migratedDefaultTheme
      ? DEFAULT_SETTINGS.mapSkin
      : (savedMapSkin || currentSettings.mapSkin || DEFAULT_SETTINGS.mapSkin);
    localStorage.setItem(THEME_DEFAULT_VERSION_KEY, THEME_DEFAULT_VERSION);
    if (migratedDefaultTheme) localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_SETTINGS.mapSkin);
  } catch {}
  const validSkins = ['03-fast-blue', '01-dark', 'white-terrain', 'fast-dark', 'rich-dark', 'light'];
  if (!validSkins.includes(currentMapSkin)) currentMapSkin = DEFAULT_SETTINGS.mapSkin;
  let currentTheme = currentMapSkin === 'light' ? 'light' : 'dark';
  currentSettings.mapSkin = currentMapSkin;
  if (migratedDefaultTheme) currentSettings = storage.saveSettings({ mapSkin: currentMapSkin });

  const regionNavigation = document.getElementById('region-navigation');
  const searchInput = document.getElementById('spot-search-input');
  const searchDropdown = document.getElementById('search-dropdown');
  const toggleViewModeBtn = document.getElementById('dock-btn-toggle-view-mode');
  const viewModeText = document.getElementById('view-mode-btn-text');
  const autoTourBtn = document.getElementById('dock-btn-auto-tour');
  const autoTourText = document.getElementById('auto-tour-btn-text');
  const languageBtn = document.getElementById('btn-language-toggle');
  const playerLanguageBtn = document.getElementById('player-language-toggle');
  const playerLanguageLabel = document.getElementById('player-language-label');
  const themeBtn = document.getElementById('btn-theme-toggle');
  const playerThemeBtn = document.getElementById('player-theme-toggle');

  const miniIsland = document.getElementById('mini-audio-island');
  const miniThumb = document.getElementById('mini-audio-thumb');
  const miniName = document.getElementById('mini-audio-name');
  const miniDesc = document.getElementById('mini-audio-desc');
  const miniPlayBtn = document.getElementById('mini-play-toggle-btn');

  const favDrawer = document.getElementById('fav-drawer');
  const favBackdrop = document.getElementById('fav-drawer-backdrop');
  const favCountBadge = document.getElementById('fav-count-badge');
  const favListContainer = document.getElementById('fav-list-container');
  const favToggleBtn = document.getElementById('btn-toggle-favorites');

  // Leaderboard Drawer Elements
  const leaderboardDrawer = document.getElementById('leaderboard-drawer');
  const leaderboardBackdrop = document.getElementById('leaderboard-drawer-backdrop');
  const leaderboardToggleBtn = document.getElementById('btn-toggle-leaderboard');
  const closeLeaderboardBtn = document.getElementById('btn-close-leaderboard');
  const leaderboardListContainer = document.getElementById('leaderboard-list-container');
  const navLanguageLabel = document.getElementById('nav-language-label');

  // Settings Drawer Elements
  const settingsDrawer = document.getElementById('settings-drawer');
  const settingsBackdrop = document.getElementById('settings-drawer-backdrop');
  const settingsToggleBtn = document.getElementById('btn-toggle-settings');
  const closeSettingsBtn = document.getElementById('btn-close-settings-drawer');
  const resetSettingsBtn = document.getElementById('btn-reset-settings');
  const settingsFullscreenBtn = document.getElementById('setting-fullscreen-btn');
  const settingsFullscreenText = document.getElementById('setting-fullscreen-text');

  const selectMapSkinInput = document.getElementById('setting-select-mapskin');
  const selectPlaneSkinInput = document.getElementById('setting-select-planeskin');
  const toggleStarsInput = document.getElementById('setting-toggle-stars');
  const toggleHaloInput = document.getElementById('setting-toggle-halo');
  const toggleAutoSpinInput = document.getElementById('setting-toggle-autospin');
  const toggleAutoPlayInput = document.getElementById('setting-toggle-autoplay');

  // Spot Preview Bottom Card Elements
  const spotPreviewCard = document.getElementById('spot-preview-card');
  const btnCloseSpotPreview = document.getElementById('btn-close-spot-preview');
  const btnSpotPreviewEnter = document.getElementById('btn-spot-preview-enter');
  let previewSpotTarget = null;

  function showSpotPreviewCard(spot) {
    if (!spot || !spotPreviewCard) return;

    previewSpotTarget = spot;
    globeManager.flyToSpot(spot, 6.2);

    const coverEl = document.getElementById('spot-preview-img');
    const catEl = document.getElementById('spot-preview-category');
    const nameEl = document.getElementById('spot-preview-name');
    const locEl = document.getElementById('spot-preview-loc');
    const storyEl = document.getElementById('spot-preview-story');
    const trackTitleEl = document.getElementById('spot-preview-track-title');

    const isUnclaimed = spot.category === 'unclaimed';
    const isCommunity = Boolean(spot.isCommunity);
    if (coverEl) coverEl.src = spot.photos?.[0] || '';
    if (catEl) {
      if (isCommunity) {
        catEl.textContent = currentLanguage === 'en' ? 'User Pinned' : '我的打卡点位';
        catEl.style.color = '#fbbf24';
      } else {
        const cat = CATEGORY_MAP[spot.category];
        catEl.textContent = getCategoryName(cat, currentLanguage);
        catEl.style.color = '';
      }
      catEl.classList.toggle('unclaimed', isUnclaimed);
    }
    if (nameEl) nameEl.textContent = getSpotName(spot, currentLanguage);
    if (locEl) locEl.textContent = `${getSpotLocation(spot, currentLanguage)} · ${spot.lat.toFixed(2)}°, ${spot.lng.toFixed(2)}°`;
    if (storyEl) storyEl.textContent = getSpotDescription(spot, currentLanguage);
    if (trackTitleEl) {
      const track = getDemoTrack(spot);
      trackTitleEl.textContent = track ? `${track.title} — ${track.creator}` : (spot.audioRecipe?.scale || '');
    }

    if (btnSpotPreviewEnter) {
      btnSpotPreviewEnter.classList.toggle('unclaimed', isUnclaimed);
      const btnTextEl = btnSpotPreviewEnter.querySelector('span');
      if (btnTextEl) {
        btnTextEl.textContent = isUnclaimed
          ? (currentLanguage === 'en' ? 'Claim & Explore' : '抢先认领 · 探索')
          : (currentLanguage === 'en' ? 'Enter' : '进入');
      }
    }

    miniIsland?.classList.remove('visible');
    spotPreviewCard.classList.add('visible');
    spotPreviewCard.setAttribute('aria-hidden', 'false');
  }

  function hideSpotPreviewCard() {
    if (!spotPreviewCard) return;
    spotPreviewCard.classList.remove('visible');
    spotPreviewCard.setAttribute('aria-hidden', 'true');
    previewSpotTarget = null;
  }

  btnCloseSpotPreview?.addEventListener('click', event => {
    event.stopPropagation();
    hideSpotPreviewCard();
  });

  btnSpotPreviewEnter?.addEventListener('click', event => {
    event.stopPropagation();
    if (previewSpotTarget) {
      const target = previewSpotTarget;
      hideSpotPreviewCard();
      playerManager.openSpot(target, true);
    }
  });

  spotPreviewCard?.addEventListener('click', event => {
    if (event.target.closest('#btn-close-spot-preview')) return;
    if (previewSpotTarget) {
      const target = previewSpotTarget;
      hideSpotPreviewCard();
      playerManager.openSpot(target, true);
    }
  });

  let playerManager;
  let communityManager;

  const globeManager = new GlobeManager({
    containerId: 'globe-container',
    spots: SCENIC_SPOTS,
    language: currentLanguage,
    theme: currentTheme,
    settings: { ...currentSettings, mapSkin: currentMapSkin },
    onSpotSelect: spot => {
      hideSpotPreviewCard();
      if (globeManager.isRoaming) {
        // 巡航模式下：点地图上的光点不直接播放，小飞机飞过去并弹出推荐浮窗，暂停自转等待用户判定
        globeManager.pauseRotation(60000);
        globeManager.flyToSpot(spot, undefined, true);
      } else {
        // 普通模式下：点击光点直接进入播放
        playerManager.openSpot(spot, storage.getSettings().autoPlay);
      }
    },
    onFlybyPlay: spot => {
      hideSpotPreviewCard();
      playerManager.openSpot(spot, true);
    },
    onRoamingChange: isRoaming => {
      autoTourBtn?.classList.toggle('primary', isRoaming);
      autoTourBtn?.setAttribute('aria-pressed', String(isRoaming));
      if (autoTourText) {
        autoTourText.textContent = isRoaming ? t('touring', currentLanguage) : t('autoTour', currentLanguage);
      }
    },
    onFlybySpotChange: () => {
      // Recommendation card in cruise mode updates its visual preview smoothly.
      // Playing audio is kept untouched and continues playing steadily!
    },
    onMapClick: () => {
      hideSpotPreviewCard();
      if (globeManager.isRoaming) {
        globeManager.rotationPausedUntil = 0;
      }
    }
  });
  const globeInitPromise = globeManager.init().catch(error => {
    document.documentElement.dataset.mapError = error?.message || String(error);
    const loadingStatus = document.getElementById('globe-loading-status');
    if (loadingStatus) loadingStatus.textContent = currentLanguage === 'en'
      ? 'Map unavailable. You can still play featured soundscapes.'
      : '地图暂不可用，你仍可从精选卡片开始收听。';
    document.getElementById('map-retry-btn')?.removeAttribute('hidden');
    console.error('[GeoMelody map] Initialization failed.', error);
  });
  document.getElementById('map-retry-btn')?.addEventListener('click', () => window.location.reload());
  window.setTimeout(() => {
    if (document.getElementById('globe-loading-shell')?.classList.contains('is-hidden')) return;
    const status = document.getElementById('globe-loading-status');
    if (status) status.textContent = currentLanguage === 'en'
      ? 'Map is taking longer. Try a featured soundscape while you wait.'
      : '地图加载较慢，可以先从精选卡片开始收听。';
    document.getElementById('map-retry-btn')?.removeAttribute('hidden');
  }, 12000);

  playerManager = new PlayerManager({
    spots: SCENIC_SPOTS,
    getLanguage: () => currentLanguage,
    onSpotChange: spot => {
      globeManager.flyToSpot(spot, undefined, false);
      updateMiniAudioIsland(spot, soundEngine.isPlaying);
      communityManager?.setActiveSpot(spot);
    },
    onExit: spot => updateMiniAudioIsland(spot, soundEngine.isPlaying),
    showToast
  });

  const discovery = initDiscovery({
    spots: SCENIC_SPOTS,
    getLanguage: () => currentLanguage,
    onPlay: spot => {
      exitRoamingMode();
      hideSpotPreviewCard();
      playerManager.openSpot(spot, true);
    }
  });

  communityManager = new CommunityManager({
    spots: SCENIC_SPOTS,
    getLanguage: () => currentLanguage,
    showToast,
    onBeforeOpen: () => {
      hideSpotPreviewCard();
      toggleFavDrawer(false);
      toggleSettingsDrawer(false);
      toggleLeaderboardDrawer(false);
    },
    onPublish: spot => {
      if (!SCENIC_SPOTS.some(s => s.id === spot.id)) {
        SCENIC_SPOTS.unshift(spot);
      }
      globeManager.spots = SCENIC_SPOTS;
      globeManager.renderLightDotMarkers();
      globeManager.flyToSpot(spot, 6.2, true);
      showSpotPreviewCard(spot);
    }
  });

  shareCardManager.init({
    showToast,
    getLanguage: () => currentLanguage
  });

  const syncGlobalCommunitySpots = async () => {
    try {
      const result = await storage.loadCommunityPostsWithMedia(SCENIC_SPOTS);
      if (result.changed) {
        globeManager.spots = SCENIC_SPOTS;
        globeManager.renderLightDotMarkers();
        if (communityManager) communityManager.spots = SCENIC_SPOTS;
        if (playerManager) playerManager.spots = SCENIC_SPOTS;
      }
      return true;
    } catch (error) {
      console.warn('[GeoMelody Community] Sync failed:', error?.message || error);
      return false;
    }
  };

  let communitySyncTimer = null;
  const scheduleCommunitySync = (delay = 0) => {
    clearTimeout(communitySyncTimer);
    communitySyncTimer = window.setTimeout(async () => {
      const ok = await syncGlobalCommunitySpots();
      const nextDelay = document.hidden ? 120000 : (ok ? 30000 : 60000);
      scheduleCommunitySync(nextDelay);
    }, delay);
  };
  scheduleCommunitySync();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleCommunitySync(500);
  });

  function renderRegionNavigation() {
    if (!regionNavigation) return;
    regionNavigation.innerHTML = '';
    MAP_REGIONS.forEach(region => {
      const chip = document.createElement('button');
      const regionName = getRegionName(region, currentLanguage);
      chip.className = `category-chip region-chip ${region.id === activeRegion ? 'active' : ''}`;
      chip.dataset.region = region.id;
      chip.setAttribute('aria-pressed', String(region.id === activeRegion));
      chip.innerHTML = `<span class="region-chip-icon">${region.icon}</span><span>${regionName}</span>`;
      chip.addEventListener('click', () => {
        exitRoamingMode();
        activeRegion = region.id;
        globeManager.flyToRegion(region);
        renderRegionNavigation();
        showToast(t('regionFocused', currentLanguage, { name: regionName }));
      });
      regionNavigation.appendChild(chip);
    });
  }

  function getMatches(query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return SCENIC_SPOTS.filter(spot => {
      const track = getDemoTrack(spot);
      return [
        spot.name,
        spot.enName,
        spot.location,
        spot.enLocation,
        spot.country,
        spot.category,
        track?.title,
        track?.enTitle,
        track?.creator,
        ...(spot.tags || [])
      ].some(value => value?.toLowerCase().includes(normalizedQuery));
    }).slice(0, 8);
  }

  function selectSearchSpot(spot) {
    if (!spot) return;
    exitRoamingMode();
    searchDropdown?.classList.remove('visible');
    if (searchInput) {
      searchInput.value = '';
      searchInput.blur();
    }
    globeManager.setSearchQuery('');
    showSpotPreviewCard(spot);
  }

  function renderSearchRecommendations() {
    if (!searchDropdown) return;
    const isZh = currentLanguage !== LANGUAGES.EN;

    const hotSpots = [
      { id: 'westlake', name: '杭州西湖', enName: 'West Lake' },
      { id: 'forbiddencity', name: '北京故宫', enName: 'Forbidden City' },
      { id: 'everest', name: '珠穆朗玛峰', enName: 'Mt. Everest' },
      { id: 'taishan', name: '泰山', enName: 'Mount Tai' },
      { id: 'guilin_5a', name: '桂林漓江', enName: 'Li River' },
      { id: 'paris', name: '巴黎铁塔', enName: 'Eiffel Tower' },
      { id: 'santorini', name: '圣托里尼', enName: 'Santorini' }
    ];

    const hotTags = [
      { tag: '5A景区', label: isZh ? '5A 级胜景' : '5A Scenic' },
      { tag: '世界遗产', label: isZh ? '世界遗产' : 'World Heritage' },
      { tag: '古镇', label: isZh ? '江南古镇' : 'Water Towns' },
      { tag: '雪山', label: isZh ? '雪山高原' : 'Snow Mountains' },
      { tag: '海岛', label: isZh ? '海岛沙滩' : 'Islands' },
      { tag: '治愈', label: isZh ? '治愈助眠' : 'Healing' }
    ];

    searchDropdown.innerHTML = `
      <div class="search-dropdown-section">
        <div class="search-section-header">${isZh ? '热门胜景推荐' : 'Popular Spots'}</div>
        <div class="search-tag-group">
          ${hotSpots.filter(s => SCENIC_SPOTS.some(spot => spot.id === s.id)).map(s => `
            <button class="search-tag-chip" type="button" data-action="spot" data-id="${s.id}">
              ${isZh ? s.name : s.enName}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="search-dropdown-section">
        <div class="search-section-header">${isZh ? '热门曲目探索' : 'Featured Tracks'}</div>
        <div class="search-track-list">
          ${DEMO_TRACKS_LIST.slice(0, 4).map(track => `
            <button class="search-track-item" type="button" data-action="track" data-track-id="${track.id}">
              <span class="search-track-title">${isZh ? track.title : (track.enTitle || track.title)}</span>
              <span class="search-track-artist">${track.creator}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="search-dropdown-section">
        <div class="search-section-header">${isZh ? '热门城市与标签' : 'Trending Tags'}</div>
        <div class="search-tag-group">
          ${hotTags.map(t => `
            <button class="search-tag-chip" type="button" data-action="tag" data-tag="${t.tag}">
              # ${t.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    searchDropdown.classList.add('visible');

    searchDropdown.querySelectorAll('[data-action="spot"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const spot = SCENIC_SPOTS.find(s => s.id === btn.dataset.id);
        if (spot) selectSearchSpot(spot);
      });
    });

    searchDropdown.querySelectorAll('[data-action="track"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.trackId;
        const matchingSpot = SCENIC_SPOTS.find(s => getDemoTrack(s).id === trackId) || SCENIC_SPOTS[0];
        selectSearchSpot(matchingSpot);
      });
    });

    searchDropdown.querySelectorAll('[data-action="tag"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = btn.dataset.tag;
        if (searchInput) {
          searchInput.value = tag;
          renderSearchResults(tag);
          globeManager.setSearchQuery(tag);
        }
      });
    });
  }

  function renderSearchResults(query) {
    if (!searchDropdown) return;
    const cleanQuery = query?.trim() || '';
    if (!cleanQuery) {
      renderSearchRecommendations();
      return;
    }

    const matches = getMatches(cleanQuery);
    if (!matches.length) {
      searchDropdown.innerHTML = `<div class="search-empty-state">${t('noResults', currentLanguage)}</div>`;
      searchDropdown.classList.add('visible');
      return;
    }

    searchDropdown.innerHTML = `
      <div class="search-dropdown-section">
        <div class="search-section-header">${currentLanguage !== LANGUAGES.EN ? `匹配到 ${matches.length} 个胜景` : `Found ${matches.length} spots`}</div>
        ${matches.map(spot => {
          const category = CATEGORY_MAP[spot.category] || { name: t('explore', currentLanguage), enName: t('explore', currentLanguage) };
          const track = getDemoTrack(spot);
          const photo = spot.photos?.[0] || '';
          return `
            <button class="search-result-item" type="button" data-id="${escapeHtml(spot.id)}">
              ${photo ? `<img src="${escapeHtml(photo)}" alt="" class="search-result-thumb" loading="lazy" />` : ''}
              <span class="search-result-info">
                <span class="search-result-name">${escapeHtml(getSpotName(spot, currentLanguage))}</span>
                <span class="search-result-loc">${escapeHtml(getSpotLocation(spot, currentLanguage))} · ${escapeHtml(track?.title || '')}</span>
              </span>
              <span class="search-result-cat">${escapeHtml(getCategoryName(category, currentLanguage))}</span>
            </button>`;
        }).join('')}
      </div>
    `;

    searchDropdown.classList.add('visible');
    searchDropdown.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => selectSearchSpot(SCENIC_SPOTS.find(spot => spot.id === item.dataset.id)));
    });
  }

  let isMiniIslandDismissed = false;

  function updateMiniPlayButton(isPlaying) {
    if (!miniPlayBtn) return;
    miniPlayBtn.innerHTML = isPlaying
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
    miniPlayBtn.setAttribute('aria-pressed', String(isPlaying));
    miniPlayBtn.setAttribute('title', isPlaying ? (currentLanguage === LANGUAGES.EN ? 'Pause Playback' : '暂停播放') : (currentLanguage === LANGUAGES.EN ? 'Resume Playback' : '继续播放'));
  }

  function updateMiniAudioIsland(spot, isPlaying) {
    if (!spot || !miniIsland) {
      miniIsland?.classList.remove('visible');
      return;
    }
    const playerIsOpen = document.getElementById('immersive-player')?.classList.contains('active');
    if (!playerIsOpen && !isMiniIslandDismissed) {
      miniIsland.classList.add('visible');
      const track = getDemoTrack(spot);
      miniThumb.src = spot.photos[0];
      miniThumb.alt = getSpotName(spot, currentLanguage);
      miniName.textContent = track ? `${track.title} · ${track.creator}` : getSpotName(spot, currentLanguage);
      miniDesc.textContent = `${getSpotName(spot, currentLanguage)} · ${getSpotLocation(spot, currentLanguage)}`;
    } else {
      miniIsland.classList.remove('visible');
    }
    miniIsland.classList.toggle('paused', !isPlaying);
    updateMiniPlayButton(isPlaying);
  }

  function updateFavoriteBadge() {
    if (favCountBadge) favCountBadge.textContent = storage.getFavorites().length;
  }

  function renderFavoritesList() {
    if (!favListContainer) return;
    const favoriteSpots = storage.getFavorites()
      .map(id => SCENIC_SPOTS.find(spot => spot.id === id))
      .filter(Boolean);
    if (!favoriteSpots.length) {
      favListContainer.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          <p>${t('emptyFavorites', currentLanguage)}</p>
          <span>${t('emptyFavoritesHint', currentLanguage)}</span>
        </div>`;
      return;
    }
    favListContainer.innerHTML = favoriteSpots.map(spot => {
      const category = CATEGORY_MAP[spot.category] || { name: t('explore', currentLanguage) };
      return `
        <article class="fav-item-card" data-id="${escapeHtml(spot.id)}" tabindex="0">
          <img src="${escapeHtml(spot.photos[0])}" class="fav-thumb" alt="${escapeHtml(getSpotName(spot, currentLanguage))}" loading="lazy"/>
          <div class="fav-info">
            <span class="fav-name">${escapeHtml(getSpotName(spot, currentLanguage))}</span>
            <span class="fav-location">${escapeHtml(getSpotLocation(spot, currentLanguage))}</span>
            <span class="fav-tag">${escapeHtml(getCategoryName(category, currentLanguage))}</span>
          </div>
          <button class="fav-remove-btn" title="${escapeHtml(t('removeFavorite', currentLanguage))}" aria-label="${escapeHtml(t('removeFavorite', currentLanguage))}" data-remove="${escapeHtml(spot.id)}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </article>`;
    }).join('');
    favListContainer.querySelectorAll('.fav-item-card').forEach(card => {
      const openCard = () => {
        const spot = SCENIC_SPOTS.find(item => item.id === card.dataset.id);
        if (!spot) return;
        playerManager.openSpot(spot, true);
        toggleFavDrawer(false);
      };
      card.addEventListener('click', event => {
        if (event.target.closest('.fav-remove-btn')) return;
        openCard();
      });
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCard();
        }
      });
    });
    favListContainer.querySelectorAll('.fav-remove-btn').forEach(btn => {
      btn.addEventListener('click', event => {
        event.stopPropagation();
        storage.toggleFavorite(btn.dataset.remove);
        updateFavoriteBadge();
        renderFavoritesList();
        playerManager.updateFavoriteButton();
        showToast(t('favoriteRemoved', currentLanguage));
      });
    });
  }

  function toggleFavDrawer(open) {
    const nextState = open ?? !favDrawer?.classList.contains('open');
    if (nextState) {
      hideSpotPreviewCard();
      communityManager.close();
      toggleSettingsDrawer(false);
      toggleLeaderboardDrawer(false);
      renderFavoritesList();
    }
    favDrawer?.classList.toggle('open', nextState);
    favBackdrop?.classList.toggle('open', nextState);
    favToggleBtn?.setAttribute('aria-expanded', String(nextState));
    favDrawer?.setAttribute('aria-hidden', String(!nextState));
  }

  // ==================== Hot Leaderboard Drawer Management ====================
  function renderLeaderboard() {
    if (!leaderboardListContainer) return;
    const ranked = SCENIC_SPOTS.filter(spot => getDemoTrack(spot).url && !spot.isCommunity).slice(0, 20).map(spot => ({ spot }));

    if (!ranked.length) {
      leaderboardListContainer.innerHTML = `<div class="empty-state"><span>暂无排行榜数据</span></div>`;
      return;
    }

    leaderboardListContainer.innerHTML = ranked.map((item, index) => {
      const { spot } = item;
      const rank = index + 1;
      const rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : ''));
      const rankLabel = String(rank).padStart(2, '0');
      const spotName = getSpotName(spot, currentLanguage);
      const spotLocation = getSpotLocation(spot, currentLanguage);
      const track = getDemoTrack(spot);
      const photo = spot.photos?.[0] || '/textures/earth_dark.jpg';

      return `
        <div class="leaderboard-card ${rankClass}" data-spot-id="${escapeHtml(spot.id)}" role="button" tabindex="0">
          <div class="leaderboard-rank-badge">${rankLabel}</div>
          <img class="leaderboard-thumb" src="${escapeHtml(photo)}" alt="${escapeHtml(spotName)}" loading="lazy" />
          <div class="leaderboard-info">
            <div class="leaderboard-spot-title">${escapeHtml(spotName)}</div>
            <div class="leaderboard-track-name">${escapeHtml(track.title)} · ${escapeHtml(track.creator)}</div>
            <div class="leaderboard-meta-row">
              <span>${escapeHtml(spotLocation)}</span>
              <span class="leaderboard-likes-count">${currentLanguage === 'en' ? 'Curated' : '编辑精选'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    leaderboardListContainer.querySelectorAll('.leaderboard-card').forEach(card => {
      const openCard = () => {
        const spotId = card.dataset.spotId;
        const target = SCENIC_SPOTS.find(s => s.id === spotId);
        if (target) {
          hideSpotPreviewCard();
          toggleLeaderboardDrawer(false);
          globeManager.flyToSpot(target);
          playerManager.openSpot(target, true);
          showToast(`已切换至《${getSpotName(target, currentLanguage)}》`);
        }
      };
      card.addEventListener('click', openCard);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCard();
        }
      });
    });
  }

  function toggleLeaderboardDrawer(open) {
    const nextState = open ?? !leaderboardDrawer?.classList.contains('open');
    if (nextState) {
      hideSpotPreviewCard();
      communityManager.close();
      toggleFavDrawer(false);
      toggleSettingsDrawer(false);
      renderLeaderboard();
    }
    leaderboardDrawer?.classList.toggle('open', nextState);
    leaderboardBackdrop?.classList.toggle('open', nextState);
    leaderboardToggleBtn?.setAttribute('aria-expanded', String(nextState));
    leaderboardDrawer?.setAttribute('aria-hidden', String(!nextState));
  }

  leaderboardToggleBtn?.addEventListener('click', () => toggleLeaderboardDrawer());
  closeLeaderboardBtn?.addEventListener('click', () => toggleLeaderboardDrawer(false));
  leaderboardBackdrop?.addEventListener('click', () => toggleLeaderboardDrawer(false));

  // ==================== Settings Drawer Management ====================
  const selectAuditModeInput = document.getElementById('setting-select-auditmode');
  const moderationQueueContainer = document.getElementById('moderation-queue-container');

  function renderModerationQueue() {
    if (!moderationQueueContainer) return;
    const auditMode = storage.getPhotoAuditMode();
    if (selectAuditModeInput) selectAuditModeInput.value = auditMode;

    const allPhotos = storage.getAllCommunityPhotosList(SCENIC_SPOTS);
    if (!allPhotos.length) {
      moderationQueueContainer.innerHTML = `
        <div style="font-size: 11.5px; color: var(--text-muted); text-align: center; padding: 12px 0;">
          暂无用户共创照片
        </div>
      `;
      return;
    }

    moderationQueueContainer.innerHTML = allPhotos.map(photo => {
      const isPending = photo.status === 'pending';
      const statusText = isPending ? '<span style="color: #f59e0b;">[待审核]</span>' : '<span style="color: #10b981;">[已发布]</span>';
      return `
        <div class="moderation-item-card" data-spot-id="${escapeHtml(photo.spotId)}" data-photo-id="${escapeHtml(photo.id)}">
          <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption || '')}" class="moderation-thumb" />
          <div class="moderation-info">
            <div class="moderation-title">${escapeHtml(photo.caption || '胜景壁纸')} · 《${escapeHtml(photo.spotName)}》</div>
            <div class="moderation-meta">
              ${statusText} 摄影：${escapeHtml(photo.author || '旅行者')}
            </div>
          </div>
          <div class="moderation-actions">
            ${isPending ? `<button type="button" class="btn-moderation-approve" data-action="approve" data-spot-id="${escapeHtml(photo.spotId)}" data-photo-id="${escapeHtml(photo.id)}">通过</button>` : ''}
            <button type="button" class="btn-moderation-reject" data-action="reject" data-spot-id="${escapeHtml(photo.spotId)}" data-photo-id="${escapeHtml(photo.id)}">删除</button>
          </div>
        </div>
      `;
    }).join('');

    moderationQueueContainer.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const spotId = btn.dataset.spotId;
        const photoId = btn.dataset.photoId;
        if (action === 'approve') {
          storage.updatePhotoStatus(spotId, photoId, 'approved');
          showToast('已通过审核并发布至图集！');
        } else if (action === 'reject') {
          storage.deleteSpotPhoto(spotId, photoId);
          showToast('已移除该照片');
        }
        renderModerationQueue();
        if (playerManager?.currentSpot?.id === spotId) {
          playerManager.renderPhotos();
          playerManager.renderGalleryModal();
        }
      });
    });
  }

  function syncSettingsInputs() {
    currentSettings = storage.getSettings();
    if (selectMapSkinInput) selectMapSkinInput.value = currentMapSkin || DEFAULT_SETTINGS.mapSkin;
    if (selectPlaneSkinInput) selectPlaneSkinInput.value = currentSettings.planeSkin || '01-airliner';
    if (toggleStarsInput) toggleStarsInput.checked = Boolean(currentSettings.showStars);
    if (toggleHaloInput) toggleHaloInput.checked = Boolean(currentSettings.showHalo);
    if (toggleAutoSpinInput) toggleAutoSpinInput.checked = Boolean(currentSettings.autoSpin);
    if (toggleAutoPlayInput) toggleAutoPlayInput.checked = Boolean(currentSettings.autoPlay);
    if (selectAuditModeInput) selectAuditModeInput.value = storage.getPhotoAuditMode();
    renderModerationQueue();
  }

  selectAuditModeInput?.addEventListener('change', e => {
    storage.setPhotoAuditMode(e.target.value);
    showToast('已更新图集审核模式');
    renderModerationQueue();
  });

  function toggleSettingsDrawer(open) {
    const nextState = open ?? !settingsDrawer?.classList.contains('open');
    if (nextState) {
      hideSpotPreviewCard();
      communityManager.close();
      toggleFavDrawer(false);
      toggleLeaderboardDrawer(false);
      syncSettingsInputs();
    }
    settingsDrawer?.classList.toggle('open', nextState);
    settingsBackdrop?.classList.toggle('open', nextState);
    settingsToggleBtn?.setAttribute('aria-expanded', String(nextState));
    settingsDrawer?.setAttribute('aria-hidden', String(!nextState));
  }

  function handleSettingChange(key, value) {
    if (key === 'mapSkin') {
      applyMapSkin(value);
      storage.saveSettings({ mapSkin: value });
      showToast(t('settingsSaved', currentLanguage));
      return;
    }
    if (key === 'planeSkin') {
      applyAirplaneSkin(value);
      storage.saveSettings({ planeSkin: value });
      showToast(currentLanguage === 'en' ? 'Aircraft skin updated' : '已切换飞行器模型皮肤');
      return;
    }
    currentSettings = storage.saveSettings({ [key]: value });
    globeManager.applyMapSettings({ [key]: value });
    showToast(t('settingsSaved', currentLanguage));
  }

  selectMapSkinInput?.addEventListener('change', e => handleSettingChange('mapSkin', e.target.value));
  selectPlaneSkinInput?.addEventListener('change', e => handleSettingChange('planeSkin', e.target.value));
  toggleStarsInput?.addEventListener('change', e => handleSettingChange('showStars', e.target.checked));
  toggleHaloInput?.addEventListener('change', e => handleSettingChange('showHalo', e.target.checked));
  toggleAutoSpinInput?.addEventListener('change', e => handleSettingChange('autoSpin', e.target.checked));
  toggleAutoPlayInput?.addEventListener('change', e => handleSettingChange('autoPlay', e.target.checked));

  resetSettingsBtn?.addEventListener('click', () => {
    currentSettings = storage.resetSettings();
    applyMapSkin(DEFAULT_SETTINGS.mapSkin);
    applyAirplaneSkin('01-airliner');
    syncSettingsInputs();
    globeManager.applyMapSettings(currentSettings);
    showToast(t('settingsReset', currentLanguage));
  });

  settingsToggleBtn?.addEventListener('click', () => toggleSettingsDrawer());
  closeSettingsBtn?.addEventListener('click', () => toggleSettingsDrawer(false));
  settingsBackdrop?.addEventListener('click', () => toggleSettingsDrawer(false));

  function applyLanguage(nextLanguage = currentLanguage) {
    currentLanguage = nextLanguage;
    persistLanguage(currentLanguage);
    document.documentElement.lang = currentLanguage === LANGUAGES.EN ? 'en' : 'zh-CN';
    applyTranslations(document, currentLanguage);
    globeManager.setLanguage(currentLanguage);
    playerManager.setLanguage(currentLanguage);
    communityManager.setLanguage(currentLanguage);
    renderRegionNavigation();
    discovery.render();
    renderFavoritesList();
    if (leaderboardDrawer?.classList.contains('open')) renderLeaderboard();
    if (searchInput?.value) renderSearchResults(searchInput.value);
    if (playerManager.currentSpot) updateMiniAudioIsland(playerManager.currentSpot, soundEngine.isPlaying);
    viewModeText.textContent = viewMode === '3d' ? t('view3d', currentLanguage) : t('view2d', currentLanguage);
    if (autoTourText) {
      autoTourText.textContent = playerManager.isAutoTourActive
        ? t('touring', currentLanguage)
        : t('autoTour', currentLanguage);
    }
    if (navLanguageLabel) navLanguageLabel.textContent = currentLanguage === LANGUAGES.EN ? 'EN' : '中';
    if (playerLanguageLabel) playerLanguageLabel.textContent = currentLanguage === LANGUAGES.EN ? 'EN' : '中';
    updateFullscreenUI();
  }

  function applyMapSkin(skin) {
    currentMapSkin = skin || DEFAULT_SETTINGS.mapSkin;
    const isLightSkin = currentMapSkin === 'white-terrain' || currentMapSkin === 'light' || currentMapSkin === '02-white-terrain';
    currentTheme = isLightSkin ? 'light' : 'dark';
    
    try {
      localStorage.setItem(THEME_STORAGE_KEY, currentMapSkin);
    } catch {}
    
    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.style.colorScheme = currentTheme;
    
    if (globeManager.map && globeManager.styleReady && globeManager.mapSettings.mapSkin !== currentMapSkin) {
      globeManager.setMapSkin(currentMapSkin);
    }
    
    const isLight = currentTheme === 'light';
    
    [themeBtn, playerThemeBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('is-light', isLight);
    });

    document.querySelectorAll('.theme-option').forEach(opt => {
      const optSkin = opt.dataset.skin;
      const isActive = optSkin === currentMapSkin || 
        (optSkin === '01-dark' && (currentMapSkin === 'streets-dark' || currentMapSkin === '01-streets-dark' || currentMapSkin === 'dark' || currentMapSkin === 'rich-dark')) ||
        (optSkin === 'white-terrain' && (currentMapSkin === 'light' || currentMapSkin === '02-white-terrain')) ||
        ((optSkin === '03-fast-blue' || optSkin === '03-fast-dark') && (currentMapSkin === '03-fast-blue' || currentMapSkin === '03-fast-dark' || currentMapSkin === 'fast-dark' || currentMapSkin === 'dataviz-dark' || currentMapSkin === 'fast-blue'));
      opt.classList.toggle('active', isActive);
    });

    if (selectMapSkinInput) {
      if (isLightSkin) selectMapSkinInput.value = 'white-terrain';
      else if (currentMapSkin === '03-fast-blue' || currentMapSkin === '03-fast-dark' || currentMapSkin === 'fast-dark' || currentMapSkin === 'dataviz-dark' || currentMapSkin === 'fast-blue') selectMapSkinInput.value = '03-fast-blue';
      else selectMapSkinInput.value = '01-dark';
    }
  }

  // Initial call to set active states correctly
  applyMapSkin(currentMapSkin);

  function closeAllThemeMenus() {
    document.getElementById('theme-dropdown-menu')?.classList.remove('visible');
    document.getElementById('player-theme-dropdown-menu')?.classList.remove('visible');
    themeBtn?.setAttribute('aria-expanded', 'false');
    playerThemeBtn?.setAttribute('aria-expanded', 'false');
  }

  themeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('theme-dropdown-menu');
    const isVisible = menu?.classList.contains('visible');
    closeAllThemeMenus();
    if (!isVisible) {
      menu?.classList.add('visible');
      themeBtn.setAttribute('aria-expanded', 'true');
    }
  });

  playerThemeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('player-theme-dropdown-menu');
    const isVisible = menu?.classList.contains('visible');
    closeAllThemeMenus();
    if (!isVisible) {
      menu?.classList.add('visible');
      playerThemeBtn.setAttribute('aria-expanded', 'true');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-dropdown-wrapper')) {
      closeAllThemeMenus();
    }
  });

  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const skin = opt.dataset.skin;
      if (skin && skin !== currentMapSkin) {
        applyMapSkin(skin);
        let name = '经典深色街道 (01)';
        if (skin === 'white-terrain' || skin === 'light') {
          name = '白色立体地形 (02)';
        } else if (skin === '03-fast-blue' || skin === '03-fast-dark' || skin === 'fast-dark' || skin === 'fast-blue') {
          name = '极速深海蓝 (03)';
        }
        showToast(`已切换至 ${name}`);
      }
      closeAllThemeMenus();
    });
  });

  function toggleLanguage() {
    applyLanguage(currentLanguage === LANGUAGES.ZH ? LANGUAGES.EN : LANGUAGES.ZH);
  }

  languageBtn?.addEventListener('click', toggleLanguage);
  playerLanguageBtn?.addEventListener('click', toggleLanguage);

  toggleViewModeBtn?.addEventListener('click', () => {
    viewMode = viewMode === '3d' ? '2d' : '3d';
    globeManager.setViewMode(viewMode);
    viewModeText.textContent = viewMode === '3d' ? t('view3d', currentLanguage) : t('view2d', currentLanguage);
    toggleViewModeBtn.classList.toggle('highlight', viewMode === '3d');
    toggleViewModeBtn.setAttribute('aria-pressed', String(viewMode === '3d'));
    showToast(t(viewMode === '3d' ? 'switched3d' : 'switched2d', currentLanguage));
  });

  function exitRoamingMode() {
    if (globeManager.isRoaming) {
      globeManager.stopRoamingMode();
    }
    globeManager.hideAirplane();
    autoTourBtn?.classList.remove('primary');
    autoTourBtn?.setAttribute('aria-pressed', 'false');
    if (autoTourText) {
      autoTourText.textContent = t('autoTour', currentLanguage);
    }
  }

  document.getElementById('btn-brand-home')?.addEventListener('click', () => {
    exitRoamingMode();
    globeManager.resetView();
    showToast(t('viewReset', currentLanguage));
  });

  document.getElementById('dock-btn-wander')?.addEventListener('click', () => {
    // 漫游功能：随机跳转到一个推荐胜景点位，同时关闭巡航模式并隐藏小飞机，避免遮挡胜景视线
    const randomSpot = SCENIC_SPOTS[Math.floor(Math.random() * SCENIC_SPOTS.length)];
    if (!randomSpot) return;

    exitRoamingMode();
    globeManager.flyToSpot(randomSpot, undefined, false);
    showSpotPreviewCard(randomSpot);
    showToast(t('roamTo', currentLanguage, { name: getSpotName(randomSpot, currentLanguage) }));
  });

  autoTourBtn?.addEventListener('click', () => {
    const isRoaming = globeManager.toggleRoamingMode();
    autoTourBtn.classList.toggle('primary', isRoaming);
    autoTourBtn.setAttribute('aria-pressed', String(isRoaming));
    if (autoTourText) {
      autoTourText.textContent = isRoaming ? t('touring', currentLanguage) : t('autoTour', currentLanguage);
    }
  });

  // Clicking the airplane HUD badge can also exit cruise mode
  document.getElementById('center-flight-badge')?.addEventListener('click', (e) => {
    e.stopPropagation();
    exitRoamingMode();
  });

  document.getElementById('dock-btn-reset-view')?.addEventListener('click', () => {
    exitRoamingMode();
    globeManager.resetView();
    showToast(t('viewReset', currentLanguage));
  });

  const locateBtn = document.getElementById('dock-btn-locate-me');
  let locateStage = 0;

  function setLocateStage(stage) {
    locateStage = stage;
    if (!locateBtn) return;
    locateBtn.dataset.locateStage = String(stage);
    locateBtn.classList.toggle('active', stage > 0);
    locateBtn.classList.toggle('street-level', stage === 2);
    locateBtn.setAttribute('aria-pressed', String(stage > 0));
  }

  setLocateStage(0);

  locateBtn?.addEventListener('click', async () => {
    exitRoamingMode();

    if (locateBtn.classList.contains('loading')) return;

    // Three-step loop: locate at city level, zoom to street level, then clear.
    if (globeManager.getUserLocation() && locateStage === 1) {
      globeManager.flyToUserLocation('street');
      setLocateStage(2);
      return;
    }

    if (globeManager.getUserLocation() && locateStage === 2) {
      globeManager.clearUserLocation();
      setLocateStage(0);
      return;
    }

    locateBtn.classList.add('loading');

    try {
      const loc = await resolveUserLocation();
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        globeManager.setUserLocation({ lng: loc.lng, lat: loc.lat, accuracy: loc.accuracy });
        setLocateStage(1);
      } else {
        setLocateStage(0);
      }
    } catch (err) {
      setLocateStage(0);
      console.warn('[GeoMelody Geolocation]', err);
    } finally {
      locateBtn.classList.remove('loading');
    }
  });

  // ==================== Web / Desktop Fullscreen Controller ====================
  const headerFullscreenBtn = document.getElementById('btn-fullscreen-toggle');
  const dockFullscreenBtn = document.getElementById('dock-btn-fullscreen');
  const dockFullscreenText = document.getElementById('dock-fullscreen-text');

  function isFullscreenActive() {
    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function updateFullscreenUI() {
    const isFs = isFullscreenActive();
    const enterIcons = document.querySelectorAll('.icon-enter-fullscreen');
    const exitIcons = document.querySelectorAll('.icon-exit-fullscreen');

    enterIcons.forEach(icon => { icon.style.display = isFs ? 'none' : 'block'; });
    exitIcons.forEach(icon => { icon.style.display = isFs ? 'block' : 'none'; });

    headerFullscreenBtn?.setAttribute('aria-pressed', String(isFs));
    headerFullscreenBtn?.setAttribute('title', isFs ? t('exitFullscreenTitle', currentLanguage) : t('fullscreenTitle', currentLanguage));

    dockFullscreenBtn?.setAttribute('aria-pressed', String(isFs));
    dockFullscreenBtn?.setAttribute('title', isFs ? t('exitFullscreenTitle', currentLanguage) : t('fullscreenTitle', currentLanguage));
    dockFullscreenBtn?.classList.toggle('highlight', isFs);

    settingsFullscreenBtn?.setAttribute('aria-pressed', String(isFs));
    settingsFullscreenBtn?.setAttribute('title', isFs ? t('exitFullscreenTitle', currentLanguage) : t('fullscreenTitle', currentLanguage));
    settingsFullscreenBtn?.classList.toggle('active', isFs);

    if (dockFullscreenText) {
      dockFullscreenText.textContent = isFs ? t('exitFullscreen', currentLanguage) : t('fullscreen', currentLanguage);
    }
    if (settingsFullscreenText) {
      settingsFullscreenText.textContent = isFs ? t('exitFullscreen', currentLanguage) : t('fullscreen', currentLanguage);
    }
  }

  function toggleFullscreen() {
    if (!isFullscreenActive()) {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  headerFullscreenBtn?.addEventListener('click', toggleFullscreen);
  dockFullscreenBtn?.addEventListener('click', toggleFullscreen);
  settingsFullscreenBtn?.addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
  document.addEventListener('mozfullscreenchange', updateFullscreenUI);
  document.addEventListener('MSFullscreenChange', updateFullscreenUI);

  searchInput?.addEventListener('input', event => renderSearchResults(event.target.value));
  searchInput?.addEventListener('focus', () => renderSearchResults(searchInput.value));
  searchInput?.addEventListener('click', () => renderSearchResults(searchInput.value));
  searchInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      selectSearchSpot(getMatches(searchInput.value)[0]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      searchDropdown?.classList.remove('visible');
      searchInput.blur();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.search-box-wrapper')) searchDropdown?.classList.remove('visible');
  });

  document.getElementById('player-play-btn')?.addEventListener('click', () => playerManager.togglePlay());
  document.getElementById('player-btn-next')?.addEventListener('click', () => playerManager.nextSpot());
  document.getElementById('player-btn-prev')?.addEventListener('click', () => playerManager.prevSpot());
  document.getElementById('player-close-btn')?.addEventListener('click', () => playerManager.close());
  document.getElementById('player-fav-btn')?.addEventListener('click', () => {
    playerManager.toggleFavorite();
    updateFavoriteBadge();
  });
  document.getElementById('player-share-btn')?.addEventListener('click', () => playerManager.shareCurrentSpot());
  document.getElementById('player-zen-btn')?.addEventListener('click', () => playerManager.toggleZenMode());
  document.getElementById('player-fullscreen-btn')?.addEventListener('click', () => playerManager.toggleFullscreen());
  document.getElementById('player-btn-open-mixer')?.addEventListener('click', () => toggleMixerDrawer(true));

  const volumeSlider = document.getElementById('player-volume-slider');
  const muteBtn = document.getElementById('player-btn-mute');
  volumeSlider?.addEventListener('input', event => soundEngine.setMasterVolume(parseFloat(event.target.value)));
  muteBtn?.addEventListener('click', () => {
    const isMuted = soundEngine.toggleMute();
    muteBtn.classList.toggle('active', isMuted);
    muteBtn.setAttribute('aria-pressed', String(isMuted));
    showToast(t(isMuted ? 'muted' : 'unmuted', currentLanguage));
  });
  document.addEventListener('fullscreenchange', () => {
    const fullscreenBtn = document.getElementById('player-fullscreen-btn');
    const isFullscreen = Boolean(document.fullscreenElement);
    fullscreenBtn?.classList.toggle('active', isFullscreen);
    fullscreenBtn?.setAttribute('aria-pressed', String(isFullscreen));
  });

  miniIsland?.addEventListener('click', event => {
    if (event.target.closest('#mini-close-btn')) {
      event.stopPropagation();
      isMiniIslandDismissed = true;
      soundEngine.pause();
      miniIsland.classList.remove('visible');
      return;
    }
    if (event.target.closest('#mini-play-toggle-btn')) {
      event.stopPropagation();
      isMiniIslandDismissed = false;
      playerManager.togglePlay();
      return;
    }
    if (playerManager.currentSpot) {
      isMiniIslandDismissed = false;
      playerManager.openSpot(playerManager.currentSpot, soundEngine.isPlaying);
    }
  });

  document.getElementById('mini-expand-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    if (playerManager.currentSpot) {
      isMiniIslandDismissed = false;
      playerManager.openSpot(playerManager.currentSpot, soundEngine.isPlaying);
    }
  });

  document.getElementById('mini-close-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    isMiniIslandDismissed = true;
    soundEngine.pause();
    miniIsland?.classList.remove('visible');
  });
  soundEngine.subscribe((event, data) => {
    if (event === 'playbackError') {
      const en = currentLanguage === 'en';
      showToast(data.reason === 'missing'
        ? (en ? 'Music is not available for this place yet. Try a featured soundscape.' : '这里的音乐尚未收录，先听一首精选音景吧。')
        : data.reason === 'blocked'
          ? (en ? 'Tap Play to start listening.' : '请点击播放按钮开始收听。')
          : (en ? 'Unable to load audio. Tap Play to retry or choose another place.' : '音乐加载失败，点击播放重试，或换一处风景。'));
    }
    if (event === 'playStateChange') {
      if (data.isPlaying && data.spot) {
        storage.addRecentSpot(data.spot.id);
        discovery.render();
      }
      playerManager.updatePlayButton(data.isPlaying);
      updateMiniAudioIsland(data.spot, data.isPlaying);
    }
  });

  favToggleBtn?.addEventListener('click', () => toggleFavDrawer());
  document.getElementById('btn-close-fav-drawer')?.addEventListener('click', () => toggleFavDrawer(false));
  favBackdrop?.addEventListener('click', () => toggleFavDrawer(false));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (leaderboardDrawer?.classList.contains('open')) {
      toggleLeaderboardDrawer(false);
    } else if (settingsDrawer?.classList.contains('open')) {
      event.stopPropagation();
      toggleSettingsDrawer(false);
    } else if (document.getElementById('community-drawer')?.classList.contains('open')) {
      event.stopPropagation();
      communityManager.close();
    } else if (favDrawer?.classList.contains('open')) {
      event.stopPropagation();
      toggleFavDrawer(false);
    }
  });

  updateFavoriteBadge();
  syncSettingsInputs();
  applyAirplaneSkin(currentSettings.planeSkin || '01-airliner');
  applyLanguage();
  globeInitPromise.then(() => {
    globeManager.flyToRegion(MAP_REGIONS.find(region => region.id === activeRegion));
  });

  const initialSpot = SCENIC_SPOTS.find(spot => spot.id === shareUtil.getInitialSpotId());
  if (initialSpot) {
    globeInitPromise.then(() => {
      setTimeout(() => {
        globeManager.flyToSpot(initialSpot, 7.5);
        showSpotPreviewCard(initialSpot);
        const name = getSpotName(initialSpot, currentLanguage);
        showToast(currentLanguage === 'en' ? `Arrived at “${name}” · Tap to enter` : `已定位至「${name}」· 点击即可进入视听`);
      }, 600);
    });
  }
});
