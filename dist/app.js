(() => {
  'use strict';

  const RULES = { excellent: 95, good: 85, medium: 75, pass: 75 };
  const INCLUDED_NATURES = new Set(['必修', '实践', '实践环节']);
  const REFERENCE_SCORES = [95.01,93.2,92.98,92.81,90.19,92.48,91.28,91.22,90.77,90.35,89.84,90.43,89.84,88.93,89.39,89.52,87.26,89.41,88.73,89.09,86.32,89.08,89,88.75,88.26,88.66,88.41,88.39,88.03,87.86,87.81,87.89,87.86,87.55,87.55,87.37,87.41,87.32,87.19,86.95,87.15,87.25,86.23,87,86.98,86.82];
  const EXTERNAL_COUNT = 37;
  const state = { courses: [], samples: loadSamples(), rules: { ...RULES } };
  const $ = (id) => document.getElementById(id);

  function clean(value) { return String(value ?? '').replace(/^\uFEFF/, '').trim(); }
  function numberOrText(value) { const v = clean(value); if (!v) return ''; const n = Number(v); return Number.isFinite(n) ? n : v; }
  function numeric(value) {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function isIncluded(course) {
    const nature = clean(course.nature);
    const category = clean(course.category);
    return INCLUDED_NATURES.has(nature) || (nature === '课外实践' && !category.includes('选修'));
  }
  function mapLabel(value) {
    const v = clean(value);
    if (v === '优秀') return state.rules.excellent;
    if (v === '良好') return state.rules.good;
    if (v === '中等') return state.rules.medium;
    if (v === '通过') return state.rules.pass;
    return null;
  }
  function convertedScore(course) {
    if (!isIncluded(course)) return null;
    const direct = numeric(course.score);
    if (direct !== null) return direct;
    const mapped = mapLabel(course.score);
    if (mapped !== null) return mapped;
    const labDirect = numeric(course.labScore);
    if (labDirect !== null) return labDirect;
    const labMapped = mapLabel(course.labScore);
    if (labMapped !== null) return labMapped;
    return null;
  }
  function conversionReason(course) {
    if (!isIncluded(course)) return '未纳入：选修类或专业选修课实践';
    const raw = clean(course.score);
    const lab = clean(course.labScore);
    if (numeric(raw) !== null) return '成绩数值';
    if (mapLabel(raw) !== null) return `成绩“${raw}”按规则折算`;
    if (numeric(lab) !== null) return '实验成绩数值';
    if (mapLabel(lab) !== null) return `实验成绩“${lab}”按规则折算`;
    return '缺少可折算成绩';
  }
  function semester(course) { return [clean(course.year), clean(course.term)].filter(Boolean).join('-') || '未填写'; }

  function parseDelimited(text) {
    const lines = clean(text).split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(',') ? ',' : null);
    if (!delimiter) throw new Error('没有识别到制表符或逗号分隔。请直接从教务系统复制表格。');
    const rawHeaders = lines[0].split(delimiter).map(clean);
    const looksLikeHeader = rawHeaders.some((header) => ['课程名称', '课程代码', '课程性质', '学分', '成绩'].includes(header));
    // 教务系统常见的复制结果没有表头，但列顺序固定为：
    // 学年、学期、课程代码、课程名称、课程性质、课程归属、学分、绩点、平时、期中、期末、实验成绩、成绩……
    if (delimiter === '\t' && !looksLikeHeader && rawHeaders.length >= 13 && /^\d{4}-\d{4}$/.test(rawHeaders[0])) {
      return lines.map((line) => {
        const cols = line.split('\t');
        return {
          year: numberOrText(cols[0]), term: numberOrText(cols[1]), code: numberOrText(cols[2]), name: clean(cols[3]),
          nature: clean(cols[4]), category: clean(cols[5]), credits: numeric(cols[6]) || 0,
          score: numberOrText(cols[12]), labScore: numberOrText(cols[11]),
        };
      }).filter((course) => course.name || course.credits || course.score);
    }
    const aliases = {
      year: ['学年', '年份', '年级'], term: ['学期', '学期号'], code: ['课程代码', '课程编号', '代码'],
      name: ['课程名称', '课程名', '科目'], nature: ['课程性质', '性质'], category: ['课程归属', '课程类别', '归属'],
      credits: ['学分', '学分数', '学分值'], score: ['成绩', '总评成绩', '最终成绩'], labScore: ['实验成绩', '实验分', '实验'],
    };
    const findIndex = (names) => rawHeaders.findIndex((header) => names.some((name) => header === name || header.includes(name)));
    const index = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, findIndex(names)]));
    if (index.name < 0 || index.credits < 0 || index.score < 0) throw new Error('至少需要课程名称、学分和成绩三列。');
    return lines.slice(1).map((line) => {
      const cols = line.split(delimiter);
      const get = (key) => index[key] >= 0 ? numberOrText(cols[index[key]]) : '';
      let score = get('score');
      // Some clipboard providers compress consecutive empty cells. If the score cell is empty,
      // use the last non-empty field on that row as a safe fallback for common grade-table layouts.
      if (score === '') {
        const nonEmpty = cols.map(clean).filter(Boolean);
        if (nonEmpty.length) score = numberOrText(nonEmpty[nonEmpty.length - 1]);
      }
      return { year: get('year'), term: get('term'), code: get('code'), name: get('name'), nature: get('nature'), category: get('category'), credits: numeric(get('credits')) || 0, score, labScore: get('labScore') };
    }).filter((course) => course.name || course.credits || course.score);
  }

  function demoCourses() {
    return [
      { year: '2025-2026', term: '1', name: '化工原理Ⅱ', nature: '必修', category: '', credits: 3, score: 97, labScore: '' },
      { year: '2025-2026', term: '1', name: '物理化学实验A', nature: '实践', category: '', credits: 1.5, score: '优秀', labScore: '优秀' },
      { year: '2025-2026', term: '1', name: '化工原理课程设计', nature: '实践', category: '', credits: 2, score: '良好', labScore: '' },
      { year: '2025-2026', term: '2', name: '军训', nature: '实践', category: '', credits: 2, score: '通过', labScore: '' },
      { year: '2025-2026', term: '2', name: '专业选修实践示例', nature: '课外实践', category: '专业选修课', credits: 2, score: 95, labScore: '' },
    ];
  }

  function calculate() {
    let weighted = 0, credits = 0, includedCount = 0;
    const rows = state.courses.map((course) => {
      const score = convertedScore(course);
      const include = isIncluded(course) && score !== null && numeric(course.credits) > 0;
      if (include) { weighted += Number(course.credits) * score; credits += Number(course.credits); includedCount += 1; }
      return { ...course, converted: score, include, reason: conversionReason(course) };
    });
    const average = credits ? weighted / credits : null;
    const comprehensive = numeric($('comprehensiveInput').value);
    const total = average !== null && comprehensive !== null ? average * .9 + comprehensive * .1 : null;
    return { rows, weighted, credits, includedCount, average, comprehensive, total };
  }

  function render() {
    const result = calculate();
    $('weightedScore').textContent = result.average === null ? '—' : result.average.toFixed(2);
    $('creditSummary').textContent = result.average === null ? '尚未导入课程' : `${result.credits.toFixed(1)} 学分 · ${result.includedCount} 门计入`;
    $('comprehensiveScore').textContent = result.comprehensive === null ? '—' : result.comprehensive.toFixed(2);
    $('totalScore').textContent = result.total === null ? '—' : result.total.toFixed(2);
    $('courseCount').textContent = `${state.courses.length} 门课程`;
    const tbody = $('courseTable').querySelector('tbody');
    tbody.innerHTML = '';
    if (!result.rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">导入成绩后，这里会展示每门课程的计算依据。</td></tr>';
    } else {
      result.rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = row.include ? 'included' : 'excluded';
        const original = [clean(row.score), clean(row.labScore)].filter(Boolean).join(' / ') || '—';
        tr.innerHTML = `<td>${escapeHtml(semester(row))}</td><td>${escapeHtml(row.name || '未命名课程')}</td><td>${escapeHtml(row.nature || '未填写')}</td><td>${Number(row.credits || 0).toFixed(1)}</td><td>${escapeHtml(original)}</td><td>${row.converted === null ? '—' : Number(row.converted).toFixed(2)}</td><td>${row.include ? '是' : '否'}</td><td>${escapeHtml(row.reason)}</td>`;
        tbody.appendChild(tr);
      });
    }
    renderRank(result);
    renderReference(result);
  }

  function renderReference(result) {
    const scores = REFERENCE_SCORES;
    const sorted = [...scores].sort((a, b) => b - a);
    const externalScores = scores.slice(0, EXTERNAL_COUNT);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    $('referenceCount').textContent = String(scores.length);
    $('referenceExternal').textContent = String(EXTERNAL_COUNT);
    $('referenceRate').textContent = `${(EXTERNAL_COUNT / scores.length * 100).toFixed(1)}%`;
    $('referenceMean').textContent = mean.toFixed(2);
    $('referenceExternalMin').textContent = Math.min(...externalScores).toFixed(2);
    const referenceRank = result.average === null ? null : 1 + sorted.filter((score) => score > result.average).length;
    if (referenceRank === null) {
      $('referenceRank').textContent = '导入成绩后显示全院参考位置';
      $('referenceRankSummary').textContent = '按当前成绩口径与全院样本比较';
    } else if (referenceRank > scores.length) {
      $('referenceRank').textContent = `低于本批样本区间`;
      $('referenceRankSummary').textContent = `样本最低分 ${sorted[sorted.length - 1].toFixed(2)}`;
    } else {
      $('referenceRank').textContent = `约第 ${referenceRank} / ${scores.length}`;
      $('referenceRankSummary').textContent = `样本内位置 · 仅供参考`;
    }
  }

  function renderRank(result) {
    const major = clean($('majorInput').value), grade = clean($('gradeInput').value);
    const eligible = state.samples.filter((sample) => sample.major === major && sample.grade === grade && numeric(sample.score) !== null);
    if (result.average === null || !eligible.length) {
      $('rankScore').textContent = '—';
      $('rankSummary').textContent = eligible.length ? `${eligible.length} 个同口径样本，导入成绩后估计` : '暂无同口径匿名样本';
      return;
    }
    const rank = 1 + eligible.filter((sample) => Number(sample.score) > result.average).length;
    const percentile = Math.max(0, Math.min(100, (eligible.length - rank + 1) / eligible.length * 100));
    $('rankScore').textContent = `约第 ${rank} / ${eligible.length + 1}`;
    $('rankSummary').textContent = `样本内前 ${percentile.toFixed(1)}% · 仅供估计`;
  }

  function renderStatus(message, error = false) { const el = $('importStatus'); el.textContent = message; el.className = `status-line${error ? ' error' : ''}`; }
  function renderSampleStatus(message, error = false) { const el = $('sampleStatus'); el.textContent = message; el.className = `status-line${error ? ' error' : ''}`; }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

  function loadSamples() { try { return JSON.parse(localStorage.getItem('sycce-samples-v1') || '[]'); } catch { return []; } }
  function saveSamples() { localStorage.setItem('sycce-samples-v1', JSON.stringify(state.samples)); }
  function parseSamples(text) {
    const lines = clean(text).split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('样本文件至少需要一行表头和一行数据。');
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(clean);
    const find = (names) => headers.findIndex((h) => names.some((name) => h === name || h.includes(name)));
    const idx = { major: find(['专业']), grade: find(['年级', '届']), score: find(['学分加权分', '学业分', '成绩']), total: find(['最终得分', '总分']) };
    if (idx.major < 0 || idx.grade < 0 || (idx.score < 0 && idx.total < 0)) throw new Error('样本需要包含专业、年级和学分加权分或最终得分。');
    return lines.slice(1).map((line) => { const c = line.split(delimiter); const score = idx.score >= 0 ? numeric(c[idx.score]) : numeric(c[idx.total]); return { major: clean(c[idx.major]), grade: clean(c[idx.grade]), score, source: 'import' }; }).filter((row) => row.major && row.grade && row.score !== null);
  }

  function exportText(filename, text, type = 'text/plain;charset=utf-8') { const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  function exportCourses() {
    const header = ['学年', '学期', '课程名称', '课程性质', '课程归属', '学分', '原始成绩', '实验成绩', '折算成绩', '是否计入'];
    const result = calculate();
    const lines = [header, ...result.rows.map((r) => [r.year, r.term, r.name, r.nature, r.category, r.credits, r.score, r.labScore, r.converted ?? '', r.include ? '是' : '否'])].map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','));
    exportText('化工推免课程计算.csv', '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
  }
  function exportSamples() {
    const lines = [['专业', '年级', '学分加权分'], ...state.samples.map((s) => [s.major, s.grade, s.score])].map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','));
    exportText('化工推免匿名样本.csv', '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function bind() {
    document.querySelectorAll('.tab-button').forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach((b) => b.classList.toggle('active', b === button));
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
    }));
    $('parsePasteButton').addEventListener('click', () => { try { state.courses = parseDelimited($('pasteInput').value); render(); renderStatus(`已识别 ${state.courses.length} 门课程，请在下方逐行核对。`); } catch (error) { renderStatus(error.message, true); } });
    $('loadDemoButton').addEventListener('click', () => { state.courses = demoCourses(); render(); renderStatus('已加载示例数据，可直接修改专业、年级和综合能力成绩。'); });
    $('clearButton').addEventListener('click', () => { state.courses = []; $('pasteInput').value = ''; render(); renderStatus('已清空当前课程。'); });
    $('addManualButton').addEventListener('click', () => {
      const course = { name: clean($('manualName').value), nature: clean($('manualNature').value), category: clean($('manualCategory').value), credits: numeric($('manualCredits').value) || 0, score: numberOrText($('manualScore').value), labScore: numberOrText($('manualLabScore').value), year: clean($('manualYear').value), term: clean($('manualTerm').value) };
      if (!course.name || course.credits <= 0) return renderStatus('请至少填写课程名称和大于 0 的学分。', true);
      state.courses.push(course); render(); renderStatus(`已加入“${course.name}”。`); $('manualName').value = ''; $('manualCredits').value = ''; $('manualScore').value = ''; $('manualLabScore').value = '';
    });
    $('comprehensiveInput').addEventListener('input', render); $('majorInput').addEventListener('input', render); $('gradeInput').addEventListener('change', render);
    $('exportCoursesButton').addEventListener('click', exportCourses); $('exportSampleButton').addEventListener('click', exportSamples);
    $('addSampleButton').addEventListener('click', () => { const result = calculate(); if (result.average === null) return renderSampleStatus('请先导入成绩并得到学分加权分。', true); state.samples.push({ major: clean($('majorInput').value), grade: clean($('gradeInput').value), score: Number(result.average.toFixed(4)), source: 'local' }); saveSamples(); render(); renderSampleStatus('已加入一个匿名样本。'); });
    $('sampleFile').addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const imported = parseSamples(await file.text()); state.samples = state.samples.concat(imported); saveSamples(); render(); renderSampleStatus(`已导入 ${imported.length} 条匿名样本。`); } catch (error) { renderSampleStatus(error.message, true); } event.target.value = ''; });
    $('photoInput').addEventListener('change', async (event) => {
      const file = event.target.files?.[0]; if (!file) return; const status = $('ocrStatus'); const bar = $('ocrProgressBar');
      if (!window.Tesseract) { status.textContent = 'OCR 引擎尚未加载，请稍后重试或使用复制粘贴。'; return; }
      status.textContent = '正在本地识别图片，首次加载语言包可能需要一点时间。'; bar.style.width = '2%';
      try { const result = await window.Tesseract.recognize(file, 'chi_sim+eng', { logger: (info) => { if (info.progress) bar.style.width = `${Math.round(info.progress * 100)}%`; } }); $('pasteInput').value = result.data.text; document.querySelector('[data-tab="paste"]').click(); status.textContent = '识别完成。请检查文本后点击“解析并计算”。'; bar.style.width = '100%'; } catch (error) { status.textContent = `识别失败：${error.message}`; bar.style.width = '0'; }
      event.target.value = '';
    });
  }

  bind(); render();
})();
