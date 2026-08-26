// OSM公式APIおよびOverpass APIを利用した超高速・高精度道路判定

// 判定結果のインメモリキャッシュ（キー: 緯度経度_小数点4桁、TTL: 60秒）
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

// 緯度・経度から指定半径(m)のBounding Boxを計算
function getBoundingBox(lat, lng, radiusMeters = 90) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    minLng: (lng - lngDelta).toFixed(6),
    minLat: (lat - latDelta).toFixed(6),
    maxLng: (lng + lngDelta).toFixed(6),
    maxLat: (lat + latDelta).toFixed(6)
  };
}

// 点Pから線分ABへの最短距離（メートル）を計算
function distanceToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const px = (pLng - aLng) * cosLat * 111320;
  const py = (pLat - aLat) * 111320;
  const bx = (bLng - aLng) * cosLat * 111320;
  const by = (bLat - aLat) * 111320;

  const segLenSq = bx * bx + by * by;
  if (segLenSq === 0) {
    return Math.sqrt(px * px + py * py);
  }

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
  const projX = t * bx;
  const projY = t * by;

  const dx = px - projX;
  const dy = py - projY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ポリライン（頂点配列）に対する現在地の最短距離を計算
function distanceToPolyline(lat, lng, coords) {
  if (!coords || coords.length === 0) return 999999;
  if (coords.length === 1) {
    const dLat = (lat - coords[0].lat) * 111320;
    const dLng = (lng - coords[0].lon) * Math.cos((lat * Math.PI) / 180) * 111320;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  let minDistance = 999999;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const d = distanceToSegment(lat, lng, a.lat, a.lon, b.lat, b.lon);
    if (d < minDistance) {
      minDistance = d;
    }
  }
  return minDistance;
}

// 道路種別の日本語名
const HIGHWAY_NAMES = {
  motorway: '高速道路',
  trunk: '幹線国道・バイパス',
  primary: '主要幹線道路（国道等）',
  secondary: '主要地方道（県道等）',
  tertiary: '一般県道・市道幹線',
  unclassified: '一般市町村道',
  residential: '住宅街路（生活道路）',
  living_street: '歩車共存・生活道路',
  service: '敷地内・引き込み道路',
  track: '農道・林道・管理道路'
};

// 1. OSM公式 API からの高速データ取得
async function fetchFromOsmApi(lat, lng, signal) {
  const bbox = getBoundingBox(lat, lng, 90);
  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSM API HTTP ${res.status}`);

  const data = await res.json();
  const elements = data.elements || [];

  const nodeMap = {};
  for (const el of elements) {
    if (el.type === 'node') {
      nodeMap[el.id] = { lat: el.lat, lon: el.lon };
    }
  }

  const ways = [];
  for (const el of elements) {
    if (el.type === 'way' && el.tags && el.tags.highway && el.nodes) {
      const geom = el.nodes.map((id) => nodeMap[id]).filter(Boolean);
      if (geom.length > 0) {
        el.distance = distanceToPolyline(lat, lng, geom);
        ways.push(el);
      }
    }
  }
  return ways;
}

// 2. Overpass API 本家からの高速取得
async function fetchFromOverpassGeom(lat, lng, signal) {
  const endpoint = 'https://overpass-api.de/api/interpreter';
  const query = `[out:json][timeout:5];way(around:90,${lat},${lng})["highway"];out tags geom;`;
  const url = `${endpoint}?data=${encodeURIComponent(query)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Overpass API HTTP ${res.status}`);

  const data = await res.json();
  const elements = data.elements || [];
  const validWays = [];

  for (const el of elements) {
    if (el.type === 'way' && el.geometry) {
      el.distance = distanceToPolyline(lat, lng, el.geometry);
      validWays.push(el);
    }
  }
  return validWays;
}

// 最速レスポンスを採用する並行レース（Fastest-Wins）
async function fetchFastestRoadData(lat, lng) {
  const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒全体タイムアウト

  try {
    // OSM公式APIとOverpass APIを同時にリクエストし、早い方を採用
    const ways = await Promise.any([
      fetchFromOsmApi(lat, lng, controller.signal),
      fetchFromOverpassGeom(lat, lng, controller.signal)
    ]);
    clearTimeout(timeoutId);

    // キャッシュ保存
    cache.set(cacheKey, { timestamp: Date.now(), data: ways });
    return ways;
  } catch (err) {
    clearTimeout(timeoutId);
    // フォールバック: 個別順次実行
    try {
      const fallbackWays = await fetchFromOsmApi(lat, lng);
      return fallbackWays;
    } catch (e2) {
      throw new Error('道路データの取得に失敗しました');
    }
  }
}

// 最適な道路を選定する関数（近接度最優先）
function selectBestWay(ways) {
  if (!ways || ways.length === 0) return null;

  const IGNORE_HIGHWAYS = ['footway', 'path', 'pedestrian', 'motorway_link', 'steps', 'cycleway', 'proposed', 'construction'];
  const candidateWays = ways.filter((w) => {
    const hw = (w.tags && w.tags.highway) || '';
    return !IGNORE_HIGHWAYS.includes(hw);
  });

  if (candidateWays.length === 0) return null;

  // 距離順にソート
  candidateWays.sort((a, b) => a.distance - b.distance);

  const nearestDist = candidateWays[0].distance;
  const closeWays = candidateWays.filter((w) => w.distance <= Math.max(15, nearestDist + 5));

  closeWays.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    const tagA = a.tags || {};
    const tagB = b.tags || {};

    if (tagA.bridge === 'yes') scoreA += 50;
    if (tagB.bridge === 'yes') scoreB += 50;

    if (tagA.ref) scoreA += 40;
    if (tagB.ref) scoreB += 40;

    if (['primary', 'secondary', 'tertiary'].includes(tagA.highway)) scoreA += 30;
    if (['primary', 'secondary', 'tertiary'].includes(tagB.highway)) scoreB += 30;

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a.distance - b.distance;
  });

  return closeWays[0];
}

// 道路データから生活道路・通常道路を判定する関数
function evaluateWays(ways, lat, lng) {
  const selectedWay = selectBestWay(ways);

  if (!selectedWay) {
    return { found: false, message: '公道データが見つかりませんでした' };
  }

  const tags = selectedWay.tags || {};
  const hw = tags.highway || '';
  const isBridge = tags.bridge === 'yes';
  const bridgePrefix = isBridge ? '【橋梁】' : '';
  const roadName = tags.name || tags['name:ja'] || (tags.ref ? `県道/市道 ${tags.ref}` : '');
  const displayRoadName = `${bridgePrefix}${roadName || '一般道路'}`;
  const hwJapanese = HIGHWAY_NAMES[hw] || hw;

  let isNarrow = false;
  let detail = '';
  const width = parseFloat(tags.width);
  const lanes = parseInt(tags.lanes, 10);

  // 判定基準:
  if (!isNaN(width)) {
    if (width < 5.5) {
      isNarrow = true;
      detail = `実測幅員: ${width}m（5.5m未満） / 種別: ${hwJapanese}`;
    } else {
      isNarrow = false;
      detail = `実測幅員: ${width}m（5.5m以上） / 種別: ${hwJapanese}`;
    }
  }
  else if (hw === 'track') {
    isNarrow = true;
    detail = `種別: ${hwJapanese}（5.5m未満 / 30km制限対象）`;
  }
  else if (hw === 'service') {
    isNarrow = true;
    detail = `種別: ${hwJapanese}（敷地内・生活道路）`;
  }
  else if (['residential', 'living_street'].includes(hw)) {
    if (lanes >= 2) {
      isNarrow = false;
      detail = `車線数: ${lanes}車線（中央線あり） / 種別: ${hwJapanese}`;
    } else {
      isNarrow = true;
      detail = `種別: ${hwJapanese}（中央線なし生活道路）`;
    }
  }
  else if (hw === 'unclassified') {
    const hasMajorFeature = tags.ref || isBridge || lanes >= 2 || (tags.name && (tags.name.includes('県道') || tags.name.includes('国道') || tags.name.includes('バイパス') || tags.name.includes('橋')));
    if (hasMajorFeature) {
      isNarrow = false;
      detail = `種別: ${hwJapanese}（主要道路 / 中央線あり）`;
    } else {
      isNarrow = true;
      detail = `種別: ${hwJapanese}（中央線なし推定）`;
    }
  }
  else if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(hw)) {
    if (lanes === 1 || tags.narrow === 'yes') {
      isNarrow = true;
      detail = `種別: ${hwJapanese}（1車線狭小部）`;
    } else {
      isNarrow = false;
      detail = `種別: ${hwJapanese}（中央線あり主要道）`;
    }
  } else {
    isNarrow = false;
    detail = `種別: ${hwJapanese}`;
  }

  return {
    found: true,
    isNarrow: isNarrow,
    roadName: displayRoadName,
    roadType: hwJapanese,
    detail: detail,
    distance: selectedWay.distance
  };
}

// Content Scriptからのメッセージを受信
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkRoadWidth') {
      const { lat, lng } = request;

      fetchFastestRoadData(lat, lng)
        .then((ways) => {
          const result = evaluateWays(ways, lat, lng);
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({
            found: false,
            error: err.message
          });
        });

      return true;
    }
  });
}

// テスト用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    distanceToSegment,
    distanceToPolyline,
    selectBestWay,
    evaluateWays
  };
}
