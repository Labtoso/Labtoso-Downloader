const body = document.body;
const spotifyInput = document.getElementById('spotifyInput');
const statusMessage = document.getElementById('statusMessage');
const downloadForm = document.getElementById('downloadForm');
const glowDot = document.querySelector('.glow-dot');
const formatButton = document.getElementById('formatButton');
const formatOptions = document.getElementById('formatOptions');
const formatValue = document.getElementById('formatValue');
const formatValueInput = document.getElementById('formatValueInput');
const trackPreview = document.getElementById('trackPreview');
const trackCover = document.getElementById('trackCover');
const trackMetaTitle = document.getElementById('trackMetaTitle');
const trackMetaSubtitle = document.getElementById('trackMetaSubtitle');
const platformIcons = document.querySelectorAll('.platform-icon');

let dotTarget = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let dotCurrent = { x: dotTarget.x, y: dotTarget.y };
let cachedMetadata = null;
let cachedMetadataLink = '';

const parseSpotifyLink = (link) => {
  try {
    const url = new URL(link.trim());
    if (!url.hostname.includes('spotify.com')) {
      return null;
    }
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return null;
    }
    let type = pathParts[0];
    let id = pathParts[1].split('?')[0];

    if (type.startsWith('intl-') || type.length === 2) {
      if (pathParts.length < 3) {
        return null;
      }
      type = pathParts[1];
      id = pathParts[2].split('?')[0];
    }

    if (!['track', 'playlist', 'album', 'artist'].includes(type)) {
      return null;
    }
    return { type, id, source: 'Spotify' };
  } catch {
    return null;
  }
};

const updateStatus = (message, isError = false) => {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#ffb3a6' : 'var(--text)';
};

const detectPlatformFromLink = (link) => {
  const normalized = link.toLowerCase();
  if (normalized.includes('spotify')) return 'spotify';
  if (normalized.includes('amazon')) return 'amazon';
  if (normalized.includes('music.apple') || normalized.includes('apple.com')) return 'apple_music';
  if (normalized.includes('youtube') || normalized.includes('youtu.be')) return 'youtube_music';
  return null;
};

const setPlatformIcons = (platform) => {
  platformIcons.forEach((icon) => {
    if (!platform) {
      icon.classList.remove('active');
      return;
    }
    icon.classList.toggle('active', icon.dataset.platform === platform);
  });
};

const showEmptyPreview = () => {
  trackMetaTitle.textContent = 'Kein Link eingefügt';
  trackMetaSubtitle.textContent = 'Füge oben einen Spotify-Share-Link ein, um das Cover zu sehen.';
  trackCover.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"%3E%3C/svg%3E';
  trackCover.alt = '';
  trackCover.classList.add('empty');
  trackPreview.classList.remove('hidden', 'loaded', 'scanning');
  trackPreview.classList.add('empty');
  setPlatformIcons(null);
};

const setTrackPreview = (metadata, platform) => {
  if (!metadata) {
    showEmptyPreview();
    return;
  }

  trackMetaTitle.textContent = metadata.title;
  trackMetaSubtitle.textContent = metadata.author_name ? `Künstler: ${metadata.author_name}` : 'Künstler nicht verfügbar';
  trackCover.src = metadata.thumbnail_url;
  trackCover.alt = `${metadata.title} Cover`;
  trackCover.classList.remove('empty');
  trackPreview.classList.remove('hidden', 'empty', 'scanning');
  trackPreview.classList.add('loaded');
  document.querySelector('.platform-blob')?.classList.remove('scanning');
  setPlatformIcons(platform);
};

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

const getSpotifyMetadata = async (link) => {
  if (cachedMetadataLink === link && cachedMetadata) {
    return cachedMetadata;
  }

  try {
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(link)}`);
    if (!response.ok) {
      throw new Error('Spotify metadata konnte nicht geladen werden.');
    }
    const data = await response.json();
    cachedMetadataLink = link;
    cachedMetadata = data;
    return data;
  } catch {
    return null;
  }
};

const blobToDataUrl = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.readAsDataURL(blob);
});

const triggerDemoDownload = async (fileName, link, format, metadata) => {
  let coverData = 'Kein Cover verfügbar.';

  if (metadata?.thumbnail_url) {
    try {
      const coverResponse = await fetch(metadata.thumbnail_url);
      const coverBlob = await coverResponse.blob();
      coverData = await blobToDataUrl(coverBlob);
    } catch {
      coverData = metadata.thumbnail_url;
    }
  }

  const content = `Titel: ${metadata?.title || 'Spotify-Audio'}\n`
    + `Künstler: ${metadata?.author_name || 'Spotify'}\n`
    + `Format: ${format.toUpperCase()}\n`
    + `Spotify Link: ${link}\n\n`
    + `Cover Bild: ${metadata?.thumbnail_url || 'Nicht verfügbar'}\n\n`
    + `Cover als Base64 (Demo):\n${coverData}`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const loadMetadataPreview = async (link, platform) => {
  const metadata = await getSpotifyMetadata(link);
  setTrackPreview(metadata, platform);
  return metadata;
};

const handleLinkInput = debounce(async () => {
  const link = spotifyInput.value.trim();
  if (!link) {
    showEmptyPreview();
    updateStatus('Kein Link eingefügt. Füge oben einen Spotify-Share-Link ein.');
    return;
  }

  const parsed = parseSpotifyLink(link);
  if (!parsed) {
    showEmptyPreview();
    updateStatus('Ungültiger Spotify-Link. Bitte prüfe den Link.', true);
    return;
  }

  const platform = detectPlatformFromLink(link);
  trackPreview.classList.remove('hidden', 'loaded', 'empty');
  trackPreview.classList.add('scanning');
  setPlatformIcons(null);
  updateStatus('Scan läuft... Lade Metadaten...', false);
  const metadata = await loadMetadataPreview(link, platform);
  if (metadata) {
    updateStatus('Cover und Titel geladen. Klicke auf Herunterladen.', false);
  } else {
    updateStatus('Metadaten konnten nicht geladen werden. Du kannst es trotzdem versuchen.', true);
  }
}, 500);

downloadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const link = spotifyInput.value;
  const parsed = parseSpotifyLink(link);
  const format = formatValueInput.value;

  if (!parsed) {
    updateStatus('Ungültiger Spotify-Link. Bitte einen Track- oder Playlist-Link aus Spotify teilen.', true);
    setTrackPreview(null);
    return;
  }

  const platform = detectPlatformFromLink(link);
  const metadata = await loadMetadataPreview(link, platform);
  const label = parsed.type === 'playlist' ? 'Playlist' : 'Track';
  const safeTitle = metadata?.title ? metadata.title.replace(/[^a-z0-9._-]/gi, '_').toLowerCase() : `${parsed.type}-${parsed.id}`;
  const fileName = `${safeTitle}.${format}`;
  updateStatus(`Download gestartet für ${label} als ${format.toUpperCase()}.`);
  await triggerDemoDownload(fileName, link, format, metadata);
});

spotifyInput.addEventListener('input', handleLinkInput);
handleLinkInput();

formatButton.addEventListener('click', () => {
  const open = formatOptions.classList.toggle('open');
  formatButton.setAttribute('aria-expanded', open ? 'true' : 'false');
});

formatOptions.addEventListener('click', (event) => {
  const option = event.target.closest('[data-value]');
  if (!option || option.dataset.disabled === 'true') return;
  const value = option.dataset.value;
  const label = option.textContent.trim();
  formatValue.textContent = label;
  formatValueInput.value = value;
  formatOptions.querySelectorAll('li').forEach((item) => {
    item.classList.toggle('selected', item.dataset.value === value);
    item.setAttribute('aria-selected', item.dataset.value === value ? 'true' : 'false');
  });
  formatOptions.classList.remove('open');
  formatButton.setAttribute('aria-expanded', 'false');
});

document.addEventListener('click', (event) => {
  if (!formatOptions.contains(event.target) && !formatButton.contains(event.target)) {
    formatOptions.classList.remove('open');
    formatButton.setAttribute('aria-expanded', 'false');
  }
});

window.addEventListener('mousemove', (event) => {
  dotTarget = { x: event.clientX, y: event.clientY };
});

const animateDot = () => {
  dotCurrent.x += (dotTarget.x - dotCurrent.x) * 0.12;
  dotCurrent.y += (dotTarget.y - dotCurrent.y) * 0.12;
  glowDot.style.left = `${dotCurrent.x}px`;
  glowDot.style.top = `${dotCurrent.y}px`;
  requestAnimationFrame(animateDot);
};

window.addEventListener('resize', () => {
  dotTarget = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  dotCurrent = { ...dotTarget };
});

requestAnimationFrame(animateDot);
