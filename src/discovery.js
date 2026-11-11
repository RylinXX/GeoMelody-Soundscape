import { getDemoTrack } from './data/demoTracks.js';
import { getSpotName, getSpotLocation } from './utils/i18n.js';
import { storage } from './utils/storage.js';
import './styles/discovery.css';

// Discovery stays independent of map readiness and external tile services.
export function initDiscovery({ spots, getLanguage, onPlay }) {
  const panel = document.createElement('section');
  panel.className = 'discovery-panel';
  panel.setAttribute('aria-label', '发现音景');
  document.getElementById('app').appendChild(panel);
  let collapsed = false;
  let selected = 'all';
  const themes = [
    ['all', '精选', 'Featured', null],
    ['town', '烟雨古镇', 'Water towns', ['wuzhen', 'zhouzhuang', 'hongcun']],
    ['mountain', '山野放空', 'Mountains', ['meili', 'yulong', 'everest']],
    ['sea', '海岛假日', 'Islands', ['sanya', 'maldives', 'santorini']]
  ];
  const featured = ['wuzhen', 'meili', 'santorini'];
  function button(label, action, className = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.className = className;
    el.addEventListener('click', action);
    return el;
  }
  function render() {
    const lang = getLanguage();
    const en = lang === 'en';
    panel.replaceChildren();
    panel.classList.toggle('is-collapsed', collapsed);
    const heading = document.createElement('div');
    heading.className = 'discovery-heading';
    const title = document.createElement('h1');
    title.textContent = en ? 'Let a place set the mood' : '让一个地方，陪你片刻';
    const toggle = button(collapsed ? (en ? 'Discover' : '展开选曲') : (en ? 'Collapse' : '收起'), () => { collapsed = !collapsed; render(); });
    toggle.setAttribute('aria-expanded', String(!collapsed));
    heading.append(title, toggle);
    panel.append(heading);
    if (collapsed) return;
    const intro = document.createElement('p');
    intro.textContent = en ? 'Choose a landscape. Listen to music inspired by it.' : '选一处风景，听一段由它启发的 AI 音乐。';
    panel.append(intro);
    const tabs = document.createElement('div');
    tabs.className = 'discovery-themes';
    themes.forEach(([id, zh, english]) => {
      const tab = button(en ? english : zh, () => { selected = id; render(); });
      tab.setAttribute('aria-pressed', String(selected === id));
      tabs.append(tab);
    });
    panel.append(tabs);
    const ids = themes.find(theme => theme[0] === selected)[3] || featured;
    const list = document.createElement('div');
    list.className = 'discovery-list';
    ids.map(id => spots.find(spot => spot.id === id)).filter(spot => spot && getDemoTrack(spot).url).forEach(spot => {
      const card = button('', () => onPlay(spot), 'discovery-card');
      const img = document.createElement('img');
      img.src = spot.photos?.[0] || '';
      img.alt = '';
      const text = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = getSpotName(spot, lang);
      const location = document.createElement('small');
      location.textContent = getSpotLocation(spot, lang);
      text.append(name, location);
      const play = document.createElement('span');
      play.className = 'discovery-play';
      play.textContent = en ? 'Play ↗' : '收听 ↗';
      card.append(img, text, play);
      list.append(card);
    });
    panel.append(list);
    const recent = storage.getRecentSpots().map(id => spots.find(spot => spot.id === id)).find(spot => spot && getDemoTrack(spot).url);
    if (recent) panel.append(button(`${en ? 'Listen again' : '再次收听'} · ${getSpotName(recent, lang)}`, () => onPlay(recent), 'discovery-recent'));
    const note = document.createElement('small');
    note.className = 'discovery-note';
    note.textContent = en ? 'AI music · Illustrative scenery · Not live recordings' : 'AI 创作音乐 · 风景图为氛围示意 · 非实时实地录音';
    panel.append(note);
  }
  render();
  return { render };
}
