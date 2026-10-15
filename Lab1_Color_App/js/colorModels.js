/**
 * colorModels.js — чистая математика цветовых моделей (без DOM).
 *   { id, name, full, components: [{key,label,title,min,max}], toRgb(vec), fromRgb(rgb, prev) }
 */

(function (global) {
  'use strict';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // helpers
  function hueFromRgb(r, g, b, max, d) {
    let h;
    if (max === r) 
      h = ((g - b) / d) % 6;
    else if (max === g) 
      h = (b - r) / d + 2;
    else 
      h = (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  // Оттенок H (градусы), цветность C (0..1), смещение m (0..1) -> RGB 0..255.
  // Для HLS: цветность C = (1 - |2L - 1|)·S, смещение m = L - C/2.
  function hueChromaToRgb(h, c, m) {
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1)); 
    const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hp) % 6];
    return [(t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255];
  }

  // RGB
  const rgb = {
    id: 'rgb', name: 'RGB', full: 'Red · Green · Blue',
    components: [
      { key: 'r', label: 'R', title: 'Красный', min: 0, max: 255 },
      { key: 'g', label: 'G', title: 'Зелёный', min: 0, max: 255 },
      { key: 'b', label: 'B', title: 'Синий', min: 0, max: 255 }
    ],
    toRgb: (v) => [v[0], v[1], v[2]],
    fromRgb: (c) => [c[0], c[1], c[2]]
  };

  // CMYK
  const cmyk = {
    id: 'cmyk', name: 'CMYK', full: 'Cyan · Magenta · Yellow · Key (чёрный)',
    components: [
      { key: 'c', label: 'C', title: 'Голубой', min: 0, max: 100 },
      { key: 'm', label: 'M', title: 'Пурпурный', min: 0, max: 100 },
      { key: 'y', label: 'Y', title: 'Жёлтый', min: 0, max: 100 },
      { key: 'k', label: 'K', title: 'Чёрный', min: 0, max: 100 }
    ],
    toRgb(v) {
      const k = 1 - v[3] / 100;
      return [255 * (1 - v[0] / 100) * k, 255 * (1 - v[1] / 100) * k, 255 * (1 - v[2] / 100) * k];
    },
    fromRgb(c, prev = [0, 0, 0, 0]) {
      const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
      const k = 1 - Math.max(r, g, b);
      if (k >= 1) 
        return [prev[0], prev[1], prev[2], 100]; // чистый чёрный: C,M,Y не определены
      return [
        ((1 - r - k) / (1 - k)) * 100,
        ((1 - g - k) / (1 - k)) * 100,
        ((1 - b - k) / (1 - k)) * 100,
        k * 100
      ];
    }
  };

  // HLS
  const hls = {
    id: 'hls', name: 'HLS', full: 'Hue · Lightness · Saturation',
    components: [
      { key: 'h', label: 'H', title: 'Оттенок, °', min: 0, max: 360 },
      { key: 'l', label: 'L', title: 'Светлота, %', min: 0, max: 100 },
      { key: 's', label: 'S', title: 'Насыщенность, %', min: 0, max: 100 }
    ],
    // C = (1 − |2L − 1|)·S;  m = L − C/2;  далее hueChromaToRgb
    toRgb(v) {
      const l = v[1] / 100, s = v[2] / 100;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      return hueChromaToRgb(v[0], c, l - c / 2);
    },
    fromRgb(c, prev = [0, 0, 0]) {
      const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      const l = (max + min) / 2;
      if (d === 0) return [prev[0], l * 100, l === 0 || l === 1 ? prev[2] : 0]; // серый: H не определён
      const s = d / (1 - Math.abs(2 * l - 1));
      return [hueFromRgb(r, g, b, max, d), l * 100, s * 100];
    }
  };

  // HEX (для превью)
  const toHex = (c) =>
    '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

  function parseHex(str) {
    let s = String(str).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((ch) => ch + ch).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  }

  const api = { models: { cmyk, rgb, hls }, toHex, parseHex, clamp };
  if (typeof module !== 'undefined' && module.exports) 
    module.exports = api;
  else global.ColorModels = api;
})(typeof window !== 'undefined' ? window : globalThis);
