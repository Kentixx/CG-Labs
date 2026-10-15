/**
 * main.js — «контроллер»: хранит состояние и связывает панели между собой.
 *
 * Состояние:
 *   state.rgb      — «истинный» цвет (RGB 0..255, float, БЕЗ округления),
 *   state.vectors  — актуальные значения во всех моделях (для запоминания H/S в вырожденных случаях).
 * Поток данных (односторонний):
 *   действие пользователя в любой панели -> setFromModel(id, vec)
 *     -> vec -> RGB -> пересчёт остальных моделей -> render() обновляет все панели.
 */
(function () {
  'use strict';

  const { models, toHex, parseHex } = window.ColorModels;
  const { createPanel } = window.ColorUI;

  const MODEL_IDS = ['cmyk', 'rgb', 'hls'];
  const START_COLOR = [52, 170, 200];

  const state = { rgb: START_COLOR.slice(), vectors: {} };
  MODEL_IDS.forEach((id) => {
    state.vectors[id] = models[id].fromRgb(START_COLOR);
  });

  const swatch = document.getElementById('swatch');
  const hexInput = document.getElementById('hex');
  const nativeInput = document.getElementById('native');
  const panelsRoot = document.getElementById('panels');

  const panels = {};
  MODEL_IDS.forEach((id) => {
    panels[id] = createPanel(models[id], setFromModel);
    panelsRoot.append(panels[id].el);
  });

  /* Пользователь изменил модель sourceId -> новый вектор vec */
  function setFromModel(sourceId, vec) {
    setColor(models[sourceId].toRgb(vec), sourceId, vec);
  }

  function setColor(rgb, sourceId, sourceVec) {
    state.rgb = rgb.map((v) => Math.min(255, Math.max(0, v)));
    MODEL_IDS.forEach((id) => {
      // источник оставляем как ввёл пользователь (значения «не прыгают»),
      // остальные модели получают пересчёт из RGB; prev сохраняет H/S/CMY там, где они не определены
      state.vectors[id] = id === sourceId ? sourceVec : models[id].fromRgb(state.rgb, state.vectors[id]);
    });
    render();
  }

  function render() {
    Object.keys(panels).forEach((id) => panels[id].update(state.vectors[id]));
    const hex = toHex(state.rgb);
    swatch.style.background = hex;
    nativeInput.value = hex;
    if (document.activeElement !== hexInput) 
      hexInput.value = hex.toUpperCase();
  }

  hexInput.addEventListener('input', () => {
    const rgb = parseHex(hexInput.value);
    hexInput.classList.toggle('is-invalid', !rgb);
    if (rgb) setColor(rgb, null, null);
  });
  hexInput.addEventListener('change', () => {
    hexInput.classList.remove('is-invalid');
    render();
  });
  nativeInput.addEventListener('input', () => setColor(parseHex(nativeInput.value), null, null));

  render();
})();
