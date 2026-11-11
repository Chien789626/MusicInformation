function applyMarqueeSettings(config) {
  const settings = config.marquee || {};

  // config.json の時間設定は「秒」単位
  const totalSeconds = Number(settings.totalDuration) > 0
    ? Number(settings.totalDuration)
    : 15;
  const waitSeconds = Number(settings.waitDuration) >= 0
    ? Number(settings.waitDuration)
    : 5;
  const scrollSeconds = Number(settings.scrollDuration) > 0
    ? Number(settings.scrollDuration)
    : totalSeconds - waitSeconds;

  // CSSアニメーション用にミリ秒へ変換
  const totalDuration = totalSeconds * 1000;
  const waitDuration = waitSeconds * 1000;
  const scrollDuration = scrollSeconds * 1000;

  if (Math.abs(waitDuration + scrollDuration - totalDuration) > 0.001) {
    console.warn(
      'marquee: totalDuration は waitDuration + scrollDuration と一致させてください'
    );
  }

  // 待機時間の割合から、スクロール開始位置を算出
  const waitPercent = Math.min(
    100,
    Math.max(0, (waitDuration / totalDuration) * 100)
  );

  let keyframes = document.getElementById('marquee-keyframes');
  if (!keyframes) {
    keyframes = document.createElement('style');
    keyframes.id = 'marquee-keyframes';
    document.head.appendChild(keyframes);
  }

  keyframes.textContent = `
    @keyframes marquee {
      0%, ${waitPercent}% {
        transform: translateX(0);
      }
      100% {
        transform: translateX(-50%);
      }
    }
  `;

  document.documentElement.style.setProperty(
    '--marquee-total-duration',
    `${totalDuration}ms`
  );
}

function applyDebugSettings(config) {
  // true / false の真偽値と "True" / "False" などの文字列に対応
  const debugValue = String(config.debug).trim().toLowerCase();
  const isDebugEnabled = debugValue === 'true';

  document.body.classList.toggle('debug-mode', isDebugEnabled);
}

function setMarquee(element, text) {
  const value = text.trim() || '';

  // 内容が同じならアニメーションをリセットしない
  if (element.dataset.currentText === value) return;
  element.dataset.currentText = value;

  const track = document.createElement('div');
  track.className = 'marquee-track';

  const first = document.createElement('span');
  first.textContent = value;

  track.appendChild(first);
  element.replaceChildren(track);

  const range = document.createRange();
  range.selectNodeContents(first);

  // 文字そのものの幅を取得（paddingを含めない）
  const textWidth = range.getBoundingClientRect().width;

  // 表示領域の幅を取得
  const containerWidth = element.clientWidth;

  // わずかな小数点誤差を考慮して判定
  if (textWidth > containerWidth + 2) {
    const second = document.createElement('span');
    second.textContent = value;
    second.setAttribute('aria-hidden', 'true');
    track.appendChild(second);

    track.style.animation = '';
  } else {
    // 短いテキストはアニメーションしない
    track.style.animation = 'none';
    track.style.transform = 'translateX(0)';
  }
}

async function loadFonts(config) {
  for (const key of ['title', 'artistAlbum']) {
    const settings = config[key];
    if (!settings) continue;

    if (!settings.fontFile || !settings.fontFile.trim()) {
      continue;
    }

    if (!settings.font || !settings.font.trim()) {
      console.warn(`${key}: フォント名が未指定です`);
      continue;
    }

    try {
      const weight = settings.fontWeight?.trim() || '400';
      const face = new FontFace(
        settings.font,
        `url("${settings.fontFile}")`,
        { weight }
      );

      await face.load();
      document.fonts.add(face);
    } catch (error) {
      console.error(`${key}: フォント読み込み失敗`, error);
    }
  }

  // フォントの読み込み完了を待つ
  await document.fonts.ready;
}

async function loadConfig() {
  let config;

  // local設定 → 通常設定の順番で読み込む
  for (const path of ['./config.local.json', './config.json']) {
    try {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      config = await response.json();
      console.log(`設定ファイル読み込み成功: ${path}`);
      break;
    } catch (error) {
      console.warn(`${path} の読み込みに失敗しました:`, error);
    }
  }

  if (!config) {
    throw new Error('設定ファイルを読み込めませんでした');
  }

  // マーキーとデバッグ設定を適用
  applyMarqueeSettings(config);
  applyDebugSettings(config);

  // title / artistAlbum のCSS設定を適用
  for (const key of ['title', 'artistAlbum']) {
    const settings = config[key];
    const element = document.getElementById(key);

    if (!settings || !element) continue;

    if (Number.isFinite(settings.width) && settings.width > 0) {
      element.style.width = `${settings.width}px`;
    }

    if (settings.font) {
      element.style.fontFamily = `"${settings.font}", sans-serif`;
    }

    if (settings.fontWeight) {
      element.style.fontWeight = settings.fontWeight;
    }

    if (settings.fontsize) {
      element.style.fontSize = `${settings.fontsize}px`;
    }

    if (settings.color) {
      element.style.color = settings.color;
    }

    if (settings.paddingLeft !== undefined) {
      element.style.paddingLeft =
        typeof settings.paddingLeft === 'number'
          ? `${settings.paddingLeft}px`
          : settings.paddingLeft;
    }
  }

  return config;
}

async function loadTextFile(config) {
  try {
    const Title = document.getElementById('title');
    const ArtistAlbum = document.getElementById('artistAlbum');

    // title.txt の読み込み
    const res = await fetch(config.title.file);
    if (!res.ok) {
      throw new Error(`titleファイルの取得に失敗: ${res.status}`);
    }

    const titleTxt = await res.text();

    // Artist_Album.txt の読み込み
    const res1 = await fetch(config.artistAlbum.file);
    if (!res1.ok) {
      throw new Error(`artistAlbumファイルの取得に失敗: ${res1.status}`);
    }

    const artistAlbumTxt = await res1.text();

    // HTMLに反映
    setMarquee(Title, titleTxt);
    setMarquee(ArtistAlbum, artistAlbumTxt);
  } catch (error) {
    console.error('テキストファイル読み込みエラー:', error);
  }
}

async function initialize() {
  const config = await loadConfig();

  // フォント読込
  await loadFonts(config);

  // テキスト読込
  await loadTextFile(config);

  // 1秒ごと（1000ミリ秒）に自動更新
  setInterval(() => {
    loadTextFile(config);
  }, 1000);
}

// 初期化
initialize();
