/**
 * ui.js — построение панели одной цветовой модели.
 * Панель умеет три способа ввода цвета:
 *   1) числовые поля (точное значение),
 *   2) двумерная палитра (клик/перетаскивание, как в графических редакторах),
 *   3) ползунки (плавное изменение).
 * Панель НЕ хранит «истину» о цвете: она получает вектор через update()
 * и сообщает о пользовательском изменении через onChange(modelId, vector).
 */
(function (global) {
  'use strict';

  const { clamp } = global.ColorModels;

  // Какие две компоненты образуют плоскость палитры (индексы в model.components).
  // Остальные компоненты модели фиксированы и меняются ползунками.
  const PALETTE_AXES = {
    cmyk: { x: 0, y: 1 }, // C по горизонтали, M по вертикали (Y и K — ползунками)
    rgb: { x: 0, y: 1 },  // R по горизонтали, G по вертикали (B — ползунком)
    hls: { x: 0, y: 1 }   // H по горизонтали, L по вертикали (S — ползунком)
  };

  const PALETTE_SIZE = 128; // внутреннее разрешение canvas; CSS растягивает его на всю карточку
  const TRACK_STOPS = 6;    // сколько цветовых остановок в градиенте под ползунком

  const css = (rgb) => `rgb(${rgb.map((v) => Math.round(clamp(v, 0, 255))).join(',')})`;

  function el(tag, className, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    return node;
  }

  function createPanel(model, onChange) {
    const axes = PALETTE_AXES[model.id];
    const comps = model.components;
    let current = comps.map((c) => c.min);

    /* ---------- каркас ---------- */
    const root = el('section', 'model-card card', { 'data-model': model.id });
    const head = el('header', 'model-card__head');
    head.append(el('h2', 'model-card__title'), el('span', 'model-card__full'));
    head.firstChild.textContent = model.name;
    head.lastChild.textContent = model.full;

    const paletteBox = el('div', 'palette', { 'aria-label': `Палитра ${model.name}` });
    const canvas = el('canvas', 'palette__canvas', { width: PALETTE_SIZE, height: PALETTE_SIZE });
    const marker = el('span', 'palette__marker');
    paletteBox.append(canvas, marker);

    const caption = el('p', 'palette__caption');
    caption.textContent =
      `Палитра: → ${comps[axes.x].label}, ↑ ${comps[axes.y].label}` +
      (comps.length > 2 ? ' (остальное — ползунками)' : '');

    const rows = el('div', 'rows');
    const inputs = comps.map((c, i) => {
      const id = `${model.id}-${c.key}`;
      const row = el('div', 'row');
      const label = el('label', 'row__label', { for: id + '-num', title: c.title });
      label.textContent = c.label;
      const slider = el('input', 'row__slider', {
        type: 'range', min: c.min, max: c.max, step: 1, id: id + '-range', 'aria-label': `${c.title} (ползунок)`
      });
      const number = el('input', 'row__number', {
        type: 'number', min: c.min, max: c.max, step: 1, id: id + '-num', inputmode: 'numeric'
      });
      row.append(label, slider, number);
      rows.append(row);

      // 1) ползунок — меняет компоненту непрерывно
      slider.addEventListener('input', () => setComponent(i, Number(slider.value)));

      // 2) числовое поле — «точный» ввод; пока пользователь печатает, поле не перезаписываем
      number.addEventListener('input', () => {
        const raw = number.value.trim();
        const parsed = Number(raw);
        const bad = raw === '' || !Number.isFinite(parsed);
        const out = !bad && (parsed < c.min || parsed > c.max);
        number.classList.toggle('is-invalid', bad || out);
        if (!bad) setComponent(i, clamp(parsed, c.min, c.max));
      });
      // при уходе из поля показываем нормализованное значение
      number.addEventListener('change', () => {
        number.classList.remove('is-invalid');
        syncInputs();
      });
      return { slider, number };
    });

    root.append(head, paletteBox, caption, rows);

    /* ---------- действия пользователя ---------- */
    function setComponent(i, value) {
      const vec = current.slice();
      vec[i] = value;
      onChange(model.id, vec);
    }

    // 3) палитра: координаты указателя -> две компоненты сразу
    function pickFromPointer(ev) {
      const r = paletteBox.getBoundingClientRect();
      const tx = clamp((ev.clientX - r.left) / r.width, 0, 1);
      const ty = clamp((ev.clientY - r.top) / r.height, 0, 1);
      const cx = comps[axes.x], cy = comps[axes.y];
      const vec = current.slice();
      vec[axes.x] = cx.min + tx * (cx.max - cx.min);
      vec[axes.y] = cy.min + (1 - ty) * (cy.max - cy.min); // y экрана идёт вниз, значение — вверх
      onChange(model.id, vec);
    }
    paletteBox.addEventListener('pointerdown', (ev) => {
      paletteBox.setPointerCapture(ev.pointerId);
      paletteBox.classList.add('is-dragging');
      pickFromPointer(ev);
    });
    paletteBox.addEventListener('pointermove', (ev) => {
      if (paletteBox.hasPointerCapture(ev.pointerId)) pickFromPointer(ev);
    });
    const stopDrag = () => paletteBox.classList.remove('is-dragging');
    paletteBox.addEventListener('pointerup', stopDrag);
    paletteBox.addEventListener('pointercancel', stopDrag);

    /* ---------- отрисовка ---------- */
    function syncInputs() {
      comps.forEach((c, i) => {
        const v = clamp(current[i], c.min, c.max);
        inputs[i].slider.value = v;
        if (document.activeElement !== inputs[i].number) {
          inputs[i].number.value = Math.round(v);
        }
      });
    }

    // градиент под ползунком: цвет при изменении только этой компоненты от min до max
    function paintTracks() {
      comps.forEach((c, i) => {
        const stops = [];
        for (let s = 0; s <= TRACK_STOPS; s++) {
          const vec = current.slice();
          vec[i] = c.min + ((c.max - c.min) * s) / TRACK_STOPS;
          stops.push(css(model.toRgb(vec)));
        }
        inputs[i].slider.style.setProperty('--track', `linear-gradient(to right, ${stops.join(',')})`);
      });
    }

    // палитра: для каждого пикселя подставляем (x, y) в две компоненты, остальные — текущие
    const ctx = canvas.getContext('2d');
    function paintPalette() {
      const img = ctx.createImageData(PALETTE_SIZE, PALETTE_SIZE);
      const cx = comps[axes.x], cy = comps[axes.y];
      const vec = current.slice();
      let p = 0;
      for (let py = 0; py < PALETTE_SIZE; py++) {
        vec[axes.y] = cy.min + (1 - py / (PALETTE_SIZE - 1)) * (cy.max - cy.min);
        for (let px = 0; px < PALETTE_SIZE; px++) {
          vec[axes.x] = cx.min + (px / (PALETTE_SIZE - 1)) * (cx.max - cx.min);
          const rgb = model.toRgb(vec);
          img.data[p++] = clamp(rgb[0], 0, 255);
          img.data[p++] = clamp(rgb[1], 0, 255);
          img.data[p++] = clamp(rgb[2], 0, 255);
          img.data[p++] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    function placeMarker() {
      const cx = comps[axes.x], cy = comps[axes.y];
      const tx = (current[axes.x] - cx.min) / (cx.max - cx.min);
      const ty = (current[axes.y] - cy.min) / (cy.max - cy.min);
      marker.style.left = `${clamp(tx, 0, 1) * 100}%`;
      marker.style.top = `${(1 - clamp(ty, 0, 1)) * 100}%`;
    }

    function update(vec) {
      current = vec.slice();
      syncInputs();
      paintTracks();
      paintPalette();
      placeMarker();
    }

    return { id: model.id, el: root, update };
  }

  global.ColorUI = { createPanel };
})(window);
