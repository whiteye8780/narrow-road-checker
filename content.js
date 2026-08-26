// Google Maps 完全同期デザインのUIパネル ＆ 最小化トグル機能

// 1. メインパネルのDOM生成
const panel = document.createElement('div');
panel.id = 'road-checker-panel';
panel.innerHTML = `
  <div class="panel-header">
    <div class="panel-title-wrap">
      <svg class="panel-icon" viewBox="0 0 24 24" width="18" height="18" fill="#5f6368">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
      <span class="panel-title">生活道路チェッカー</span>
    </div>
    <div class="panel-actions">
      <span class="panel-badge">2026年9月施行</span>
      <button id="minimize-panel-btn" class="icon-action-btn" title="パネルを最小化">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="#5f6368">
          <path d="M19 13H5v-2h14v2z"/>
        </svg>
      </button>
    </div>
  </div>

  <div id="road-status" class="status-box status-idle">
    <div class="status-line">
      <span class="status-dot"></span>
      <span class="status-text">マップ上で [R] キー または 測定ボタンを押してください</span>
    </div>
  </div>

  <div id="road-detail" class="detail-list">
    <div class="detail-item">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="#70757a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      <span class="detail-text-single">中央線のない道路（5.5m未満）は法定速度30km/h</span>
    </div>
  </div>

  <div class="panel-footer">
    <button id="check-center-btn" class="google-btn">
      <svg class="btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
      </svg>
      <span id="btn-label">現在地（画面中心）を判定</span>
    </button>
  </div>
`;
document.body.appendChild(panel);

// 2. 最小化時のフローティングボタン生成
const miniBtn = document.createElement('button');
miniBtn.id = 'road-checker-mini-btn';
miniBtn.title = '生活道路チェッカーを展開';
miniBtn.innerHTML = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="#1a73e8">
    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
  </svg>
  <span>生活道路 [R]</span>
`;
document.body.appendChild(miniBtn);

// 最小化 / 展開の切り替え
function setMinimized(isMin) {
  if (isMin) {
    panel.classList.add('minimized');
    miniBtn.classList.add('visible');
    localStorage.setItem('road_checker_minimized', 'true');
  } else {
    panel.classList.remove('minimized');
    miniBtn.classList.remove('visible');
    localStorage.setItem('road_checker_minimized', 'false');
  }
}

// 初期状態の復元
if (localStorage.getItem('road_checker_minimized') === 'true') {
  setMinimized(true);
}

// イベントリスナー設定
const minimizeBtn = document.getElementById('minimize-panel-btn');
if (minimizeBtn) {
  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMinimized(true);
  });
}

miniBtn.addEventListener('click', () => {
  setMinimized(false);
});

const checkCenterBtn = document.getElementById('check-center-btn');
const btnLabel = document.getElementById('btn-label');

if (checkCenterBtn) {
  checkCenterBtn.addEventListener('click', () => {
    triggerCheck();
  });
}

// GoogleマップのURLやDOMから緯度・経度を抽出
function getCoordsFromUrl() {
  const url = location.href;

  const matchAt = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (matchAt) {
    return {
      lat: parseFloat(matchAt[1]),
      lng: parseFloat(matchAt[2])
    };
  }

  const matchData = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (matchData) {
    return {
      lat: parseFloat(matchData[1]),
      lng: parseFloat(matchData[2])
    };
  }

  const matchParams = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (matchParams) {
    return {
      lat: parseFloat(matchParams[1]),
      lng: parseFloat(matchParams[2])
    };
  }

  return null;
}

// ボタンの状態制御（グレーアウト）
function setButtonLoading(isLoading) {
  if (!checkCenterBtn) return;
  checkCenterBtn.disabled = isLoading;
  if (btnLabel) {
    btnLabel.innerText = isLoading ? '照会中...' : '現在地（画面中心）を判定';
  }
}

// 判定実行のトリガー
function triggerCheck() {
  // 最小化中なら展開する
  setMinimized(false);

  if (checkCenterBtn && checkCenterBtn.disabled) return;

  const coords = getCoordsFromUrl();
  if (coords) {
    evaluateRoad(coords.lat, coords.lng);
  } else {
    showError('Googleマップの座標を取得できませんでした');
  }
}

// エラー・未検出表示ヘルパー
function showError(message) {
  setButtonLoading(false);
  const statusBox = document.getElementById('road-status');
  const detailList = document.getElementById('road-detail');
  if (statusBox) {
    statusBox.className = 'status-box status-unknown';
    statusBox.innerHTML = `
      <div class="status-line">
        <span class="status-dot"></span>
        <span class="status-text">道路データ未検出</span>
      </div>
    `;
  }
  if (detailList) {
    detailList.innerHTML = `
      <div class="detail-item">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#70757a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span class="detail-text-single">${message}</span>
      </div>
    `;
  }
}

// 道路判定実行関数
function evaluateRoad(lat, lng) {
  setButtonLoading(true);

  const statusBox = document.getElementById('road-status');
  const detailList = document.getElementById('road-detail');

  statusBox.className = 'status-box status-loading';
  statusBox.innerHTML = `
    <div class="status-line">
      <span class="status-dot"></span>
      <span class="status-text">高速照会中... (${lat.toFixed(4)}, ${lng.toFixed(4)})</span>
    </div>
  `;
  detailList.innerHTML = `
    <div class="detail-item">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="#70757a"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      <span class="detail-text-single">解析座標: 緯度 ${lat.toFixed(5)}, 経度 ${lng.toFixed(5)}</span>
    </div>
  `;

  chrome.runtime.sendMessage(
    { action: 'checkRoadWidth', lat, lng },
    (response) => {
      setButtonLoading(false);

      if (chrome.runtime.lastError) {
        showError(`通信エラー: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!response || !response.found) {
        statusBox.className = 'status-box status-unknown';
        statusBox.innerHTML = `
          <div class="status-line">
            <span class="status-dot"></span>
            <span class="status-text">道路データが見つかりません</span>
          </div>
        `;
        const reason = (response && response.error) ? response.error : '半径90m以内に該当する公道データがありません';
        detailList.innerHTML = `
          <div class="detail-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#70757a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            <span class="detail-text-single">${reason}</span>
          </div>
        `;
        return;
      }

      const roadName = response.roadName ? response.roadName : '道路名なし（生活道路）';
      const detailInfo = (response.detail || '').replace(/\n/g, ' / ');

      if (response.isNarrow) {
        statusBox.className = 'status-box status-alert';
        statusBox.innerHTML = `
          <div class="status-line">
            <span class="status-dot"></span>
            <span class="status-text">⚠️ 30km/h 制限対象（5.5m未満 / 生活道路）</span>
          </div>
        `;
        detailList.innerHTML = `
          <div class="detail-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#1a73e8"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
            <span class="detail-text-single">${roadName}</span>
          </div>
          <div class="detail-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#d93025"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            <span class="detail-text-single">${detailInfo}</span>
          </div>
        `;
      } else {
        statusBox.className = 'status-box status-safe';
        statusBox.innerHTML = `
          <div class="status-line">
            <span class="status-dot"></span>
            <span class="status-text">🔵 通常道路（幹線道路 / 5.5m以上）</span>
          </div>
        `;
        detailList.innerHTML = `
          <div class="detail-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#1a73e8"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
            <span class="detail-text-single">${roadName}</span>
          </div>
          <div class="detail-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#1e8e3e"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
            <span class="detail-text-single">${detailInfo}</span>
          </div>
        `;
      }
    }
  );
}

// マップ右クリックイベントの検知
document.addEventListener('contextmenu', () => {
  setTimeout(() => {
    triggerCheck();
  }, 400);
});

// ショートカットキー: 「R」キーで画面中心の道路をチェック（自動展開）
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'r' || e.key === 'R') {
    triggerCheck();
  }
});
