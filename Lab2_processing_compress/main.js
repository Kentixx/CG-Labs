(() => {
    const $ = id => document.getElementById(id);
    let mode = 'point', sourceData = null, secondData = null, sourceFileBytes = 0, lastResult = null, debounce = null;
    const previewZoom = { source: 1, result: 1 };
    const previewBaseSize = { source: null, result: null };
    const previewCanvases = { source: null, result: null };
    const previewStages = { source: null, result: null };
    const srcCanvas = $('sourceCanvas'), outCanvas = $('resultCanvas'), srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true }), outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
    previewCanvases.source = srcCanvas; previewCanvases.result = outCanvas;
    previewStages.source = $('sourceStage'); previewStages.result = $('resultStage');
    const clamp = (v, a = 0, b = 255) => Math.min(b, Math.max(a, v));
    function setStatus(msg, type = '') { const s = $('status'); s.textContent = msg; s.className = 'status' + (type ? ' ' + type : '') }
    function showCanvas(canvas, visible) { canvas.classList.toggle('hidden', !visible); const stage = canvas.parentElement; const ph = stage.querySelector('.placeholder'); if (ph) ph.classList.toggle('hidden', visible) }
    function setImage(canvas, ctx, data) {
        canvas.width = data.width; canvas.height = data.height;
        ctx.putImageData(data, 0, 0); showCanvas(canvas, true);
        const key = canvas === srcCanvas ? 'source' : 'result';
        fitPreviewToStage(key);
    }
    function fitPreviewToStage(key) {
        const canvas = previewCanvases[key], stage = previewStages[key];
        if (!canvas || !stage || !canvas.width || !canvas.height) return;
        const availableW = Math.max(1, stage.clientWidth - 4);
        const availableH = Math.max(1, stage.clientHeight - 4);
        const fit = Math.min(availableW / canvas.width, availableH / canvas.height, 1);
        previewBaseSize[key] = { width: Math.max(1, canvas.width * fit), height: Math.max(1, canvas.height * fit) };
        applyPreviewZoom(key);
    }
    function applyPreviewZoom(key) {
        const canvas = previewCanvases[key], base = previewBaseSize[key];
        if (!canvas || !base) return;
        const zoom = previewZoom[key];
        canvas.style.width = `${Math.max(1, base.width * zoom)}px`;
        canvas.style.height = `${Math.max(1, base.height * zoom)}px`;
        const label = $(key + 'ZoomValue');
        if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    }
    function changeZoom(key, factor) {
        previewZoom[key] = Math.max(0.25, Math.min(5, previewZoom[key] * factor));
        applyPreviewZoom(key);
    }
    function resetZoom(key) {
        previewZoom[key] = 1;
        fitPreviewToStage(key);
        const stage = previewStages[key];
        if (stage) { stage.scrollTop = 0; stage.scrollLeft = 0; }
    }
    function fitFile(file, maxPixels = 12000000) { return new Promise((resolve, reject) => { if (!file || !file.type.startsWith('image/')) return reject(Error('Выберите файл изображения.')); const url = URL.createObjectURL(file), img = new Image(); img.onload = () => { let w = img.naturalWidth, h = img.naturalHeight; if (w * h > maxPixels) { URL.revokeObjectURL(url); return reject(Error('Изображение слишком большое (>12 Мп). Уменьшите размер и загрузите снова.')) } const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0); let d; try { d = c.getContext('2d').getImageData(0, 0, w, h) } catch (e) { URL.revokeObjectURL(url); return reject(Error('Не удалось прочитать пиксели изображения.')) } URL.revokeObjectURL(url); resolve({ data: d, width: w, height: h }) }; img.onerror = () => { URL.revokeObjectURL(url); reject(Error('Не удалось открыть изображение.')) }; img.src = url }) }
    function grayAt(data, i) { return .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2] }
    function makeGray(image) { const { data, width, height } = image, gray = new Uint8Array(width * height); for (let p = 0, i = 0; p < gray.length; p++, i += 4)gray[p] = Math.round(grayAt(data, i)); return gray }
    function showSourceInfo() { if (!sourceData) return; $('sourceInfo').textContent = `${sourceData.width}×${sourceData.height}` }
    function syncInterface() { const isT = mode === 'threshold'; $('operationWrap').classList.toggle('hidden', isT); $('thresholdWrap').classList.toggle('hidden', !isT); $('histPanel').classList.toggle('hidden', !isT); $('secondWrap').classList.toggle('hidden', isT || !['A6', 'A8'].includes($('operation').value)); updateControls(); if (sourceData) scheduleProcess() }
    function controlRange(id, label, min, max, step, value, unit = '') { return `<div class="field"><label for="${id}"><span>${label}</span><span id="${id}Val">${value}${unit}</span></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>` }
    function controlSelect(id, label, opts) { return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></div>` }
    function updateControls() {
        const box = $('dynamicControls'); if (mode === 'threshold') { let m = $('thresholdMethod').value; if (m === 'niblack') box.innerHTML = controlRange('window', 'Размер окна (нечётный)', 3, 51, 2, 15, ' px') + controlRange('kValue', 'Коэффициент k', -1, 0.5, 0.05, -0.2) + controlSelect('polarity', 'Объект на изображении', [['dark', 'Тёмный объект → чёрный'], ['light', 'Светлый объект → белый']]); else box.innerHTML = controlRange('window', 'Размер окна (нечётный)', 3, 51, 2, 15, ' px') + controlRange('minContrast', 'Минимальный локальный контраст', 0, 100, 1, 15) + controlSelect('polarity', 'Объект на изображении', [['dark', 'Тёмный объект → чёрный'], ['light', 'Светлый объект → белый']]); $('formula').textContent = m === 'niblack' ? 'T(x,y) = m(x,y) + k·σ(x,y)\nПорог зависит от среднего и разброса яркости в локальном окне.' : 'T(x,y) = (zmin + zmax)/2;  C = zmax − zmin\nПри C < Cmin применяется резервное решение по уровню 128.'; } else { const op = $('operation').value; let html = ''; if (op === 'A2') html = controlRange('aValue', 'Коэффициент контраста a', 0, 3, 0.05, 1.2) + controlRange('bValue', 'Смещение яркости b', -100, 100, 1, 0); if (op === 'A3') html = controlRange('gammaValue', 'Показатель γ', 0.1, 3, 0.1, 1.2); if (op === 'A6') html = controlSelect('sumMode', 'Режим операции', [['average', 'Среднее двух изображений'], ['sum', 'Сумма с насыщением до 255']]); box.innerHTML = html; const formulas = { A1: 's = 255 − r', A2: 's = clip(a·r + b, 0, 255)', A3: 's = 255·(r/255)^γ', A4: 's = 255·ln(1+r) / ln(256)', A6: 'Среднее: s=(r₁+r₂)/2\nСумма: s=min(255, r₁+r₂)', A8: 's = r₁·r₂ / 255' }; $('formula').textContent = formulas[op] || ''; }
        box.querySelectorAll('input[type=range]').forEach(el => el.addEventListener('input', () => { const val = $(el.id + 'Val'); if (val) val.textContent = el.value + (el.id === 'window' ? ' px' : ''); scheduleProcess() })); box.querySelectorAll('select').forEach(el => el.addEventListener('change', scheduleProcess));
    }
    function integral(gray, w, h, squared = false) { const stride = w + 1, ii = new Float64Array((w + 1) * (h + 1)); for (let y = 1; y <= h; y++) { let row = 0; for (let x = 1; x <= w; x++) { const v = gray[(y - 1) * w + x - 1]; row += squared ? v * v : v; ii[y * stride + x] = ii[(y - 1) * stride + x] + row } } return ii }
    function rectSum(ii, stride, x0, y0, x1, y1) { return ii[y1 * stride + x1] - ii[y0 * stride + x1] - ii[y1 * stride + x0] + ii[y0 * stride + x0] }
    function localStats(gray, w, h, r) { const sum = integral(gray, w, h, false), sq = integral(gray, w, h, true), stride = w + 1, mean = new Float32Array(w * h), std = new Float32Array(w * h); for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1); for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * (y1 - y0), s = rectSum(sum, stride, x0, y0, x1, y1), s2 = rectSum(sq, stride, x0, y0, x1, y1), m = s / n; mean[y * w + x] = m; std[y * w + x] = Math.sqrt(Math.max(0, s2 / n - m * m)) } } return { mean, std } }
    function slidingExtrema1D(input, k, isMax) { const n = input.length, out = new Uint8Array(n), dq = new Int32Array(n); let head = 0, tail = 0, next = 0, r = Math.floor(k / 2); for (let i = 0; i < n; i++) { const right = Math.min(n - 1, i + r), left = Math.max(0, i - r); while (next <= right) { const add = next++; while (tail > head && (isMax ? input[dq[tail - 1]] <= input[add] : input[dq[tail - 1]] >= input[add])) tail--; dq[tail++] = add } while (tail > head && dq[head] < left) head++; out[i] = input[dq[head]] } return out }
    function extrema2D(gray, w, h, k, isMax) { const temp = new Uint8Array(w * h), out = new Uint8Array(w * h), line1 = new Uint8Array(Math.max(w, h)); for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++)line1[x] = gray[y * w + x]; const a = slidingExtrema1D(line1.subarray(0, w), k, isMax); temp.set(a, y * w) } for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++)line1[y] = temp[y * w + x]; const a = slidingExtrema1D(line1.subarray(0, h), k, isMax); for (let y = 0; y < h; y++)out[y * w + x] = a[y] } return out }
    function binaryImage(gray, w, h, thresholdFn, polarity) { const out = new ImageData(w, h), d = out.data; for (let p = 0; p < gray.length; p++) { const white = (gray[p] > thresholdFn(p)); const val = (polarity === 'dark' ? !white : white) ? 0 : 255; const i = p * 4; d[i] = d[i + 1] = d[i + 2] = val; d[i + 3] = 255 } return out }
    function niblack(image) { const { width: w, height: h } = image; if (w * h > 4000000) throw Error('Для локальной обработки уменьшите изображение до 4 Мп или меньше.'); const win = Number($('window').value), r = Math.floor(win / 2), k = Number($('kValue').value), pol = $('polarity').value, gray = makeGray(image), st = localStats(gray, w, h, r), out = new ImageData(w, h); for (let p = 0; p < gray.length; p++) { const t = st.mean[p] + k * st.std[p], black = (gray[p] <= t); const v = (pol === 'dark' ? black : !black) ? 0 : 255; const i = p * 4; out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255 } return out }
    function bernsen(image) { const { width: w, height: h } = image; if (w * h > 4000000) throw Error('Для локальной обработки уменьшите изображение до 4 Мп или меньше.'); const win = Number($('window').value), minC = Number($('minContrast').value), pol = $('polarity').value, gray = makeGray(image), lo = extrema2D(gray, w, h, win, false), hi = extrema2D(gray, w, h, win, true), out = new ImageData(w, h); for (let p = 0; p < gray.length; p++) { const c = hi[p] - lo[p], t = (hi[p] + lo[p]) / 2; let isDark; if (c < minC) isDark = t < 128; else isDark = gray[p] <= t; const v = (pol === 'dark' ? isDark : !isDark) ? 0 : 255; const i = p * 4; out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255 } return out }
    function transformedPoint() {
        const op = $('operation').value, src = sourceData, w = src.width, h = src.height, out = new ImageData(w, h), d = src.data, o = out.data; let second = null; if (['A6', 'A8'].includes(op)) { if (!secondData) throw Error('Для A6 и A8 загрузите второе изображение.'); const c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d'); const temp = document.createElement('canvas'); temp.width = secondData.width; temp.height = secondData.height; temp.getContext('2d').putImageData(secondData, 0, 0); cx.drawImage(temp, 0, 0, w, h); second = cx.getImageData(0, 0, w, h).data }
        const a = op === 'A2' ? Number($('aValue').value) : 0, b = op === 'A2' ? Number($('bValue').value) : 0, g = op === 'A3' ? Number($('gammaValue').value) : 1.2, mode6 = op === 'A6' ? $('sumMode').value : 'average'; for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) { const v = d[i + c]; let s = v; if (op === 'A1') s = 255 - v; else if (op === 'A2') s = clamp(a * v + b); else if (op === 'A3') s = 255 * Math.pow(v / 255, g); else if (op === 'A4') s = 255 * Math.log(1 + v) / Math.log(256); else if (op === 'A6') { const v2 = second[i + c]; s = mode6 === 'sum' ? Math.min(255, v + v2) : (v + v2) / 2 } else if (op === 'A8') s = v * second[i + c] / 255; o[i + c] = Math.round(clamp(s)) } o[i + 3] = d[i + 3] } return out
    }
    function histogram(canvas, data) { const ctx = canvas.getContext('2d'), bins = new Uint32Array(256); for (let i = 0; i < data.data.length; i += 4)bins[Math.round(grayAt(data.data, i))]++; ctx.clearRect(0, 0, canvas.width, canvas.height); const pad = 7, w = canvas.width - pad * 2, h = canvas.height - pad * 2, peak = Math.max(1, ...bins); ctx.fillStyle = '#0b1424'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#263953'; ctx.lineWidth = 1; for (let i = 0; i <= 4; i++) { let y = pad + h * i / 4; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + w, y); ctx.stroke() } ctx.fillStyle = '#7c9cff'; for (let x = 0; x < 256; x++) { let bh = bins[x] / peak * h; ctx.fillRect(pad + x * w / 256, pad + h - bh, Math.max(1, w / 256), bh) } ctx.fillStyle = '#9eacc7'; ctx.font = '10px system-ui'; ctx.fillText('0', pad, canvas.height - 1); ctx.fillText('255', canvas.width - pad - 18, canvas.height - 1) }
    function scheduleProcess() { clearTimeout(debounce); debounce = setTimeout(() => { if (sourceData) process(); }, 90) }
    function process() { if (!sourceData) return setStatus('Сначала загрузите исходное изображение.', 'bad'); try { let result; if (mode === 'threshold') result = $('thresholdMethod').value === 'niblack' ? niblack(sourceData) : bernsen(sourceData); else result = transformedPoint(); lastResult = result; setImage(outCanvas, outCtx, result); $('resultInfo').textContent = `${result.width}×${result.height}`; $('saveBtn').disabled = false; $('processBtn').disabled = false; setStatus('Готово. Результат пересчитан с текущими параметрами.', 'good'); if (mode === 'threshold') { histogram($('histSource'), sourceData); histogram($('histResult'), result) } } catch (e) { setStatus(e.message || 'Ошибка обработки.', 'bad') } }
    async function loadFile(file, which) { try { setStatus('Загружается изображение…'); const loaded = await fitFile(file); if (which === 'source') { sourceData = loaded.data; sourceFileBytes = file.size; setImage(srcCanvas, srcCtx, sourceData); showSourceInfo(); $('processBtn').disabled = false; setStatus(`Загружено: ${loaded.width}×${loaded.height}.`, 'good') } else { secondData = loaded.data; setStatus(`Второе изображение загружено: ${loaded.width}×${loaded.height}.`, 'good') } if (mode === 'point' && ['A6', 'A8'].includes($('operation').value) && !secondData) setStatus('Для выбранной операции требуется второе изображение.'); if (sourceData) scheduleProcess() } catch (e) { setStatus(e.message, 'bad') } }
    $('sourceFile').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0], 'source') }); $('secondFile').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0], 'second') }); $('operation').addEventListener('change', () => { secondData = secondData; $('secondWrap').classList.toggle('hidden', !['A6', 'A8'].includes($('operation').value)); updateControls(); scheduleProcess() }); $('thresholdMethod').addEventListener('change', () => { updateControls(); scheduleProcess() }); $('processBtn').addEventListener('click', process); $('saveBtn').addEventListener('click', () => { if (!lastResult) return; outCanvas.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'lab2_result.png'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000) }, 'image/png') }); $('resetBtn').addEventListener('click', () => { sourceData = null; secondData = null; lastResult = null; previewZoom.source = 1; previewZoom.result = 1; previewBaseSize.source = null; previewBaseSize.result = null; applyPreviewZoom('source'); applyPreviewZoom('result'); $('sourceFile').value = ''; $('secondFile').value = ''; showCanvas(srcCanvas, false); showCanvas(outCanvas, false); $('sourceInfo').textContent = 'нет изображения'; $('resultInfo').textContent = 'нет результата'; $('saveBtn').disabled = true; $('processBtn').disabled = true; setStatus('Загрузите изображение, чтобы начать работу.');['histSource', 'histResult'].forEach(id => { const c = $(id); c.getContext('2d').clearRect(0, 0, c.width, c.height) }); }); document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t)); mode = t.dataset.mode; syncInterface() }));
    function dropSetup(zone, which) { zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag') }); zone.addEventListener('dragleave', () => zone.classList.remove('drag')); zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f, which) }) } dropSetup($('sourceDrop'), 'source'); dropSetup($('sourceStage'), 'source'); dropSetup($('secondDrop'), 'second');
    document.querySelectorAll('[data-zoom-step]').forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.zoomTarget;
        changeZoom(key, Number(btn.dataset.zoomStep) > 0 ? 1.25 : 0.8);
    }));
    document.querySelectorAll('[data-zoom-reset]').forEach(btn => btn.addEventListener('click', () => resetZoom(btn.dataset.zoomReset)));
    ['source', 'result'].forEach(key => {
        const stage = previewStages[key];
        stage.addEventListener('wheel', e => {
            if (!previewCanvases[key] || previewCanvases[key].classList.contains('hidden')) return;
            e.preventDefault();
            changeZoom(key, e.deltaY < 0 ? 1.1 : 0.9);
        }, { passive: false });
    });
    window.addEventListener('resize', () => {
        ['source', 'result'].forEach(key => {
            if (previewCanvases[key] && !previewCanvases[key].classList.contains('hidden')) fitPreviewToStage(key);
        });
    });
    updateControls();
})();