// ==================== 狀態管理 ====================
const DEFAULT_USER_DATA = { answers:{}, hearts:{}, streak:0, progress:{}, correctCounts:{}, subcategoryRuns:{} };
let userData = structuredClone(DEFAULT_USER_DATA);
let quizState = { questions:[], currentIndex:0, selectedAnswer:null, confirmed:false, sessionCorrect:0, isHeartMode:false, heartSubjectId:null };
let currentSubjectId = null;
let currentCategoryId = null;
let currentSubcategoryId = null;
const USER_ID = 'default_user';

// ==================== Firebase ====================

const LOCAL_CACHE_KEY = 'socialwork_quiz_local_backup_v2';

function normalizeUserData(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  return {
    answers: safe.answers && typeof safe.answers === 'object' && !Array.isArray(safe.answers) ? safe.answers : {},
    hearts: safe.hearts && typeof safe.hearts === 'object' && !Array.isArray(safe.hearts) ? safe.hearts : {},
    streak: Number.isFinite(Number(safe.streak)) ? Number(safe.streak) : 0,
    progress: safe.progress && typeof safe.progress === 'object' && !Array.isArray(safe.progress) ? safe.progress : {},
    correctCounts: safe.correctCounts && typeof safe.correctCounts === 'object' && !Array.isArray(safe.correctCounts) ? safe.correctCounts : {},
    subcategoryRuns: safe.subcategoryRuns && typeof safe.subcategoryRuns === 'object' && !Array.isArray(safe.subcategoryRuns) ? safe.subcategoryRuns : {},
  };
}

function saveLocalBackup() {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(userData));
  } catch(e) {
    console.warn('local backup save:', e);
  }
}
function loadLocalBackup() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) {
    console.warn('local backup load:', e);
    return null;
  }
}


async function loadUserData() {
  const local = loadLocalBackup();
  if (local) userData = normalizeUserData({ ...DEFAULT_USER_DATA, ...local });
  else userData = structuredClone(DEFAULT_USER_DATA);

  try {
    await Promise.race([
      new Promise(r => {
        if (typeof window._firebaseReady !== 'undefined') return r();
        document.addEventListener('firebaseReady', r, {once:true});
      }),
      new Promise(r => setTimeout(r, 1500))
    ]);

    if (!window._firebaseReady || !window._db || !window._dbFns) return;

    const {doc, getDoc} = window._dbFns;
    const snap = await getDoc(doc(window._db, 'users', USER_ID));
    if (snap.exists()) {
      userData = normalizeUserData({ ...DEFAULT_USER_DATA, ...snap.data() });
      saveLocalBackup();
    }
  } catch(e) {
    console.warn('Firebase load:', e);
    userData = normalizeUserData(userData);
  }
}
async function saveUserData() {
  userData = normalizeUserData(userData);
  saveLocalBackup();
  try {
    if (!window._firebaseReady || !window._db || !window._dbFns) return;
    const {doc, setDoc} = window._dbFns;
    await setDoc(doc(window._db, 'users', USER_ID), userData);
  } catch(e) { console.warn('Firebase save:', e); }
}


// ==================== 練習進度工具 ====================
function makeHeartProgressKey(subjectId=null, subcategoryId=null) {
  if (subcategoryId) return `heart_sub_${subcategoryId}`;
  if (subjectId) return `heart_subject_${subjectId}`;
  return 'heart_all';
}
function buildQuizState(questions, opts={}) {
  return {
    questions,
    currentIndex: opts.currentIndex || 0,
    selectedAnswer: null,
    confirmed: false,
    sessionCorrect: opts.sessionCorrect || 0,
    isHeartMode: !!opts.isHeartMode,
    heartSubjectId: opts.heartSubjectId || null,
    heartSubcategoryId: opts.heartSubcategoryId || null,
    progressKey: opts.progressKey || null
  };
}
function ensureProgressStore() {
  userData.progress = userData.progress || {};
  return userData.progress;
}
function getResumePrompt(saved, label='練習') {
  const answered = saved.index || 0;
  const total = (saved.ids || []).length;
  const current = Math.min(answered + 1, total);
  const correct = saved.sessionCorrect || 0;
  return `發現尚未完成的${label}進度：已做到第 ${current} 題，共 ${total} 題。目前已答對 ${correct} 題。確定 → 繼續上次取消 → 重新開始`;
}
function restoreQuestionsByIds(ids) {
  return (ids || []).map(id => QUESTIONS.find(q => q.id===id)).filter(Boolean);
}
function saveCurrentQuizProgress(markNext=false) {
  if (!quizState.progressKey) return;
  const store = ensureProgressStore();
  store[quizState.progressKey] = {
    ids: quizState.questions.map(q => q.id),
    index: Math.max(0, Math.min(quizState.questions.length, quizState.currentIndex + (markNext ? 1 : 0))),
    sessionCorrect: quizState.sessionCorrect || 0,
    isHeartMode: !!quizState.isHeartMode,
    heartSubjectId: quizState.heartSubjectId || null,
    heartSubcategoryId: quizState.heartSubcategoryId || null,
    subjectId: currentSubjectId || null,
    categoryId: currentCategoryId || null,
    subcategoryId: currentSubcategoryId || null,
    updatedAt: Date.now()
  };
  saveUserData();
}

function recordCompletedSubcategoryRun() {
  if (!currentSubcategoryId) return;
  if (quizState.isHeartMode) return;
  const total = quizState.questions?.length || 0;
  if (total===0) return;
  const correct = quizState.sessionCorrect || 0;
  const accuracy = Math.round(correct / total * 100);
  userData.subcategoryRuns = userData.subcategoryRuns || {};
  userData.subcategoryRuns[currentSubcategoryId] = userData.subcategoryRuns[currentSubcategoryId] || [];
  userData.subcategoryRuns[currentSubcategoryId].push({
    finishedAt: Date.now(),
    total,
    correct,
    accuracy
  });
  saveUserData();
}

function getSubcategoryRunSummary(subcategoryId) {
  const runs = userData.subcategoryRuns?.[subcategoryId] || [];
  if (!runs.length) return null;
  const last = runs[runs.length - 1];
  const best = Math.max(...runs.map(r => Number(r.accuracy) || 0));
  const avg = Math.round(runs.reduce((sum, r) => sum + (Number(r.accuracy) || 0), 0) / runs.length);
  return { count: runs.length, last, best, avg };
}
function clearQuizProgress(progressKey) {
  if (!progressKey || !userData.progress?.[progressKey]) return;
  delete userData.progress[progressKey];
  saveUserData();
}
function startSavedOrFreshQuiz({progressKey, questions, isHeartMode=false, heartSubjectId=null, heartSubcategoryId=null, label='練習'}) {
  if (!questions || questions.length===0) {
    showToast('此分類目前尚無題目');
    return;
  }
  const saved = userData.progress?.[progressKey];
  if (saved && saved.ids?.length && saved.index < saved.ids.length) {
    if (confirm(getResumePrompt(saved, label))) {
      const orderedQs = restoreQuestionsByIds(saved.ids);
      quizState = buildQuizState(orderedQs, {
        currentIndex: saved.index || 0,
        sessionCorrect: saved.sessionCorrect || 0,
        isHeartMode,
        heartSubjectId,
        heartSubcategoryId,
        progressKey
      });
      showScreen('quiz');
      renderQuestion();
      return;
    }
  }
  const shuffled = shuffle(questions);
  ensureProgressStore()[progressKey] = {
    ids: shuffled.map(q=>q.id),
    index: 0,
    sessionCorrect: 0,
    isHeartMode: !!isHeartMode,
    heartSubjectId: heartSubjectId || null,
    heartSubcategoryId: heartSubcategoryId || null,
    subjectId: currentSubjectId || null,
    categoryId: currentCategoryId || null,
    subcategoryId: currentSubcategoryId || null,
    updatedAt: Date.now()
  };
  saveUserData();
  quizState = buildQuizState(shuffled, {
    isHeartMode,
    heartSubjectId,
    heartSubcategoryId,
    progressKey
  });
  showScreen('quiz');
  renderQuestion();
}


// ==================== UI ====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+id).classList.add('active');
  if (id==='home') renderHome();
  if (id==='heart') renderHeartScreen();
  if (id==='stats') renderStats();
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function openModal(title, content) {
  document.getElementById('notesModalTitle').textContent = title;
  document.getElementById('notesModalBody').innerHTML = content;
  document.getElementById('notesModal').classList.add('active');
}
function closeModal() { document.getElementById('notesModal').classList.remove('active'); }
document.getElementById('notesModal').addEventListener('click', e => { if (e.target===document.getElementById('notesModal')) closeModal(); });

function getAllCategoryNodes() {
  return SUBJECTS.flatMap(s => [
    ...s.categories,
    ...s.categories.flatMap(c => c.subcategories || [])
  ]);
}
function getSubjectByAnyCategoryId(categoryId) {
  return SUBJECTS.find(s =>
    s.categories.some(c => c.id===categoryId || (c.subcategories||[]).some(sc => sc.id===categoryId))
  );
}
function getCategoryAndSubcategory(subcategoryId) {
  for (const subj of SUBJECTS) {
    for (const cat of subj.categories) {
      const sub = (cat.subcategories||[]).find(sc => sc.id===subcategoryId);
      if (sub) return { subj, cat, sub };
    }
  }
  return { subj:null, cat:null, sub:null };
}

// ==================== 首頁 ====================
function renderHome() {
  const grid = document.getElementById('subjectGrid');
  grid.innerHTML = '';
  SUBJECTS.forEach(subj => {
    const subjQs = QUESTIONS.filter(q => q.subject===subj.id);
    const answered = subjQs.filter(q => userData.answers[q.id]).length;
    const correct = subjQs.filter(q => userData.answers[q.id]?.correct).length;
    const pct = subjQs.length>0 ? Math.round(answered/subjQs.length*100) : 0;
    const acc = answered>0 ? Math.round(correct/answered*100) : 0;
    const card = document.createElement('div');
    card.className = 'subject-card';
    card.innerHTML = `<h3>${subj.name}</h3><p>${subj.desc}</p>
      <div class="subject-progress">
        <span>${answered}/${subjQs.length}題</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span>${acc}%</span>
      </div>`;
    card.onclick = () => showSubject(subj.id);
    grid.appendChild(card);
  });
}

// ==================== 科目頁 ====================
function showSubject(subjectId) {
  currentSubjectId = subjectId;
  currentCategoryId = null;
  currentSubcategoryId = null;
  const subj = SUBJECTS.find(s => s.id===subjectId);
  document.getElementById('subjectTitle').textContent = subj.name;
  document.getElementById('subjectDesc').textContent = subj.desc;
  const list = document.getElementById('categoryList');
  list.innerHTML = '';
  subj.categories.forEach(cat => {
    const subIds = (cat.subcategories || []).map(sc => sc.id);
    const catQs = QUESTIONS.filter(q => q.categories.some(id => subIds.includes(id)));
    const answered = catQs.filter(q => userData.answers[q.id]).length;
    const correct = catQs.filter(q => userData.answers[q.id]?.correct).length;
    const acc = answered>0 ? Math.round(correct/answered*100) : 0;
    const resume = userData.progress?.[cat.id];
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `<div><h4>${cat.name}${resume ? ' <span style="font-size:11px;color:var(--accent)">（可續答）</span>' : ''}</h4><p>${catQs.length}題 · 已答${answered}題 · 正確率${acc}%</p></div><span class="cat-arrow">›</span>`;
    card.onclick = () => showCategory(cat.id);
    list.appendChild(card);
  });
  showScreen('subject');
}
function openSubjectNotes() {
  const note = NOTES[currentSubjectId];
  if (note) openModal(note.title, note.content);
  else showToast('筆記建置中');
}

// ==================== 分類頁 ====================
function showCategory(categoryId) {
  currentCategoryId = categoryId;
  currentSubcategoryId = null;

  const categoryStartBtn = document.querySelector('#screen-category .btn-primary');
  const cat = SUBJECTS.flatMap(s=>s.categories).find(c=>c.id===categoryId);
  document.getElementById('categoryTitle').textContent = cat.name;
  document.getElementById('categoryDesc').textContent = cat.desc;
  document.getElementById('catBackBtn').onclick = () => showSubject(currentSubjectId);

  const subcats = cat.subcategories || [];
  const totalQs = QUESTIONS.filter(q => q.categories.some(id => subcats.some(sc => sc.id===id)));
  const answered = totalQs.filter(q => userData.answers[q.id]).length;
  const correct = totalQs.filter(q => userData.answers[q.id]?.correct).length;
  const acc = answered>0 ? Math.round(correct/answered*100) : 0;

  if (categoryStartBtn) categoryStartBtn.style.display = 'none';
  document.getElementById('catStatsRow').innerHTML = `
    <div style="margin-bottom:10px">已答 <strong>${answered}/${totalQs.length}</strong> 題 &nbsp;·&nbsp; 正確率 <strong>${acc}%</strong></div>
  `;

  subcats.forEach(sub => {
    const subQs = QUESTIONS.filter(q => q.categories.includes(sub.id));
    const subAnswered = subQs.filter(q => userData.answers[q.id]).length;
    const subCorrect = subQs.filter(q => userData.answers[q.id]?.correct).length;
    const subAcc = subAnswered>0 ? Math.round(subCorrect/subAnswered*100) : 0;
    const resume = userData.progress?.[sub.id];
    const card = document.createElement('div');
    card.className = 'category-card';
    card.style.marginBottom = '9px';
    card.innerHTML = `<div><h4>${sub.name}${resume ? ' <span style="font-size:11px;color:var(--accent)">（可續答）</span>' : ''}</h4><p>${subQs.length}題 · 已答${subAnswered}題 · 正確率${subAcc}%</p></div><span class="cat-arrow">›</span>`;
    card.onclick = () => showSubcategory(sub.id);
    document.getElementById('catStatsRow').appendChild(card);
  });

  document.getElementById('categoryNotesBtn').textContent = '📖 查看本主分類重點筆記';
  document.getElementById('categoryNotesBtn').onclick = () => {
    const note = NOTES[categoryId] || NOTES[currentSubjectId];
    if (note) openModal(note.title, note.content);
    else showToast('筆記建置中');
  };
  showScreen('category');
}

function showSubcategory(subcategoryId) {
  currentSubcategoryId = subcategoryId;
  const categoryStartBtn = document.querySelector('#screen-category .btn-primary');
  const { cat, sub } = getCategoryAndSubcategory(subcategoryId);
  if (!sub) { showToast('找不到子分類'); return; }

  document.getElementById('categoryTitle').textContent = sub.name;
  document.getElementById('categoryDesc').textContent = `${cat.name} · ${sub.desc}`;
  document.getElementById('catBackBtn').onclick = () => showCategory(cat.id);

  const subQs = QUESTIONS.filter(q => q.categories.includes(subcategoryId));
  const answered = subQs.filter(q => userData.answers[q.id]).length;
  const correct = subQs.filter(q => userData.answers[q.id]?.correct).length;
  const acc = answered>0 ? Math.round(correct/answered*100) : 0;
  const resume = userData.progress?.[subcategoryId];
  const runSummary = getSubcategoryRunSummary(subcategoryId);
  document.getElementById('catStatsRow').innerHTML = `已答 <strong>${answered}/${subQs.length}</strong> 題 &nbsp;·&nbsp; 正確率 <strong>${acc}%</strong>${resume ? ' &nbsp;·&nbsp; <span style="color:var(--accent)">可續答</span>' : ''}${runSummary ? ` &nbsp;·&nbsp; 已完整練習 <strong>${runSummary.count}</strong> 次 &nbsp;·&nbsp; 最近一次 <strong>${runSummary.last.accuracy}%</strong>` : ''}`;

  if (categoryStartBtn) categoryStartBtn.style.display = 'inline-flex';
  document.getElementById('categoryNotesBtn').textContent = '📖 查看本子分類重點筆記';
  document.getElementById('categoryNotesBtn').onclick = () => {
    const note = NOTES[subcategoryId] || NOTES[currentCategoryId] || NOTES[currentSubjectId];
    if (note) openModal(note.title, note.content);
    else showToast('筆記建置中');
  };
  showScreen('category');
}

// ==================== 練習 ====================
function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

// 選項隨機排列（同時支援 A. / (A) 兩種格式）
function shuffleOptions(q) {
  const labels = ['A','B','C','D'];
  const optionPrefixRegex = /^\(?([A-D])(?:[\.|\)])\s*/;

  const normalizeOptionText = (opt) => String(opt || '').replace(optionPrefixRegex, '').trim();
  const getOptionLabel = (opt) => {
    const m = String(opt || '').match(optionPrefixRegex);
    return m ? m[1] : null;
  };

  const correctText = q.options.find(o => getOptionLabel(o) === q.answer);
  const shuffled = shuffle(q.options);
  const correctIndex = shuffled.findIndex(o => o === correctText);
  const newAnswer = correctIndex >= 0 ? labels[correctIndex] : q.answer;
  const relabeled = shuffled.map((opt, i) => labels[i] + '.' + normalizeOptionText(opt));
  return { options: relabeled, answer: newAnswer };
}

function getQuestionSetByCurrentSelection() {
  if (currentSubcategoryId) {
    return QUESTIONS.filter(q => q.categories.includes(currentSubcategoryId));
  }
  if (currentCategoryId) {
    const cat = SUBJECTS.flatMap(s=>s.categories).find(c=>c.id===currentCategoryId);
    const subIds = (cat?.subcategories || []).map(sub => sub.id);
    return QUESTIONS.filter(q => q.categories.some(id => subIds.includes(id)));
  }
  return [];
}


function startQuiz() {
  const targetId = currentSubcategoryId || currentCategoryId;
  const qs = getQuestionSetByCurrentSelection();
  if (qs.length===0) { showToast('此分類目前尚無題目'); return; }
  startSavedOrFreshQuiz({
    progressKey: targetId,
    questions: qs,
    isHeartMode: false,
    label: currentSubcategoryId ? '子分類練習' : '主分類練習'
  });
}
function startHeartQuizAll() {
  const heartIds = Object.keys(userData.hearts||{});
  const qs = QUESTIONS.filter(q => heartIds.includes(q.id));
  if (qs.length===0) { showToast('愛心題目為空'); return; }
  startSavedOrFreshQuiz({
    progressKey: makeHeartProgressKey(),
    questions: qs,
    isHeartMode: true,
    label: '愛心總複習'
  });
}
function startHeartQuizBySubject(subjectId) {
  const heartIds = Object.keys(userData.hearts||{});
  const qs = QUESTIONS.filter(q => heartIds.includes(q.id) && q.subject===subjectId);
  if (qs.length===0) { showToast('此科目無愛心題目'); return; }
  startSavedOrFreshQuiz({
    progressKey: makeHeartProgressKey(subjectId),
    questions: qs,
    isHeartMode: true,
    heartSubjectId: subjectId,
    label: '愛心科目複習'
  });
}
function startHeartQuizBySubcategory(subcategoryId) {
  const heartIds = Object.keys(userData.hearts||{});
  const qs = QUESTIONS.filter(q => heartIds.includes(q.id) && q.categories.includes(subcategoryId));
  if (qs.length===0) { showToast('此子分類無愛心題目'); return; }
  const found = getCategoryAndSubcategory(subcategoryId);
  if (found.subj && found.cat && found.sub) {
    currentSubjectId = found.subj.id;
    currentCategoryId = found.cat.id;
    currentSubcategoryId = found.sub.id;
  }
  startSavedOrFreshQuiz({
    progressKey: makeHeartProgressKey(null, subcategoryId),
    questions: qs,
    isHeartMode: true,
    heartSubjectId: found.subj?.id || null,
    heartSubcategoryId: subcategoryId,
    label: '愛心子分類複習'
  });
}

function renderQuestion() {

  const q = quizState.questions[quizState.currentIndex];
  quizState.selectedAnswer = null;
  quizState.confirmed = false;

  document.getElementById('quizCurrent').textContent = quizState.currentIndex+1;
  document.getElementById('quizTotal').textContent = quizState.questions.length;
  document.getElementById('quizCorrect').textContent = quizState.sessionCorrect;

  // 選項隨機排列
  const {options: shuffledOpts, answer: newAnswer} = shuffleOptions(q);
  quizState._currentAnswer = newAnswer;
  quizState._currentOptions = shuffledOpts;

  const isHeart = userData.hearts?.[q.id] ? '❤️' : '🤍';
  const sessionLabel = q.session===1?'上':'下';
  const allCats = getAllCategoryNodes();
  const catNames = q.categories.map(c => {
    const cat = allCats.find(x=>x.id===c);
    return cat ? `<span class="q-badge cat">${cat.name}</span>` : '';
  }).join('');

  document.getElementById('questionContainer').innerHTML = `
    <div class="question-card">
      <div class="question-meta">
        <span class="q-badge year">${q.year}年${sessionLabel} 第${q.num}題</span>
        ${catNames}
        <button class="heart-toggle" onclick="toggleHeart('${q.id}')" id="heartBtn">${isHeart}</button>
      </div>
      <div class="question-text">${q.text}</div>
      <div class="options-list" id="optionsList">
        ${shuffledOpts.map((opt,i) => {
          const lbl = ['A','B','C','D'][i];
          return `<button class="option-btn" onclick="selectOption('${lbl}')" id="opt_${lbl}">
            <span class="option-label">${lbl}</span>
            <span>${opt.replace(/^[A-D]\./,'')}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="explanation-box" id="explanationBox" style="display:none">
        <button class="explanation-toggle" onclick="toggleExplanation(this)">📝 查看解析 <span>▼</span></button>
        <div class="explanation-content" id="explanationContent">
          <strong>正確答案：${newAnswer}（${shuffledOpts.find(o=>o.startsWith(newAnswer+'.')).replace(/^[A-D]\./,'')}）</strong><br><br>
          ${q.explanation}
        </div>
      </div>
    </div>`;

  document.getElementById('confirmBtn').style.display = 'inline-flex';
  document.getElementById('confirmBtn').disabled = true;
  document.getElementById('nextBtn').style.display = 'none';
  const pauseBtn = document.querySelector('#quizActions .btn-secondary');
  if (pauseBtn) pauseBtn.textContent = '暫停並退出';
}

function selectOption(label) {
  if (quizState.confirmed) return;
  quizState.selectedAnswer = label;
  document.querySelectorAll('.option-btn').forEach(btn => { btn.style.borderColor=''; btn.style.background=''; });
  const btn = document.getElementById('opt_'+label);
  if (btn) { btn.style.borderColor='var(--accent)'; btn.style.background='var(--accent-light)'; }
  document.getElementById('confirmBtn').disabled = false;
}


function confirmAnswer() {
  if (!quizState.selectedAnswer || quizState.confirmed) return;
  quizState.confirmed = true;
  const q = quizState.questions[quizState.currentIndex];
  const correct = quizState.selectedAnswer === quizState._currentAnswer;

  userData.answers = userData.answers || {};
  userData.answers[q.id] = {
    selectedAnswer: quizState.selectedAnswer,
    correct,
    answeredAt: Date.now(),
    mode: quizState.isHeartMode ? 'heart' : 'normal'
  };

  document.querySelectorAll('.option-btn').forEach(btn => { btn.disabled=true; btn.style.borderColor=''; btn.style.background=''; });
  const selBtn = document.getElementById('opt_'+quizState.selectedAnswer);
  const corrBtn = document.getElementById('opt_'+quizState._currentAnswer);
  if (correct) {
    quizState.sessionCorrect++;
    userData.streak = (userData.streak||0)+1;
    if (userData.hearts?.[q.id]) {
      userData.correctCounts = userData.correctCounts||{};
      userData.correctCounts[q.id] = (userData.correctCounts[q.id]||0) + 1;
      if (userData.correctCounts[q.id] >= 3) {
        delete userData.hearts[q.id];
        delete userData.correctCounts[q.id];
        document.getElementById('heartBtn').textContent = '🤍';
        showToast('✅ 答對3次，已自動移除愛心！');
      } else {
        const left = 3 - userData.correctCounts[q.id];
        showToast(`✅ 答對了！再答對 ${left} 次可移除愛心`);
      }
    } else {
      showToast('✅ 答對了！');
    }
  } else {
    userData.streak = 0;
    userData.hearts = userData.hearts||{};
    userData.hearts[q.id] = true;
    showToast('❌ 答錯了，已加入愛心題目');
    document.getElementById('heartBtn').textContent = '❤️';
  }

  if (selBtn) selBtn.classList.add(correct ? 'selected-correct' : 'selected-wrong');
  if (corrBtn) corrBtn.classList.add('show-correct');

  document.getElementById('quizCorrect').textContent = quizState.sessionCorrect;
  document.getElementById('explanationBox').style.display = 'block';
  document.getElementById('confirmBtn').style.display = 'none';
  document.getElementById('nextBtn').style.display = 'inline-flex';

  saveCurrentQuizProgress(true);
}

function nextQuestion() {
  quizState.currentIndex++;
  if (quizState.currentIndex >= quizState.questions.length) {
    const finishedSubcategoryId = currentSubcategoryId;
    const progressKey = quizState.progressKey || currentSubcategoryId || currentCategoryId;

    if (finishedSubcategoryId && !quizState.isHeartMode) {
      recordCompletedSubcategoryRun();
    }

    if (progressKey && userData.progress?.[progressKey]) {
      delete userData.progress[progressKey];
      saveUserData();
    }

    showToast(`練習完成！${quizState.sessionCorrect}/${quizState.questions.length}題正確`);
    setTimeout(() => exitQuiz(), 1200);
    return;
  }
  renderQuestion();
}

function exitQuiz() {
  if (quizState.isHeartMode) showScreen('heart');
  else if (currentSubcategoryId) showSubcategory(currentSubcategoryId);
  else if (currentCategoryId) showCategory(currentCategoryId);
  else showScreen('home');
}
function toggleExplanation(btn) {
  const content = document.getElementById('explanationContent');
  const isOpen = content.classList.toggle('open');
  btn.innerHTML = isOpen ? '📝 收起解析 <span>▲</span>' : '📝 查看解析 <span>▼</span>';
}
function toggleHeart(qId) {
  userData.hearts = userData.hearts||{};
  if (userData.hearts[qId]) { delete userData.hearts[qId]; document.getElementById('heartBtn').textContent='🤍'; showToast('已從愛心移除'); }
  else { userData.hearts[qId]=true; document.getElementById('heartBtn').textContent='❤️'; showToast('已加入愛心題目 ❤️'); }
  saveUserData();
}

// ==================== 愛心頁 ====================

function renderHeartScreen() {
  const heartIds = Object.keys(userData.hearts||{});
  const list = document.getElementById('heartList');
  if (heartIds.length===0) {
    list.innerHTML = `<div class="heart-empty"><div class="empty-icon">🤍</div><p>還沒有愛心題目</p><p>答錯的題目或手動標記的題目會出現在這裡</p></div>`;
    return;
  }

  list.innerHTML = '';

  const allProgressKeys = Object.keys(userData.progress || {}).filter(k => k.startsWith('heart_'));

  SUBJECTS.forEach(subj => {
    const subjHeartQs = QUESTIONS.filter(q => heartIds.includes(q.id) && q.subject===subj.id);
    if (subjHeartQs.length===0) return;

    const subjectProgress = userData.progress?.[makeHeartProgressKey(subj.id)];
    const section = document.createElement('div');
    section.className = 'heart-subject-section';

    const subcatButtons = subj.categories.flatMap(cat => (cat.subcategories || []).map(sub => {
      const subHeartQs = subjHeartQs.filter(q => q.categories.includes(sub.id));
      if (subHeartQs.length===0) return '';
      const subProgress = userData.progress?.[makeHeartProgressKey(null, sub.id)];
      return `<button class="heart-practice-cat-btn" style="margin:4px 6px 0 0" onclick="startHeartQuizBySubcategory('${sub.id}')">${sub.name}（${subHeartQs.length}）${subProgress ? ' · 可續答' : ''}</button>`;
    })).filter(Boolean).join('');

    section.innerHTML = `<div class="heart-subject-title">
      ${subj.name}（${subjHeartQs.length}題）
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        <button class="heart-practice-cat-btn" onclick="startHeartQuizBySubject('${subj.id}')">${subjectProgress ? '續答此科目' : '練習此科目'}</button>
      </div>
    </div>
    <div style="margin:0 0 10px 0;font-size:12px;color:var(--text-secondary)">
      可直接依子分類重練：${subcatButtons || '此科目目前沒有可細分的愛心子分類'}
    </div>`;

    subjHeartQs.forEach(q => {
      const sessionLabel = q.session===1?'上':'下';
      const item = document.createElement('div');
      item.className = 'heart-item';
      const subcatId = q.categories[0];
      const found = getCategoryAndSubcategory(subcatId);
      const subName = found.sub ? found.sub.name : '未分類';
      item.innerHTML = `<span style="font-size:16px;flex-shrink:0">❤️</span>
        <div class="heart-item-text">
          ${q.text.length>55 ? q.text.slice(0,55)+'⋯⋯' : q.text}
          <div class="heart-item-meta">${q.year}年${sessionLabel} 第${q.num}題 · ${subName}</div>
        </div>
        <button class="heart-item-remove" onclick="removeHeart('${q.id}',event)" title="移除">✕</button>`;
      item.onclick = e => {
        if (e.target.closest('.heart-item-remove')) return;
        if (found.subj && found.cat && found.sub) {
          currentSubjectId = found.subj.id;
          currentCategoryId = found.cat.id;
          currentSubcategoryId = found.sub.id;
        }
        quizState = buildQuizState([q], {currentIndex:0, sessionCorrect:0, isHeartMode:true, progressKey:null});
        showScreen('quiz');
        renderQuestion();
      };
      section.appendChild(item);
    });

    list.appendChild(section);
  });

  const globalProgress = userData.progress?.[makeHeartProgressKey()];
  if (globalProgress) {
    const resumeBar = document.createElement('div');
    resumeBar.style.marginBottom = '12px';
    resumeBar.innerHTML = `<button class="btn-secondary" onclick="startHeartQuizAll()">續答愛心總複習</button>`;
    list.prepend(resumeBar);
  }
}

function removeHeart(qId, e) {
  e.stopPropagation();
  delete userData.hearts[qId];
  saveUserData();
  renderHeartScreen();
  showToast('已移除');
}

// ==================== 統計 ====================
function renderStats() {
  let html = `
    <div class="stats-section">
      <h3>各科目正確率</h3>
      <table class="stats-table">
        <thead><tr><th>科目</th><th>已答</th><th>正確率</th></tr></thead><tbody>`;
  SUBJECTS.forEach(subj => {
    const qs = QUESTIONS.filter(q=>q.subject===subj.id);
    const ans = qs.filter(q=>userData.answers[q.id]).length;
    const cor = qs.filter(q=>userData.answers[q.id]?.correct).length;
    const a = ans>0 ? Math.round(cor/ans*100) : 0;
    html += `<tr><td>${subj.name}</td><td>${ans}/${qs.length}</td><td><div class="acc-bar-wrap"><div class="acc-bar"><div class="acc-fill" style="width:${a}%"></div></div><span class="acc-label">${a}%</span></div></td></tr>`;
  });
  html += `</tbody></table></div>
    <div class="stats-section">
      <h3>各分類正確率</h3>
      <table class="stats-table">
        <thead><tr><th>科目</th><th>分類</th><th>已答</th><th>正確率</th></tr></thead><tbody>`;
  SUBJECTS.forEach(subj => {
    subj.categories.forEach(cat => {
      const subIds = (cat.subcategories || []).map(sub => sub.id);
      const qs = QUESTIONS.filter(q=>q.categories.some(id => subIds.includes(id)));
      const ans = qs.filter(q=>userData.answers[q.id]).length;
      const cor = qs.filter(q=>userData.answers[q.id]?.correct).length;
      const a = ans>0 ? Math.round(cor/ans*100) : 0;
      html += `<tr><td style="font-size:11px;color:var(--text-muted)">${subj.name}</td><td>${cat.name}</td><td>${ans}/${qs.length}</td><td><div class="acc-bar-wrap"><div class="acc-bar"><div class="acc-fill" style="width:${a}%"></div></div><span class="acc-label">${a}%</span></div></td></tr>`;
    });
  });
  html += `</tbody></table></div>`;

  html += `
    <div class="stats-section">
      <h3>子分類完整練習紀錄</h3>
      <table class="stats-table">
        <thead><tr><th>科目</th><th>子分類</th><th>完成次數</th><th>最近一次</th><th>最佳</th><th>平均</th></tr></thead><tbody>`;
  SUBJECTS.forEach(subj => {
    subj.categories.forEach(cat => {
      (cat.subcategories || []).forEach(sub => {
        const summary = getSubcategoryRunSummary(sub.id);
        if (!summary) return;
        html += `<tr><td style="font-size:11px;color:var(--text-muted)">${subj.name}</td><td>${sub.name}</td><td>${summary.count}</td><td>${summary.last.correct}/${summary.last.total}（${summary.last.accuracy}%）</td><td>${summary.best}%</td><td>${summary.avg}%</td></tr>`;
      });
    });
  });
  html += `</tbody></table></div>`;
  document.getElementById('statsContent').innerHTML = html;
}
function confirmReset() {
  if (confirm('確定要重置所有作答記錄和愛心題目嗎？此操作無法還原。')) {
    userData = structuredClone(DEFAULT_USER_DATA);
    saveUserData();
    renderStats();
    showToast('已重置所有記錄');
  }
}

// ==================== 社會工作（sw）最終版講義級筆記覆寫 ====================
Object.assign(NOTES, {
  'sw': { title:'社會工作 — 本科目重點總覽', content:`<h4>一、科目整體架構</h4>
<p>社會工作本科可分為五大區塊：社會工作專業發展歷史、社會工作的本質與角色功能、社會工作理論與應用、社會工作哲學與倫理、社會工作實務領域。這五塊不是彼此分離，而是構成同一套助人專業的知識系統：歷史說明專業如何形成，本質說明社工在做什麼，理論提供理解與介入架構，倫理界定專業判準，實務領域則呈現不同服務對象中的應用方式。</p>
<h4>二、五大主分類之間的關係</h4>
<table>
<tr><th>主分類</th><th>核心問題</th><th>與其他分類的連結</th></tr>
<tr><td>社會工作專業發展歷史</td><td>社工如何從慈善與救濟走向專業化</td><td>奠定本質、理論與倫理的形成脈絡</td></tr>
<tr><td>社會工作的本質、特性與角色功能</td><td>社工是什麼樣的專業、扮演哪些角色</td><td>是理解理論應用與實務工作的入口</td></tr>
<tr><td>社會工作理論與應用</td><td>社工如何理解問題與選擇介入方向</td><td>與角色功能、實務領域直接連動</td></tr>
<tr><td>社會工作哲學與倫理</td><td>社工在價值衝突中如何判斷</td><td>規範理論與實務的使用方式</td></tr>
<tr><td>社會工作實務領域</td><td>不同服務對象與場域中的工作重點</td><td>是前述歷史、本質、理論與倫理的整合展現</td></tr>
</table>
<h4>三、本科目知識地圖</h4>
<p>若以準備順序來看，可先掌握社會工作的基本本質與角色，再進入主要理論架構，接著補上倫理判斷原則，最後把不同實務領域的核心取向串起來。歷史題則提供整體專業形成背景，幫助理解為何社工會同時重視個人、環境、制度與社會正義。</p>` },
  'sw_history': { title:'社會工作專業發展歷史', content:`<h4>一、核心概念</h4>
<p>社會工作專業發展歷史所處理的，不只是年代與人物，而是社會工作如何從早期慈善救濟、濟貧與道德教化，逐漸發展成具有理論知識、倫理規範、專業角色與制度認可的專業。此主分類的重點在於理解不同歷史階段如何定義「社會問題」、如何理解「貧窮與失功能」、以及助人工作如何從個人救助擴展至社會改革與制度建構。</p>
<h4>二、發展脈絡整理</h4>
<table>
<tr><th>階段</th><th>核心特色</th><th>代表內容</th></tr>
<tr><td>慈善與濟貧時期</td><td>以救濟、分類、道德教化為主</td><td>慈善組織會社（Charity Organization Society, COS）</td></tr>
<tr><td>社會改革時期</td><td>看見社會結構與環境問題</td><td>睦鄰運動（Settlement Movement）</td></tr>
<tr><td>專業化形成期</td><td>建立知識、教育、倫理與專業身份</td><td>弗萊克斯納（Abraham Flexner）、格林伍德（Ernest Greenwood）</td></tr>
<tr><td>整合與制度化期</td><td>朝綜融式社工與公共制度發展</td><td>西博姆報告（Seebohm Report）、臺灣社工法制化</td></tr>
</table>
<h4>三、系統性整理</h4>
<ul>
<li>歷史題的本質，在於比較不同時代的問題觀與工作觀。</li>
<li>若題目聚焦個別調查、分類救助、道德改善，多半與慈善組織會社有關。</li>
<li>若題目聚焦環境改革、社區生活、社會正義，多半與睦鄰運動有關。</li>
<li>若題目聚焦「社工是否為專業」、「專業要素」、「綜融社工」，通常進入專業化與制度化階段。</li>
</ul>
<h4>四、重要比較</h4>
<table>
<tr><th>比較主題</th><th>A</th><th>B</th><th>關鍵差異</th></tr>
<tr><td>COS vs 睦鄰運動</td><td>個別調查、個人改善</td><td>社區改革、環境改善</td><td>問題歸因的不同</td></tr>
<tr><td>歷史知識 vs 專業化知識</td><td>人物、年代、運動</td><td>教育、倫理、制度</td><td>前者看源流，後者看專業形成</td></tr>
</table>` },
  'sw_history_intl': { title:'國際社工發展歷史', content:`<h4>一、定義</h4>
<p>國際社工發展歷史是指社會工作在英美等西方社會中，從濟貧與慈善實務逐步走向制度化、專業化與學術化的歷程。其核心不僅是記憶歷史事件，而是理解社會工作如何從兩大源流——慈善組織會社與睦鄰運動——衍生出後來的個案工作、團體工作、社區工作與專業倫理。</p>
<h4>二、核心理論內容</h4>
<h4>（一）慈善組織會社（Charity Organization Society, COS）</h4>
<ul>
<li>成立背景：十九世紀工業化後，都市貧窮與慈善資源重複救助問題明顯。</li>
<li>核心觀點：傾向將貧窮視為與個人習慣、道德、努力不足有關。</li>
<li>工作方式：個別調查、訪視、分類救助、友善訪問員（Friendly Visitors）。</li>
<li>歷史影響：對後來個案工作（Casework）與社會診斷（Social Diagnosis）發展影響深遠。</li>
</ul>
<h4>（二）睦鄰運動（Settlement Movement）</h4>
<ul>
<li>成立背景：工業化帶來社區惡劣生活條件，單靠個人教化無法解決結構性不平等。</li>
<li>核心觀點：問題源自社會制度、勞動條件、教育、居住環境與資源分配不均。</li>
<li>工作方式：住進社區、與居民共同生活、推動教育、健康、勞動與社區改革。</li>
<li>代表象徵：湯恩比館（Toynbee Hall）、珍・亞當斯（Jane Addams）。</li>
<li>歷史影響：對社區工作（Community Work）、社會改革與社會政策發展影響深遠。</li>
</ul>
<h4>（三）專業化關鍵人物與論述</h4>
<table>
<tr><th>人物／報告</th><th>重點</th></tr>
<tr><td>瑪麗．芮奇孟（Mary Richmond）</td><td>個案工作奠基者，重視調查、診斷與有系統的助人過程</td></tr>
<tr><td>亞伯拉罕．弗萊克斯納（Abraham Flexner）</td><td>提出社工是否為專業的質疑，促使社工建立專業標準</td></tr>
<tr><td>格林伍德（Ernest Greenwood）</td><td>提出專業五特質：系統性理論、專業權威、社區認可、倫理守則、專業文化</td></tr>
<tr><td>西博姆報告（Seebohm Report）</td><td>強調整合分散社會服務體系，發展綜融式社會工作</td></tr>
</table>
<h4>三、易混淆觀念</h4>
<table>
<tr><th>概念</th><th>常見混淆</th><th>正確辨識</th></tr>
<tr><td>COS</td><td>誤認為推動社區改革</td><td>其核心是分類救助與個別改善</td></tr>
<tr><td>睦鄰運動</td><td>誤認為重視個人道德教化</td><td>其核心是住入社區與社會改革</td></tr>
</table>
<h4>四、常見考法</h4>
<ul>
<li>人物與主張配對題</li>
<li>兩大源流特徵比較題</li>
<li>專業化里程碑題</li>
</ul>` },
  'sw_history_tw': { title:'臺灣社工發展歷史', content:`<h4>一、定義</h4>
<p>臺灣社工發展歷史是指社會工作在臺灣從慈善救濟、宗教與民間福利服務，到社會行政、社區發展、專業教育、法制化與證照制度逐步建立的歷程。其重點在於掌握臺灣社工如何受到殖民統治、戰後社會變遷、國際援助、社會福利政策與專業制度建構的影響。</p>
<h4>二、核心理論內容</h4>
<h4>（一）早期形成</h4>
<ul>
<li>日治時期：近代慈善、公共救助與社會行政觀念逐步傳入臺灣。</li>
<li>戰後初期：宗教與民間福利機構在社會救助、兒少照顧、醫療與安置服務上扮演重要角色。</li>
</ul>
<h4>（二）社區發展與制度擴展</h4>
<ul>
<li>美援時期：社區發展理念與實務逐漸導入，對農村建設與地方福利工作影響深遠。</li>
<li>社會行政體系逐步擴張：政府在兒少、老人、身障、救助等領域逐步設置專責制度。</li>
</ul>
<h4>（三）專業化與法制化</h4>
<ul>
<li>大學社工教育發展：社工知識與訓練逐步制度化。</li>
<li>專業人力需求增加：社福機構、醫療、司法、學校與政府部門逐步增聘社工。</li>
<li>社會工作師法：標誌社工專業資格、執業與倫理規範進一步制度化。</li>
</ul>
<h4>三、系統性整理</h4>
<table>
<tr><th>主軸</th><th>內容</th></tr>
<tr><td>慈善與宗教</td><td>早期以民間、宗教、救助服務為主</td></tr>
<tr><td>社區發展</td><td>美援與社區方案影響臺灣社工實務</td></tr>
<tr><td>教育與法制</td><td>專業教育、證照與執業制度逐步成形</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>臺灣社工並非一開始就以證照制度存在，而是先有服務實務，再逐漸專業化。</li>
<li>社區發展並非邊緣知識，而是臺灣社工發展的重要脈絡之一。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>臺灣社工發展階段題</li>
<li>美援與社區發展關聯題</li>
<li>社會工作師法與專業化意義題</li>
</ul>` },
  'sw_history_meaning': { title:'社會工作意涵演變', content:`<h4>一、定義</h4>
<p>社會工作意涵演變是指社會工作之定義、目標、功能與專業自我理解，如何隨歷史脈絡、社會問題與理論發展而逐步改變。其核心在於理解：社工不再只是慈善救助與個人矯治，而逐漸發展為同時重視個人福祉、社會正義、人權、制度改革與社會凝聚的專業。</p>
<h4>二、核心理論內容</h4>
<table>
<tr><th>時期</th><th>意涵重點</th><th>關鍵特徵</th></tr>
<tr><td>早期救濟時期</td><td>救助、矯治、道德教化</td><td>偏向協助個人適應</td></tr>
<tr><td>專業形成期</td><td>有系統的助人專業</td><td>重視專業關係、評估、介入</td></tr>
<tr><td>現代社工</td><td>人在情境中（Person-in-Environment）</td><td>強調人與環境互動</td></tr>
<tr><td>晚近社工</td><td>社會正義、人權、充權、倡導</td><td>兼顧個人、制度與結構改革</td></tr>
</table>
<h4>三、系統性整理</h4>
<ul>
<li>意涵演變反映社會工作問題觀的轉變：從個人問題，走向人與環境、再走向結構與權利。</li>
<li>現代社工定義通常會同時出現社會變遷、社會發展、社會凝聚、充權（Empowerment）、人權（Human Rights）等語詞。</li>
</ul>
<h4>四、易混淆觀念</h4>
<ul>
<li>若選項只把社工定義為「恢復個人社會功能」，通常是不完整或偏早期理解。</li>
<li>若選項納入人權、社會正義與社會變遷，較符合晚近定義。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>早期與晚近社工定義比較題</li>
<li>社工核心使命判斷題</li>
</ul>` },
  'sw_nature': { title:'社會工作的本質、特性與角色功能', content:`<h4>一、核心概念</h4>
<p>本主分類在處理社會工作作為一門助人專業的本質：社工是什麼樣的專業、具備哪些特性、如何透過專業角色發揮功能。其核心在於理解社工不是單一技術工作，而是兼具知識、價值、關係與制度介入的專業行動。</p>
<h4>二、理論架構整理</h4>
<table>
<tr><th>面向</th><th>內容</th></tr>
<tr><td>本質</td><td>助人專業、重視人與環境互動</td></tr>
<tr><td>特性</td><td>科學性、藝術性、專業性</td></tr>
<tr><td>角色</td><td>使能者、仲介者、倡導者、調停者、教育者等</td></tr>
<tr><td>工作觀</td><td>綜融式社會工作、專業關係、專業化</td></tr>
</table>
<h4>三、系統性整理</h4>
<ul>
<li>本質是回答「社工做什麼」；角色是回答「社工怎麼做」；專業化則回答「為什麼社工是一種專業」。</li>
<li>角色題通常以情境方式命題，因此不能只背名詞，需理解工作動作與功能。</li>
</ul>
<h4>四、重要比較</h4>
<table>
<tr><th>比較主題</th><th>A</th><th>B</th><th>差異</th></tr>
<tr><td>科學性 vs 藝術性</td><td>理論、研究、評估</td><td>關係、直覺、運用自我</td><td>前者重系統方法，後者重實務智慧</td></tr>
<tr><td>仲介者 vs 倡導者</td><td>連結資源</td><td>爭取權益</td><td>前者偏服務媒合，後者偏權利主張</td></tr>
</table>` },
  'sw_nature_def': { title:'社會工作本質與特性', content:`<h4>一、定義</h4>
<p>社會工作本質與特性，是指社會工作作為一門助人專業，其核心使命、專業定位與工作特質為何。社工的本質在於透過專業關係、理論知識、價值判斷與資源運用，協助個人、家庭、團體、社區與制度改善失功能與不公平處境，促進社會福祉與社會正義。</p>
<h4>二、核心理論內容</h4>
<h4>（一）社會工作的本質</h4>
<ul>
<li>助人專業：以改善人們的生活困境與社會功能為核心。</li>
<li>人與環境並重：不只看個人內在，也看環境、制度與資源。</li>
<li>價值導向：社工實務受人的尊嚴、社會正義、自決與關懷等價值引導。</li>
<li>實踐導向：社工並非純理論學科，而是需轉化為具體介入行動。</li>
</ul>
<h4>（二）社會工作的特性</h4>
<table>
<tr><th>特性</th><th>內容</th><th>考試辨識</th></tr>
<tr><td>科學性</td><td>有理論知識、評估程序、研究依據與方法系統</td><td>出現研究、評估、證據、方法時較相關</td></tr>
<tr><td>藝術性</td><td>重視關係、實務判斷、直覺、運用自我與臨場拿捏</td><td>出現直覺、關係、同理、運用自我時較相關</td></tr>
<tr><td>專業性</td><td>具知識體系、倫理守則、角色規範、社會認可與制度保障</td><td>出現專業權威、倫理、證照、教育時較相關</td></tr>
</table>
<h4>（三）英格蘭（England）對藝術性的理解</h4>
<ul>
<li>藝術性不等於隨意做事，而是社工在複雜情境中運用專業自我與實務智慧。</li>
<li>常見表現包含：直覺判斷、關係拿捏、彈性介入、累積經驗形成的專業敏感度。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>冷靜客觀的評估屬科學性，不是藝術性核心。</li>
<li>有愛心不等於專業，專業仍需理論、倫理與制度支持。</li>
<li>社工不是只處理情緒問題，也不是只辦福利行政，而是整合人、環境與制度的工作。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>社工本質與特性判斷題</li>
<li>藝術性、科學性、專業性比較題</li>
</ul>` },
  'sw_nature_role': { title:'社會工作角色與功能', content:`<h4>一、定義</h4>
<p>社會工作角色與功能，是指社工在不同服務情境、問題型態與介入目標下，所扮演的專業任務位置與實際工作功能。角色不只是名稱分類，而是反映社工在特定情境下是透過何種方式協助案主、系統與社會產生改變。</p>
<h4>二、核心理論內容</h4>
<table>
<tr><th>角色</th><th>定義</th><th>核心功能</th><th>常見情境</th></tr>
<tr><td>使能者（Enabler）</td><td>協助案主發現能力、增加掌控感與解決問題能力</td><td>增強能力、支持、促進參與</td><td>陪伴案主釐清資源與可行方案</td></tr>
<tr><td>仲介者（Broker）</td><td>連結案主與外在資源、服務或制度</td><td>轉介、媒合、資源連結</td><td>申請福利、轉介機構</td></tr>
<tr><td>倡導者（Advocate）</td><td>代表案主爭取應有權益或推動制度回應</td><td>發聲、爭權、對抗不公平</td><td>協助爭取福利資格、政策權利</td></tr>
<tr><td>調停者（Mediator）</td><td>介入衝突雙方，協助溝通與協商</td><td>協商、修復關係、降低衝突</td><td>家庭衝突、勞資爭議</td></tr>
<tr><td>教育者（Educator）</td><td>提供知識、資訊與技能訓練</td><td>教導、衛教、增進理解</td><td>親職教育、疾病衛教</td></tr>
<tr><td>協調者（Coordinator）</td><td>整合多方服務與系統合作</td><td>資源整合、聯繫、追蹤</td><td>跨專業個案會議、服務網絡整合</td></tr>
</table>
<h4>三、系統性整理</h4>
<ul>
<li>角色題最重要的是看社工「當下在做什麼」。</li>
<li>同一個個案歷程中，社工可能同時或依序扮演多個角色。</li>
</ul>
<h4>四、易混淆觀念</h4>
<table>
<tr><th>概念</th><th>差異</th></tr>
<tr><td>仲介者 vs 倡導者</td><td>仲介重連結服務；倡導重爭取權益</td></tr>
<tr><td>調停者 vs 協調者</td><td>調停處理衝突；協調整合服務</td></tr>
<tr><td>使能者 vs 教育者</td><td>使能重能力發展；教育重知識技能傳遞</td></tr>
</table>
<h4>五、常見考法</h4>
<ul>
<li>情境角色判斷題</li>
<li>功能對應題</li>
</ul>` },
  'sw_nature_generalist': { title:'綜融式社會工作', content:`<h4>一、定義</h4>
<p>綜融式社會工作（Generalist Social Work）是指社工以整體觀點理解問題，能在個人、家庭、團體、組織、社區與制度等不同層次中，依需求靈活運用多種理論、方法與角色進行介入的工作模式。其核心不是樣樣略懂，而是強調多層次評估、整合性介入與彈性運用專業功能。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>整體性：將個案問題放入人與環境、多系統互動中理解。</li>
<li>多層次：可在微視（Micro）、中介（Mezzo）、鉅視（Macro）層次工作。</li>
<li>多角色：依情境扮演使能者、仲介者、倡導者、教育者、協調者等角色。</li>
<li>整合性：結合實務、研究與政策，不侷限單一技術。</li>
</ul>
<h4>三、理論架構整理</h4>
<table>
<tr><th>面向</th><th>綜融式社工重點</th></tr>
<tr><td>問題理解</td><td>從人與環境互動、多系統脈絡出發</td></tr>
<tr><td>介入層次</td><td>個人、家庭、團體、社區、制度</td></tr>
<tr><td>角色運用</td><td>依問題需求彈性轉換</td></tr>
<tr><td>專業觀</td><td>強調整合，不是單一治療專門化</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>綜融式社工不等於沒有專業深度，而是強調整合與轉換能力。</li>
<li>綜融式社工不只做個案工作，而是涵蓋不同系統層次。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>綜融式社工特徵判斷題</li>
<li>微視／中介／鉅視層次應用題</li>
</ul>` },
  'sw_nature_professional': { title:'專業關係與專業化', content:`<h4>一、定義</h4>
<p>專業關係是指社工與案主之間基於服務目的、專業角色、倫理規範與明確界線所建立的助人關係；專業化則是指社會工作逐步建立知識體系、教育制度、倫理規範、專業文化、社會認可與法律制度，從而形成專業身份的歷程。</p>
<h4>二、核心理論內容</h4>
<h4>（一）專業關係的特性</h4>
<ul>
<li>有目的性：關係建立是為了促進案主福祉與改變。</li>
<li>有界線性：不同於私人關係，需維持角色與權力界線。</li>
<li>有責任性：社工需為其判斷、紀錄與行動負責。</li>
<li>有倫理規範：包含保密、自決、非剝削、適當距離等。</li>
</ul>
<h4>（二）專業化要素</h4>
<table>
<tr><th>要素</th><th>內容</th></tr>
<tr><td>系統性理論</td><td>有可傳授與發展的知識基礎</td></tr>
<tr><td>專業權威</td><td>社會承認其專業判斷之正當性</td></tr>
<tr><td>社區認可</td><td>獲得制度與社會授權</td></tr>
<tr><td>倫理守則</td><td>形成專業共同規範</td></tr>
<tr><td>專業文化</td><td>共享語言、價值、角色認同與專業社群</td></tr>
</table>
<h4>三、易混淆觀念</h4>
<ul>
<li>專業關係不是沒有情感，而是情感需受專業目的與界線規範。</li>
<li>專業化不只等於考上證照，也包含教育、倫理、組織與法制。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>專業關係與私人關係比較題</li>
<li>Greenwood 專業特質題</li>
</ul>` },
  'sw_theory': { title:'社會工作理論與應用', content:`<h4>一、核心概念</h4>
<p>社會工作理論與應用主分類主要處理：社工如何理解問題、如何形成介入邏輯、如何從不同理論取向中選擇合適的助人方式。理論不是單純名詞辨識，而是反映對人、問題、環境、改變機制與社工角色的不同理解。</p>
<h4>二、理論架構整理</h4>
<table>
<tr><th>理論群</th><th>核心焦點</th></tr>
<tr><td>心理暨社會派</td><td>人在情境中、心理與社會環境整合評估</td></tr>
<tr><td>認知行為理論</td><td>認知、情緒與行為之間的關聯</td></tr>
<tr><td>問題解決派</td><td>具體問題、短期目標與實際任務</td></tr>
<tr><td>生態系統理論</td><td>人與環境互動、多層次系統</td></tr>
<tr><td>增權與倡導取向</td><td>權力、壓迫、資源控制與參與</td></tr>
<tr><td>女性主義與批判視角</td><td>父權、差異、結構不平等與權力分析</td></tr>
<tr><td>其他新興理論</td><td>復原力、敘事、社會建構、靈性等</td></tr>
</table>
<h4>三、系統性整理</h4>
<ul>
<li>理論題最核心的判斷是：問題被看成什麼、改變靠什麼發生、社工介入焦點在哪裡。</li>
<li>同一個個案可從不同理論理解，但各理論強調的改變機制並不相同。</li>
</ul>
<h4>四、重要比較</h4>
<table>
<tr><th>比較主題</th><th>A</th><th>B</th><th>差異</th></tr>
<tr><td>認知行為 vs 心理動力</td><td>重現在的認知與行為</td><td>重過去經驗與潛意識</td><td>問題來源與介入焦點不同</td></tr>
<tr><td>系統理論 vs 生態系統理論</td><td>系統結構與互動</td><td>人與環境適配</td><td>後者更凸顯環境脈絡</td></tr>
<tr><td>增權 vs 傳統矯治</td><td>看見壓迫與權力</td><td>偏個人修正</td><td>前者更強調參與與結構改變</td></tr>
</table>` },
  'sw_theory_psychosocial': { title:'心理暨社會派', content:`<h4>一、定義</h4>
<p>心理暨社會派（Psychosocial Approach）是社會工作理論中強調「人在情境中（Person-in-Situation）」的重要取向，主張個案的問題、需求與功能表現，必須同時從個人心理歷程與外在社會情境加以理解，而不能只以內在病理或單一環境因素解釋。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>人在情境中：個人的情緒、行為、人際關係與生活功能，皆受其所處情境影響。</li>
<li>雙重評估：同時評估心理狀態、人格特質、過去經驗與家庭、角色、社會關係等。</li>
<li>重視功能：關心個案如何在日常生活中因應壓力、維持角色與社會關係。</li>
<li>重視關係：社工與案主關係本身即為重要介入媒介。</li>
</ul>
<h4>三、系統整理</h4>
<table>
<tr><th>分析面向</th><th>內容</th></tr>
<tr><td>個人內在</td><td>情緒、認知、防衛、人格特徵</td></tr>
<tr><td>社會情境</td><td>家庭、角色、工作、文化與壓力事件</td></tr>
<tr><td>介入焦點</td><td>幫助理解、調適與改善功能</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>心理暨社會派不是只看心理，也不是只看環境，而是兩者整合。</li>
<li>與功能派相比，其重點在於情境與心理整合分析，而非機構功能與案主意志本身。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>「人在情境中」概念題</li>
<li>心理與環境整合判斷題</li>
</ul>` },
  'sw_theory_cbt': { title:'認知行為理論', content:`<h4>一、定義</h4>
<p>認知行為理論（Cognitive Behavioral Theory, CBT）是指一種主張個體的情緒、行為與適應困難，與其認知信念、思考方式與學習經驗密切相關的理論取向。其核心在於：改變不適應的認知與行為模式，可促進情緒調節與問題解決能力。</p>
<h4>二、核心理論內容</h4>
<h4>（一）認知、情緒、行為三者關聯</h4>
<ul>
<li>認知影響情緒與行為。</li>
<li>錯誤或僵化信念可能導致負向情緒與不適應行為。</li>
<li>改變認知，可連動改變情緒與行為反應。</li>
</ul>
<h4>（二）重要取向</h4>
<table>
<tr><th>取向</th><th>重點</th></tr>
<tr><td>貝克（Aaron Beck）認知治療</td><td>重視自動化思考、認知扭曲與核心信念</td></tr>
<tr><td>艾里斯（Albert Ellis）理情行為治療</td><td>重視非理性信念與 ABC 模式</td></tr>
</table>
<h4>（三）常見技術</h4>
<ul>
<li>認知重建（Cognitive Restructuring）</li>
<li>行為練習（Behavioral Rehearsal）</li>
<li>自我監測（Self-Monitoring）</li>
<li>暴露（Exposure）與增強（Reinforcement）</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>CBT 重視現在問題與可操作改變，不以潛意識分析為主。</li>
<li>CBT 雖重認知，但並非忽略行為，而是認知與行為並重。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>ABC 模式概念題</li>
<li>認知扭曲、非理性信念辨識題</li>
</ul>` },
  'sw_theory_problem': { title:'問題解決派', content:`<h4>一、定義</h4>
<p>問題解決派是社會工作理論中以具體問題、短期目標、實務可操作性與行動導向為特色的一群模式，包括問題解決模式（Problem-Solving Model）、任務中心模式（Task-Centered Model）、危機處遇（Crisis Intervention）與焦點解決短期治療（Solution-Focused Brief Therapy）等。其共同核心在於：不以抽象人格改造為主，而是聚焦當前可辨識問題、資源與行動。</p>
<h4>二、核心理論內容</h4>
<h4>（一）問題解決模式</h4>
<ul>
<li>重視個案面對生活任務與問題時的因應能力。</li>
<li>強調問題辨識、資源運用與解決步驟。</li>
</ul>
<h4>（二）任務中心模式（Task-Centered Model）</h4>
<ul>
<li>聚焦案主認定且願意處理的具體問題。</li>
<li>強調短期、有時限、契約與任務執行。</li>
<li>不以深層人格重整為優先目標。</li>
</ul>
<h4>（三）危機處遇（Crisis Intervention）</h4>
<ul>
<li>聚焦突發事件造成的功能失衡。</li>
<li>重視立即性、短期性與穩定化。</li>
<li>目標在恢復危機前或可接受功能水準。</li>
</ul>
<h4>（四）焦點解決短期治療（Solution-Focused Brief Therapy）</h4>
<ul>
<li>聚焦解方而非問題成因。</li>
<li>強調例外經驗、成功經驗、奇蹟問句與量尺問句。</li>
<li>相信案主是改變的專家，已有部分解決能力。</li>
</ul>
<h4>三、比較整理</h4>
<table>
<tr><th>模式</th><th>焦點</th><th>特色</th></tr>
<tr><td>任務中心</td><td>具體問題與任務</td><td>短期、有時限、行動明確</td></tr>
<tr><td>危機處遇</td><td>突發事件與功能失衡</td><td>立即穩定與支持</td></tr>
<tr><td>焦點解決</td><td>例外與未來解方</td><td>不深究成因，強調可行改變</td></tr>
</table>
<h4>四、常見考法</h4>
<ul>
<li>短期模式比較題</li>
<li>奇蹟問句、量尺問句辨識題</li>
</ul>` },
  'sw_theory_eco': { title:'生態系統理論', content:`<h4>一、定義</h4>
<p>生態系統理論（Ecological Systems Theory）是指一種整合性理論觀點，強調個人（Individual）與其所處環境（Environment）之間存在持續性的動態交互作用（Reciprocal Interaction），並以人與環境適配（Person-Environment Fit, P-E Fit）為核心分析單位，主張個體之行為表現、適應狀態與問題形成，係由個人需求（Needs）、能力（Competence）與環境資源（Resources）、要求（Demands）之間的匹配或失衡共同決定。</p>
<h4>二、核心理論內容</h4>
<h4>（一）人－環境系統觀（Person-in-Environment Perspective, PIE）</h4>
<ul>
<li>個體不能脫離環境單獨理解。</li>
<li>評估焦點不只在個人心理，也包括家庭、學校、社區、制度與文化。</li>
<li>問題形成是個人與環境互動的結果，而非單一內在缺陷。</li>
</ul>
<h4>（二）動態交互作用（Reciprocal Interaction）</h4>
<ul>
<li>環境會影響個體：如提供支持、形成壓力、限制機會。</li>
<li>個體也會影響環境：如透過行為、互動、角色表現改變系統反應。</li>
<li>此種關係具有持續回饋（Feedback）性，而非單向因果。</li>
</ul>
<h4>（三）人與環境適配（Person-Environment Fit, P-E Fit）</h4>
<table>
<tr><th>適配軸線</th><th>內容</th></tr>
<tr><td>需求（Needs） vs 資源（Resources）</td><td>個體需要的支持是否能被環境滿足</td></tr>
<tr><td>能力（Competence） vs 要求（Demands）</td><td>個體能力是否足以回應環境期待</td></tr>
</table>
<ul>
<li>適配良好時，個體較能維持穩定功能與正向適應。</li>
<li>適配失衡時，可能產生壓力、失功能、角色困難或社會適應問題。</li>
</ul>
<h4>（四）多層次環境系統</h4>
<table>
<tr><th>層次</th><th>說明</th><th>例子</th></tr>
<tr><td>微觀系統（Microsystem）</td><td>個體直接互動的場域</td><td>家庭、學校、同儕</td></tr>
<tr><td>中介系統（Mesosystem）</td><td>不同微觀系統之間的關聯</td><td>家庭與學校合作</td></tr>
<tr><td>外在系統（Exosystem）</td><td>個體未直接參與但會受影響的系統</td><td>父母職場、社區資源</td></tr>
<tr><td>宏觀系統（Macrosystem）</td><td>制度、文化、政策與價值規範</td><td>社會政策、文化信念</td></tr>
</table>
<h4>（五）壓力－因應－適應歷程</h4>
<ul>
<li>壓力（Stress）來自要求超過能力或需求無法被資源回應。</li>
<li>因應（Coping）是個體回應壓力的方式。</li>
<li>適應（Adaptation）是人與環境互動調整後的結果。</li>
<li>社工介入可同時作用於個人能力、環境資源與系統協調。</li>
</ul>
<h4>三、易混淆觀念</h4>
<table>
<tr><th>比較</th><th>差異</th></tr>
<tr><td>生態系統理論 vs 系統理論</td><td>前者更強調人與環境適配，後者較重系統結構與互動</td></tr>
<tr><td>生態系統理論 vs 心理動力理論</td><td>前者重現在的環境脈絡，後者重內在衝突與過去經驗</td></tr>
</table>
<h4>四、常見考法</h4>
<ul>
<li>P-E Fit 概念題</li>
<li>系統層次判斷題</li>
<li>情境中的問題來源與介入方向題</li>
</ul>` },
  'sw_theory_empower': { title:'增權與倡導取向', content:`<h4>一、定義</h4>
<p>增權與倡導取向是指一種將案主處境放入權力關係、社會壓迫與資源分配不均脈絡中理解的社工觀點。其核心主張是：弱勢困境不應只被視為個人缺陷，而應看到制度性排除、結構性不平等與權力失衡。社工的任務在於協助案主獲得控制感、參與感、資源取得能力與集體行動力量。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>問題觀：看見壓迫（Oppression）、邊緣化與社會排除。</li>
<li>力量觀：案主本身具有潛在力量與經驗知識，不是被動接受者。</li>
<li>工作目標：提升能力、擴大參與、促進權利實現與制度改變。</li>
</ul>
<h4>三、三層面整理</h4>
<table>
<tr><th>層面</th><th>內容</th></tr>
<tr><td>個人層面</td><td>提升自我效能、知識、決策與控制感</td></tr>
<tr><td>人際層面</td><td>建立支持網絡、互助關係與集體力量</td></tr>
<tr><td>政治層面</td><td>參與倡議、社會行動與制度改變</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>增權不等於社工把權力給案主，而是協助案主辨識與運用自身力量。</li>
<li>倡導不只是幫忙說話，而是與權利、制度與結構改革有關。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>壓迫與權力題</li>
<li>優勢觀點、增權觀點比較題</li>
</ul>` },
  'sw_theory_feminist': { title:'女性主義與批判視角', content:`<h4>一、定義</h4>
<p>女性主義與批判視角是指一群從性別、權力、階級、文化與社會結構不平等出發的社工理論取向。其核心在於批判父權體制、看見個人困境背後的社會結構壓迫，並主張透過意識提升、權力反思、平等關係與制度改變來促進社會正義。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>個人即政治（The Personal is Political）：個人經驗反映社會與政治結構。</li>
<li>批判父權：性別不平等不是自然結果，而是社會建構與制度安排。</li>
<li>去專家化：強調與案主建立較平等、合作性的專業關係。</li>
<li>重視差異：不同女性、不同群體的處境不應被單一經驗取代。</li>
</ul>
<h4>三、派別整理</h4>
<table>
<tr><th>派別</th><th>核心重點</th></tr>
<tr><td>自由女性主義（Liberal Feminism）</td><td>重視法律與機會平等</td></tr>
<tr><td>激進女性主義（Radical Feminism）</td><td>批判父權是壓迫核心</td></tr>
<tr><td>社會主義女性主義（Socialist Feminism）</td><td>結合性別與階級壓迫</td></tr>
<tr><td>後現代女性主義（Postmodern Feminism）</td><td>重視差異、多元與反單一論述</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>女性主義不只是談女性，而是關注性別化權力與結構不平等。</li>
<li>批判視角不只在批評，而是促進反思與改變。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>父權與個人即政治概念題</li>
<li>不同女性主義派別比較題</li>
</ul>` },
  'sw_theory_other': { title:'其他新興理論', content:`<h4>一、定義</h4>
<p>其他新興理論，是指除傳統主流理論外，近代社會工作逐漸重視的補充或轉向性理論，包括復原力（Resilience）、優勢觀點（Strengths Perspective）、社會建構（Social Constructionism）、敘事取向（Narrative Approach）、靈性觀點（Spirituality）與文化敏感取向等。其共同特色在於：較少以病理缺陷為中心，而更重視意義、資源、主體性與文化脈絡。</p>
<h4>二、核心理論內容</h4>
<table>
<tr><th>理論</th><th>核心重點</th></tr>
<tr><td>復原力（Resilience）</td><td>看見逆境中的恢復與保護因子</td></tr>
<tr><td>優勢觀點（Strengths Perspective）</td><td>聚焦能力、資源與可能性</td></tr>
<tr><td>社會建構（Social Constructionism）</td><td>現實與問題意義透過語言與互動建構</td></tr>
<tr><td>敘事取向（Narrative Approach）</td><td>透過重寫故事鬆動問題主導的身分</td></tr>
<tr><td>靈性觀點（Spirituality）</td><td>納入信念、價值與生命意義資源</td></tr>
</table>
<h4>三、易混淆觀念</h4>
<ul>
<li>優勢觀點不是否認問題，而是避免只用缺陷框架理解案主。</li>
<li>社會建構與敘事取向都重視語言，但敘事更強調故事重寫與外化問題。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>理論特色辨識題</li>
<li>優勢、復原力、敘事比較題</li>
</ul>` },
  'sw_ethics': { title:'社會工作哲學與倫理', content:`<h4>一、核心概念</h4>
<p>社會工作哲學與倫理主分類處理的是：社工在實務中依據何種價值判準做決定、當價值衝突出現時如何進行倫理思考，以及專業規範如何界定可接受與不可接受的行動。其重點不只在記住守則條文，而在於掌握倫理原則背後的專業邏輯。</p>
<h4>二、理論架構整理</h4>
<table>
<tr><th>面向</th><th>內容</th></tr>
<tr><td>價值體系</td><td>社工核心價值、倫理哲學基礎</td></tr>
<tr><td>倫理規範</td><td>專業守則、責任、業務過失</td></tr>
<tr><td>倫理兩難</td><td>自決、保密、保護生命、公共利益衝突</td></tr>
</table>
<h4>三、系統性整理</h4>
<ul>
<li>價值是社工判斷的基礎，倫理規範是價值的制度化表現，倫理兩難則是實務中的衝突場域。</li>
<li>倫理題不在於理想口號，而在於風險、權力、責任與選擇排序。</li>
</ul>
<h4>四、重要比較</h4>
<table>
<tr><th>比較主題</th><th>A</th><th>B</th><th>差異</th></tr>
<tr><td>自決 vs 父權主義</td><td>尊重案主選擇</td><td>以保護之名限制選擇</td><td>重點在風險與正當性</td></tr>
<tr><td>界線跨越 vs 界線侵犯</td><td>不必然有害</td><td>具有剝削或傷害性</td><td>後者屬倫理問題較大</td></tr>
</table>` },
  'sw_ethics_value': { title:'社會工作價值體系', content:`<h4>一、定義</h4>
<p>社會工作價值體系是指社會工作專業共同承認並作為判斷與行動基礎的一組核心價值與倫理信念。其功能在於界定社工工作的方向、專業責任與對案主、社會及制度的基本立場。</p>
<h4>二、核心理論內容</h4>
<h4>（一）美國社工專業人員協會（National Association of Social Workers, NASW）六大核心價值</h4>
<ul>
<li>服務（Service）</li>
<li>社會正義（Social Justice）</li>
<li>人的尊嚴與價值（Dignity and Worth of the Person）</li>
<li>人際關係的重要性（Importance of Human Relationships）</li>
<li>誠信（Integrity）</li>
<li>能力（Competence）</li>
</ul>
<h4>（二）倫理哲學基礎</h4>
<table>
<tr><th>哲學取向</th><th>重點</th><th>社工應用</th></tr>
<tr><td>義務論（Deontology）</td><td>行為是否符合普遍義務與原則</td><td>尊重人格、不可將人當工具</td></tr>
<tr><td>效益主義（Utilitarianism）</td><td>重最大多數最大利益</td><td>資源分配、公共利益考量</td></tr>
<tr><td>關懷倫理學（Ethics of Care）</td><td>重關係、回應與脈絡</td><td>關係敏感、照顧責任</td></tr>
<tr><td>德行倫理學（Virtue Ethics）</td><td>重品格與德性養成</td><td>專業人格與誠信</td></tr>
</table>
<h4>三、易混淆觀念</h4>
<ul>
<li>效率、科學、中立不是 NASW 六大核心價值名稱。</li>
<li>價值不等於技巧；價值是判斷方向，技巧是實務方法。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>六大核心價值題</li>
<li>倫理哲學取向配對題</li>
</ul>` },
  'sw_ethics_code': { title:'專業倫理規範與業務過失', content:`<h4>一、定義</h4>
<p>專業倫理規範是指社工專業共同遵循的行為原則與責任標準，目的在維護服務對象權益、保障專業信任並規範實務行動。業務過失則是指社工在執業過程中違反專業義務、未盡合理注意或從事不當行為，而造成案主權益受損的情形。</p>
<h4>二、核心理論內容</h4>
<h4>（一）倫理規範的重要面向</h4>
<ul>
<li>保密（Confidentiality）</li>
<li>自我決定（Self-Determination）</li>
<li>能力維持（Competence）</li>
<li>適當紀錄與責任</li>
<li>避免剝削與雙重關係傷害</li>
</ul>
<h4>（二）瑞默（Frederic Reamer）常見業務過失類型</h4>
<table>
<tr><th>類型</th><th>內容</th><th>例子</th></tr>
<tr><td>不當行為（Malfeasance）</td><td>主動從事不當或有害行為</td><td>挪用案主金錢、剝削關係</td></tr>
<tr><td>疏失（Misfeasance）</td><td>執行原本該做之事，但方式不當</td><td>錯誤處遇造成傷害</td></tr>
<tr><td>失職（Nonfeasance）</td><td>未履行應有專業責任</td><td>該通報卻未通報</td></tr>
</table>
<h4>三、易混淆觀念</h4>
<ul>
<li>不是只有違法才算業務過失，違反專業注意義務也可能構成問題。</li>
<li>倫理守則除了禁止不當行為，也要求積極維持能力與責任。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>業務過失分類題</li>
<li>倫理責任判斷題</li>
</ul>` },
  'sw_ethics_dilemma': { title:'倫理兩難與抉擇', content:`<h4>一、定義</h4>
<p>倫理兩難（Ethical Dilemma）是指社工在實務中面臨兩項以上重要價值、責任或義務彼此衝突，無法同時完全滿足的情境。其核心不在於找出完美答案，而在於辨識衝突價值、評估風險、排序優先性，並做出具專業正當性的決定。</p>
<h4>二、核心理論內容</h4>
<h4>（一）常見衝突類型</h4>
<ul>
<li>自我決定（Self-Determination） vs 保護生命與安全</li>
<li>保密（Confidentiality） vs 法定通報與他人安全</li>
<li>個人利益 vs 公共利益</li>
<li>專業界線 vs 在地人際壓力</li>
</ul>
<h4>（二）判斷邏輯</h4>
<ul>
<li>先確認是否涉及立即生命危險或重大傷害風險。</li>
<li>辨識法律義務與專業責任。</li>
<li>評估權力不對等與可能傷害。</li>
<li>在必要時進行督導、倫理諮詢與完整紀錄。</li>
</ul>
<h4>（三）父權主義（Paternalism）</h4>
<ul>
<li>指以保護案主為理由，限制其自主選擇。</li>
<li>社工實務中需評估其必要性、比例性與最少侵害原則。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>自決不是絕對無限制。</li>
<li>保密不是在任何情況下都不能揭露。</li>
<li>雙重關係不是一概違反倫理，但需高度審慎評估。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>倫理排序題</li>
<li>保密例外與通報責任題</li>
</ul>` },
  'sw_practice': { title:'社會工作實務領域', content:`<h4>一、核心概念</h4>
<p>社會工作實務領域主分類處理的是：社工在不同服務對象、場域與社會議題中，應掌握的核心價值、問題觀與工作重點。此處不是只分服務人口，而是要看各領域背後的理論取向與實務原則，例如兒少強調兒童最佳利益、老人強調在地老化、身障強調社會模式等。</p>
<h4>二、理論架構整理</h4>
<table>
<tr><th>領域</th><th>核心取向</th></tr>
<tr><td>家庭與兒童</td><td>以家庭為中心、兒童最佳利益</td></tr>
<tr><td>青少年</td><td>優勢觀點、外展工作</td></tr>
<tr><td>婦女</td><td>充能、意識化、性別平等</td></tr>
<tr><td>老人</td><td>在地老化、連續照顧</td></tr>
<tr><td>身心障礙</td><td>社會模式、權利保障</td></tr>
<tr><td>醫務與精神</td><td>心理社會調適、復元、個案管理</td></tr>
<tr><td>學校與職業</td><td>生態整合、權益與支持</td></tr>
<tr><td>司法與多元文化</td><td>修復式司法、文化能力與文化謙遜</td></tr>
</table>
<h4>三、系統性整理</h4>
<ul>
<li>實務領域題最常考的是「該領域最核心的工作原則」而非細節流程。</li>
<li>若能掌握每個領域的問題觀與價值立場，多數選擇題可快速判斷。</li>
</ul>
<h4>四、重要比較</h4>
<table>
<tr><th>比較主題</th><th>A</th><th>B</th><th>差異</th></tr>
<tr><td>兒少保護 vs 家庭維繫</td><td>安全優先</td><td>維持家庭功能</td><td>前者偏保護介入，後者偏支持原家庭</td></tr>
<tr><td>醫務社工 vs 精神社工</td><td>疾病調適、醫療體系</td><td>復元、社區生活與個管</td><td>場域與介入焦點不同</td></tr>
</table>` },
  'sw_practice_family': { title:'家庭與兒童社會工作', content:`<h4>一、定義</h4>
<p>家庭與兒童社會工作是指以家庭系統與兒童福祉為核心的社工實務領域，重視家庭功能、親職能力、兒童安全、發展需求與權益保障。其核心在於兼顧兒童最佳利益（Best Interests of the Child）與家庭支持，並在保護與維繫之間進行專業判斷。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>以家庭為中心（Family-Centered）：將家庭視為介入重點，而非只看單一兒童問題。</li>
<li>兒童最佳利益：任何處遇決定需以兒童安全、發展與權益為優先。</li>
<li>家庭維繫（Family Preservation）：優先提供支持，使兒童得以在原生家庭安全成長。</li>
<li>家庭重整（Family Reunification）：在安置後協助恢復家庭功能，促進返家可能。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>以家庭為中心不代表忽略兒童個別需求。</li>
<li>家庭維繫不是在任何情況下都避免移除，若安全受威脅仍須保護安置。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>兒童最佳利益題</li>
<li>家庭維繫與保護安置比較題</li>
</ul>` },
  'sw_practice_youth': { title:'青少年社會工作', content:`<h4>一、定義</h4>
<p>青少年社會工作是指針對青少年在發展任務、家庭關係、同儕互動、教育適應、風險行為與社會參與等面向提供支持與介入的實務領域。其核心重點在於以優勢觀點看待青少年，重視參與、關係建立與外展工作，而非只用控制與矯正框架理解其行為。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>優勢觀點（Strengths Perspective）：看見青少年的能力、韌力與可能性。</li>
<li>外展工作（Outreach Work）：社工主動進入青少年生活場域接觸，如街頭、社區、網路場域。</li>
<li>參與與培力：支持青少年表達意見、參與決策與形成自我效能。</li>
<li>發展取向：理解青少年行為需放入認同發展、同儕文化與成長任務脈絡。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>外展工作不是等待服務對象上門。</li>
<li>青少年工作不等於只處理偏差行為，也包含支持發展與社會參與。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>外展工作定義題</li>
<li>優勢觀點情境題</li>
</ul>` },
  'sw_practice_women': { title:'婦女社會工作', content:`<h4>一、定義</h4>
<p>婦女社會工作是以女性處境、性別權力關係、照顧負荷、經濟依賴、暴力經驗與社會不平等為重點的實務領域。其核心取向強調充能（Empowerment）、性別意識與結構分析，協助服務對象看見問題不只是個人失敗，而與父權制度、勞動分工與社會資源配置有關。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>充能取向：提升控制感、決策能力與資源掌握。</li>
<li>意識化：協助理解個人經驗與性別壓迫的連結。</li>
<li>權益與安全：特別重視暴力、經濟、就業與照顧責任議題。</li>
<li>結構倡導：不只支持個人，也關注制度改變。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>充能與意識化概念題</li>
<li>性別壓迫的結構分析題</li>
</ul>` },
  'sw_practice_elderly': { title:'老人社會工作', content:`<h4>一、定義</h4>
<p>老人社會工作是指針對高齡者在健康、失能、退休、社會參與、喪失、照顧需求與家庭支持等面向所進行的實務工作。其核心重點在於維持老年人的尊嚴、自主、社會參與與生活品質，並以在地老化（Aging in Place）與連續照顧為重要原則。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>在地老化：支持長者盡可能在熟悉社區與生活環境中持續生活。</li>
<li>連續照顧：從健康促進、居家、社區式到機構式服務形成連續支持。</li>
<li>成功老化：重視身心功能維持、參與與正向適應。</li>
<li>家庭照顧者支持：協助減輕照顧負荷與壓力。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>機構安置不是老人工作唯一或優先模式。</li>
<li>老人工作不只是照顧服務，也涉及權益倡導與社會參與。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>在地老化概念題</li>
<li>長者服務模式判斷題</li>
</ul>` },
  'sw_practice_disability': { title:'身心障礙者社會工作', content:`<h4>一、定義</h4>
<p>身心障礙者社會工作是以身心障礙者之權利、參與、支持需求與社會處境為核心的實務領域。其關鍵觀點在於從社會模式（Social Model）理解障礙，認為障礙不只是個人損傷，而是由環境障礙、制度排除與社會不友善所共同形成。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>社會模式：障礙的形成與社會環境不當設計、歧視與排除高度相關。</li>
<li>權利取向：強調平等參與、自立生活、合理調整與反歧視。</li>
<li>社區整合：重視去機構化與在社區中生活的支持。</li>
<li>公約觀點：身心障礙者權利公約（Convention on the Rights of Persons with Disabilities, CRPD）是重要基礎。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>醫療模式偏向個人缺陷與矯治；社會模式則強調環境與制度改變。</li>
<li>照顧不等於控制，重點在支持與權利保障。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>社會模式 vs 醫療模式比較題</li>
<li>CRPD 核心精神題</li>
</ul>` },
  'sw_practice_medical': { title:'醫務與精神照護社會工作', content:`<h4>一、定義</h4>
<p>醫務與精神照護社會工作是指在醫療院所、精神健康體系與相關照護服務中，針對疾病、失能、心理壓力、社會角色改變與社區生活支持所提供的社工服務。其核心在於處理疾病與處境所帶來的心理社會調適問題，並整合醫療、家庭、福利與社區資源。</p>
<h4>二、核心理論內容</h4>
<table>
<tr><th>領域</th><th>核心取向</th><th>重點</th></tr>
<tr><td>醫務社工</td><td>心理社會調適</td><td>疾病適應、家庭壓力、醫療資源與出院準備</td></tr>
<tr><td>精神社工</td><td>復元（Recovery）與個案管理</td><td>社區生活、支持網絡、功能恢復與權利</td></tr>
</table>
<ul>
<li>醫務社工重視病人與家屬面對疾病時的心理、社會與實際資源議題。</li>
<li>精神社工不只看症狀管理，也重視社區整合、復元與生活功能。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>醫務社工不是醫療診斷角色，而是心理社會支持與資源整合角色。</li>
<li>精神社工不是單純控制行為，而是促進復元與社區生活支持。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>心理社會調適題</li>
<li>復元與個案管理概念題</li>
</ul>` },
  'sw_practice_school': { title:'學校與職業社會工作', content:`<h4>一、定義</h4>
<p>學校與職業社會工作是指在教育與勞動場域中，針對學生、家庭、教師、勞工及職場體系所進行的社會工作實務。其核心在於從生態系統觀點理解個體與制度互動，並在適應、支持、權益與資源整合之間發揮功能。</p>
<h4>二、核心理論內容</h4>
<h4>（一）學校社工</h4>
<ul>
<li>從家庭、學校、同儕與社區等多系統理解學生問題。</li>
<li>重視家校合作、就學適應、保護議題與資源轉介。</li>
<li>與輔導教師、教師、家長及外部系統協作。</li>
</ul>
<h4>（二）職業社工</h4>
<ul>
<li>重視勞工權益、工作適應、職災支持與員工協助。</li>
<li>協助連結職場、家庭、福利與心理支持系統。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>學校社工不是取代輔導老師，而是與教育系統分工合作。</li>
<li>職業社工不是只站在雇主立場，而是兼顧勞工福祉與權益。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>學校社工角色題</li>
<li>勞工權益與支持題</li>
</ul>` },
  'sw_practice_justice': { title:'司法與多元文化社會工作', content:`<h4>一、定義</h4>
<p>司法與多元文化社會工作是指在司法體系、犯罪被害與加害處遇、文化差異處境與跨文化服務情境中，所進行的社會工作實務。其核心在於同時處理責任、修復、權利、差異、文化脈絡與權力關係。</p>
<h4>二、核心理論內容</h4>
<h4>（一）司法社工</h4>
<ul>
<li>重視修復式司法（Restorative Justice），強調修復傷害、責任承擔與關係重建。</li>
<li>關注加害人、被害人與社區三方的參與。</li>
<li>介入重點不只在懲罰，而在處遇、支持與社會復歸。</li>
</ul>
<h4>（二）多元文化社工</h4>
<ul>
<li>文化能力（Cultural Competence）：發展理解與回應差異的能力。</li>
<li>文化謙遜（Cultural Humility）：持續反思自己的文化位置與權力。</li>
<li>反壓迫實務：避免以主流價值作為唯一標準評價案主。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>修復式司法不是只強調和解，而是處理傷害、責任與關係修復。</li>
<li>文化能力不等於背文化知識清單，仍需反思權力與偏見。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>修復式司法概念題</li>
<li>文化能力 vs 文化謙遜比較題</li>
</ul>` },
  'sw_practice_work': { title:'職業社會工作', content:`<h4>一、定義</h4>
<p>職業社會工作是指在工作場域、勞動體系與職業生活脈絡中，針對勞工之就業適應、職災、壓力、家庭工作平衡、福利與權益進行支持與介入的社工實務。其核心在於從勞工福祉與社會支持觀點，處理工作與生活系統間的互動問題。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>勞工權益保障：關注勞動條件、安全、補償、就業權利。</li>
<li>工作適應支持：處理職災、復工、職場壓力與人際互動問題。</li>
<li>員工協助：結合心理、家庭與福利支持。</li>
<li>制度連結：與企業、勞政、醫療與福利系統合作。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>勞工支持與權益題</li>
<li>職災與復工情境題</li>
</ul>` },
  'sw_practice_other': { title:'多元文化與其他實務議題', content:`<h4>一、定義</h4>
<p>多元文化與其他實務議題，是指在新住民、跨文化家庭、成年監護、跨專業合作、社會排除與多元身份處境等服務情境中，社工需具備之跨文化敏感度、反壓迫觀點與整合服務能力。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>文化差異需放入歷史、權力與制度處境理解。</li>
<li>服務中需避免文化本位主義與同化式期待。</li>
<li>跨專業合作時需清楚角色、界線與責任分工。</li>
<li>成年監護、保護與自主之間常涉及倫理兩難與法律判斷。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>文化敏感與文化偏見題</li>
<li>跨專業合作角色題</li>
</ul>` }
});



// ==================== 社會工作直接服務（ds）與社會政策與立法（sp）A版筆記覆寫 ====================
Object.assign(NOTES, {
  'ds': { title:'社會工作直接服務 — 本科目重點筆記總覽', content:`
<h4>一、本科目整體架構</h4>
<p>社會工作直接服務主要由三大方法構成：<strong>個案工作、團體工作、社區工作</strong>。這三者雖然服務單位不同，但共同核心都是：<strong>透過專業關係、計畫性介入與方法運用，促進個人、群體或社區的改變</strong>。</p>
<p>讀這一科時，可以先用「服務單位」來定位：一對一或家庭多半是個案工作；兩人以上並以團體互動為媒介的是團體工作；以地理或共同議題社群為單位、強調組織與集體改變的，則是社區工作。</p>
<h4>二、三大方法之間的關係</h4>
<table>
<tr><th>方法</th><th>主要服務單位</th><th>核心媒介</th><th>主要目標</th></tr>
<tr><td>個案工作（Casework）</td><td>個人、家庭</td><td>專業關係與面談</td><td>改善個人社會功能、處理具體問題</td></tr>
<tr><td>團體工作（Group Work）</td><td>小型團體</td><td>團體動力與互動</td><td>促進成員成長、支持或完成任務</td></tr>
<tr><td>社區工作（Community Work）</td><td>社區、組織、居民</td><td>參與、組織、動員</td><td>提升社區能力、改善資源與結構</td></tr>
</table>
<h4>三、本科命題重點</h4>
<ul>
<li><strong>個案工作：</strong>Biestek 七原則、個案工作過程、面談技術、倫理界線。</li>
<li><strong>團體工作：</strong>團體類型、團體發展階段、領導技術、保密與成員保護。</li>
<li><strong>社區工作：</strong>Rothman 三模式、社區分析、需求評估、社區組織與動員。</li>
</ul>
<div class="hl">這科最常見的失分點，不是概念完全不會，而是把三種方法的工作媒介與目標搞混。例如把團體工作寫成個案會談、把社區工作寫成單純辦活動，都是常見錯法。</div>
` },

  'ds_casework': { title:'個案工作 — 主分類重點筆記', content:`
<h4>一、核心概念</h4>
<p>個案工作（Casework）是以個人或家庭為服務單位，透過專業關係、面談、評估與計畫性介入，協助案主處理問題、恢復或提升社會功能的方法。其核心不是替案主做決定，而是在關係中協助其理解問題、運用資源與發展能力。</p>
<h4>二、理論架構整理</h4>
<ul>
<li><strong>工作基礎：</strong>專業關係、面談、評估、計畫、介入、評估、結案。</li>
<li><strong>核心原則：</strong>Biestek 七原則是最常考的個案工作倫理與關係基礎。</li>
<li><strong>介入重點：</strong>理解案主處境、形成工作目標、使用技巧推動改變。</li>
</ul>
<h4>三、系統性整理</h4>
<p>個案工作最重要的不是背流程名稱，而是理解每一階段都在回答不同問題：<strong>接案是能不能工作、預估是問題是什麼、計畫是要怎麼做、介入是怎麼改變、評估是有沒有成效、結案是如何結束與轉銜</strong>。</p>
<h4>四、比較</h4>
<table>
<tr><th>比較面向</th><th>個案工作</th><th>團體工作</th></tr>
<tr><td>主要媒介</td><td>社工與案主的專業關係</td><td>團體互動與團體動力</td></tr>
<tr><td>工作焦點</td><td>個人或家庭問題</td><td>成員互動、共同目標</td></tr>
<tr><td>主要技術</td><td>面談、澄清、同理、對質</td><td>連結、阻斷、催化、帶領團體歷程</td></tr>
</table>
` },

  'ds_case_concept': { title:'個案工作基本概念', content:`
<h4>一、定義</h4>
<p>個案工作（Casework）是指社會工作者以個人或家庭為服務單位，透過專業關係（professional relationship）、有目的的面談、系統性預估與計畫性介入，協助案主理解問題、調整情緒、連結資源、提升能力，進而改善其社會功能與生活適應的直接服務方法。</p>
<h4>二、核心理論內容</h4>
<h4>（一）個案工作的基本假設</h4>
<ul>
<li>每位案主都是獨特的個體，不能套用同一種標準化處理方式。</li>
<li>案主的問題不能只看表面行為，需放入其生活情境、關係與資源脈絡理解。</li>
<li>專業關係本身就是改變的重要媒介，不只是資訊交換工具。</li>
<li>社工的工作不是替代案主，而是協助案主運用其自身與環境資源。</li>
</ul>
<h4>（二）歷史發展重點</h4>
<ul>
<li>個案工作與慈善組織會社（COS）及個別訪視、個別調查的歷史發展有關。</li>
<li>瑪麗．芮奇蒙（Mary Richmond）在《社會診斷（Social Diagnosis）》中奠定個案工作的評估與診斷基礎。</li>
<li>後續逐漸發展出診斷學派、功能學派、心理暨社會學派等不同理論取向。</li>
</ul>
<h4>（三）個案工作的核心功能</h4>
<ul>
<li>協助案主表達與整理問題。</li>
<li>促進案主理解自己與處境。</li>
<li>提升適應能力與問題解決能力。</li>
<li>連結正式與非正式資源。</li>
<li>協助案主在生活環境中恢復或提升功能。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>面向</th><th>重點</th></tr>
<tr><td>服務單位</td><td>個人、夫妻、家庭</td></tr>
<tr><td>工作媒介</td><td>專業關係、面談</td></tr>
<tr><td>核心目標</td><td>改善社會功能、處理問題、發展能力</td></tr>
<tr><td>基本特色</td><td>個別化、計畫性、倫理導向</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>個案工作不是只有諮商，也包含資源連結、環境調整與制度協調。</li>
<li>個案工作不是單純聊天，而是有目的、有紀錄、有目標的專業互動。</li>
<li>個案工作不等於心理治療；社工可能運用治療性技巧，但工作範圍更廣。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>個案工作的定義與功能題。</li>
<li>Mary Richmond 與個案工作發展題。</li>
<li>個案工作和心理治療、團體工作之比較題。</li>
</ul>
` },

  'ds_case_theory': { title:'個案工作實施理論', content:`
<h4>一、定義</h4>
<p>個案工作實施理論，是指社工在進行個案工作時，用來理解案主問題形成、專業關係建立與介入方向選擇的理論基礎。它不只是學派名稱的羅列，而是實際影響社工如何看待案主、如何形成處遇與如何使用技巧。</p>
<h4>二、核心理論內容</h4>
<h4>（一）Biestek 七原則</h4>
<ul>
<li><strong>個別化（Individualization）：</strong>每位案主都應被視為獨特個體。</li>
<li><strong>有目的的情感表達（Purposeful Expression of Feelings）：</strong>允許案主安全地表達情緒。</li>
<li><strong>控制的情緒涉入（Controlled Emotional Involvement）：</strong>社工以有意識、適度的情感回應案主。</li>
<li><strong>接納（Acceptance）：</strong>接納案主的整體狀態，而非認同所有行為。</li>
<li><strong>非評判態度（Non-judgmental Attitude）：</strong>不以道德標準責備或羞辱案主。</li>
<li><strong>案主自決（Client Self-determination）：</strong>尊重案主在能力範圍內做決定。</li>
<li><strong>保密（Confidentiality）：</strong>對案主資訊負有保密責任，但有法定與安全例外。</li>
</ul>
<h4>（二）常見個案工作理論取向</h4>
<ul>
<li><strong>心理暨社會取向：</strong>強調人在情境中，兼顧內在心理與社會處境。</li>
<li><strong>問題解決取向：</strong>聚焦案主當前問題與解決歷程。</li>
<li><strong>任務中心模式：</strong>強調短期、具體、可操作的問題與任務。</li>
<li><strong>認知行為取向：</strong>重視信念、思考與行為改變。</li>
<li><strong>生態系統觀點：</strong>看人與環境的互動與適配。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>理論或原則</th><th>核心重點</th></tr>
<tr><td>Biestek 七原則</td><td>個案工作關係與倫理的基礎</td></tr>
<tr><td>心理暨社會取向</td><td>人在情境中</td></tr>
<tr><td>任務中心模式</td><td>短期、具體、任務導向</td></tr>
<tr><td>認知行為取向</td><td>改變認知與行為</td></tr>
<tr><td>生態系統觀點</td><td>人與環境適配</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>接納不是無條件認同案主所有行為。</li>
<li>非評判態度不是沒有判斷力，而是不以道德羞辱案主。</li>
<li>自決不是完全放任，遇重大風險時仍需專業判斷。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>Biestek 七原則配對題。</li>
<li>不同個案工作理論的比較題。</li>
<li>情境題判斷何種原則被違反。</li>
</ul>
` },

  'ds_case_process': { title:'個案工作過程', content:`
<h4>一、定義</h4>
<p>個案工作過程，是指社工自接觸案主開始，到結束服務為止的一連串有計畫、可追蹤、可評估的專業歷程。其核心在於讓服務不流於零碎與直覺，而能依問題性質、工作目標與案主需求有步驟地推進。</p>
<h4>二、核心理論內容</h4>
<h4>（一）接案（Intake）</h4>
<ul>
<li>確認案主是否符合服務資格與需求。</li>
<li>建立初步關係與安全感。</li>
<li>釐清主訴問題與服務期待。</li>
</ul>
<h4>（二）預估（Assessment）</h4>
<ul>
<li>蒐集個人、家庭、社會關係、資源與風險資料。</li>
<li>形成對問題的專業理解。</li>
<li>辨識優勢、限制與可用資源。</li>
</ul>
<h4>（三）計畫（Planning）</h4>
<ul>
<li>與案主共同訂定目標。</li>
<li>決定工作重點、方法與資源安排。</li>
<li>確認短程與長程工作方向。</li>
</ul>
<h4>（四）介入（Intervention）</h4>
<ul>
<li>使用面談技巧、資源連結、家庭工作、協調等方法推動改變。</li>
<li>依服務進展調整工作策略。</li>
</ul>
<h4>（五）評估（Evaluation）</h4>
<ul>
<li>檢視工作目標是否達成。</li>
<li>評估介入是否有效、是否需調整。</li>
</ul>
<h4>（六）結案（Termination）</h4>
<ul>
<li>整理服務歷程與改變。</li>
<li>處理分離感受與未完成議題。</li>
<li>必要時安排追蹤或轉介。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>階段</th><th>主要問題</th></tr>
<tr><td>接案</td><td>能不能工作、案主需要什麼</td></tr>
<tr><td>預估</td><td>問題是什麼、原因與資源為何</td></tr>
<tr><td>計畫</td><td>要怎麼做、先做什麼</td></tr>
<tr><td>介入</td><td>實際如何推動改變</td></tr>
<tr><td>評估</td><td>是否有效、要不要修正</td></tr>
<tr><td>結案</td><td>如何結束與銜接</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>預估不是診斷貼標籤，而是理解問題與資源。</li>
<li>計畫不是社工單方面決定，應包含案主參與。</li>
<li>結案不等於案主完全沒有問題，而是工作階段告一段落。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>流程排序題。</li>
<li>各階段功能辨識題。</li>
<li>情境題判斷目前工作位於哪個階段。</li>
</ul>
` },

  'ds_case_skill': { title:'個案工作技術', content:`
<h4>一、定義</h4>
<p>個案工作技術，是指社工在面談與服務歷程中，用來建立關係、蒐集資訊、促進理解、支持改變與推進目標的具體方法。技術不是為了表現專業，而是為了更有效地回應案主需要。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>同理心（Empathy）：</strong>理解案主主觀感受與處境，並讓案主感受到被理解。</li>
<li><strong>積極傾聽（Active Listening）：</strong>專注接收案主訊息，包含語言與非語言內容。</li>
<li><strong>澄清（Clarification）：</strong>協助案主把模糊、混亂或矛盾內容說清楚。</li>
<li><strong>反映（Reflection）：</strong>回映案主情緒或內容，幫助其自我理解。</li>
<li><strong>對質（Confrontation）：</strong>指出案主言行、想法或感受中的不一致，促進覺察。</li>
<li><strong>再框架（Reframing）：</strong>用新的意義與觀點理解經驗，鬆動僵固詮釋。</li>
<li><strong>摘要（Summarization）：</strong>整理重點，幫助聚焦與過渡。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>技術</th><th>功能</th></tr>
<tr><td>同理</td><td>建立關係與安全感</td></tr>
<tr><td>澄清</td><td>讓問題更清楚</td></tr>
<tr><td>對質</td><td>促進覺察矛盾</td></tr>
<tr><td>再框架</td><td>改變詮釋角度</td></tr>
<tr><td>摘要</td><td>整理與聚焦</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>同理不是附和或認同，而是理解。</li>
<li>對質不是責備或羞辱，而是有技巧地指出不一致。</li>
<li>開放式問句通常較有助於表達；雙重問句容易造成混亂。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>面談語句判斷是哪種技巧。</li>
<li>何種問句較佳的判斷題。</li>
<li>對質與澄清、反映的比較題。</li>
</ul>
` },

  'ds_case_ethics': { title:'個案工作倫理', content:`
<h4>一、定義</h4>
<p>個案工作倫理，是指社工在個案服務過程中，依專業價值與倫理原則，處理保密、自決、專業界線、權力差異與責任義務等議題的規範與判斷基礎。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>保密（Confidentiality）：</strong>案主資訊原則上應受到保護，但在法定通報、自傷他傷、重大危險等情況可能有例外。</li>
<li><strong>自我決定（Self-determination）：</strong>尊重案主在能力範圍內做選擇，但非無限制。</li>
<li><strong>專業界線（Professional Boundaries）：</strong>避免因情感、利益或角色混淆而損害案主。</li>
<li><strong>雙重關係（Dual Relationship）：</strong>應盡量避免造成權力濫用、利益衝突或依賴。</li>
<li><strong>知情同意（Informed Consent）：</strong>案主應清楚了解服務內容、限制與可能風險。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>倫理議題</th><th>核心問題</th></tr>
<tr><td>保密</td><td>何時可揭露、揭露多少</td></tr>
<tr><td>自決</td><td>何時尊重、何時保護優先</td></tr>
<tr><td>界線</td><td>何種互動可能傷害專業關係</td></tr>
<tr><td>知情同意</td><td>案主是否真正理解服務內容</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>保密不是絕對原則。</li>
<li>自決不是放任案主承受重大危險。</li>
<li>界線跨越不一定等於界線侵犯，但都需審慎評估。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>保密例外題。</li>
<li>雙重關係情境題。</li>
<li>自決與保護衝突的倫理兩難題。</li>
</ul>
` },

  'ds_group': { title:'團體工作 — 主分類重點筆記', content:`
<h4>一、核心概念</h4>
<p>團體工作（Group Work）是以團體作為改變媒介，透過成員之間的互動、支持、挑戰與共同歷程，促進個人成長、問題解決、社會化或任務完成的社工方法。也就是說，團體工作的重點不只在帶團者做了什麼，更在於團體內部互動如何發生效果。</p>
<h4>二、理論架構整理</h4>
<ul>
<li><strong>團體類型：</strong>支持、治療、成長、教育、任務等不同目標。</li>
<li><strong>團體動力：</strong>凝聚力、規範、角色、溝通與權力關係。</li>
<li><strong>團體過程：</strong>前期形成、中期發展、後期結束，各階段任務不同。</li>
<li><strong>領導者技術：</strong>連結、阻斷、催化、摘要、示範等。</li>
</ul>
<h4>三、比較</h4>
<table>
<tr><th>比較面向</th><th>團體工作</th><th>個案工作</th></tr>
<tr><td>主要單位</td><td>團體</td><td>個人、家庭</td></tr>
<tr><td>改變媒介</td><td>團體互動與團體動力</td><td>專業關係與面談</td></tr>
<tr><td>工作重點</td><td>成員彼此影響、共同歷程</td><td>個別化處理</td></tr>
</table>
` },

  'ds_group_concept': { title:'團體工作基本概念', content:`
<h4>一、定義</h4>
<p>團體工作（Group Work）是指社會工作者以團體作為服務媒介，透過有計畫的團體組成、互動設計與過程帶領，使成員在彼此互動中獲得支持、學習、覺察、改變或共同完成任務的直接服務方法。</p>
<h4>二、核心理論內容</h4>
<h4>（一）團體工作的基本假設</h4>
<ul>
<li>團體本身具有改變力量，成員之間的互動可以帶來支持、回饋與學習。</li>
<li>個人問題有時透過群體情境更容易被理解與處理。</li>
<li>團體中的規範、角色、凝聚力與溝通方式會影響工作成效。</li>
</ul>
<h4>（二）常見團體類型</h4>
<table>
<tr><th>類型</th><th>目標</th></tr>
<tr><td>治療性團體</td><td>處理情緒、行為或關係問題</td></tr>
<tr><td>支持性團體</td><td>提供陪伴、支持與經驗分享</td></tr>
<tr><td>成長性團體</td><td>促進自我探索與潛能發展</td></tr>
<tr><td>教育性團體</td><td>傳遞知識與技能</td></tr>
<tr><td>任務性團體</td><td>完成工作或決策任務</td></tr>
</table>
<h4>（三）團體動力重點</h4>
<ul>
<li>團體凝聚力（Cohesion）</li>
<li>團體規範（Norms）</li>
<li>成員角色（Roles）</li>
<li>溝通模式與權力分布</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>團體工作不是把很多個案放在同一個房間而已，而是要善用團體互動。</li>
<li>支持性團體與治療性團體可能重疊，但目標與深度不同。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>團體類型辨識題。</li>
<li>團體動力概念題。</li>
<li>個案工作與團體工作的比較題。</li>
</ul>
` },

  'ds_group_theory': { title:'團體工作實施理論', content:`
<h4>一、定義</h4>
<p>團體工作實施理論，是指社工在設計與帶領團體時，用來理解成員互動、團體發展、改變機制與領導風格的理論基礎。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>團體動力理論：</strong>強調團體中的角色、規範、權力與互動如何影響成員與團體目標。</li>
<li><strong>系統觀點：</strong>把團體視為一個系統，成員彼此影響，整體大於部分總和。</li>
<li><strong>社會學習觀點：</strong>成員透過觀察、模仿與回饋學習新行為。</li>
<li><strong>治療性因素：</strong>如普同性、灌注希望、利他、互相學習、情緒宣洩等。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>理論焦點</th><th>重點</th></tr>
<tr><td>團體動力</td><td>規範、角色、權力、凝聚力</td></tr>
<tr><td>系統觀點</td><td>成員互相影響</td></tr>
<tr><td>社會學習</td><td>觀察、模仿、回饋</td></tr>
<tr><td>治療性因素</td><td>支持、希望、分享、覺察</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>團體帶領不是只有管理秩序，更是引導歷程與互動。</li>
<li>團體成效不只來自領導者，也來自成員彼此影響。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>團體動力概念題。</li>
<li>治療性因素辨識題。</li>
<li>領導風格與理論對應題。</li>
</ul>
` },

  'ds_group_process': { title:'團體工作過程與階段', content:`
<h4>一、定義</h4>
<p>團體工作過程，是指團體從開始形成、發展互動、深化工作到結束分離的整體歷程。不同階段有不同任務，社工需依階段調整帶領方式。</p>
<h4>二、核心理論內容</h4>
<h4>（一）Garland 等人的五階段</h4>
<ul>
<li><strong>前身階段（Pre-affiliation）：</strong>成員試探、觀望、評估是否安全。</li>
<li><strong>權力與控制階段（Power and Control）：</strong>成員測試界線、挑戰領導者、爭取位置。</li>
<li><strong>親密階段（Intimacy）：</strong>信任提高，能較深分享經驗與情緒。</li>
<li><strong>差異化階段（Differentiation）：</strong>成員能在團體中展現差異與自主性。</li>
<li><strong>分離階段（Separation）：</strong>處理結束、失落、回顧與轉化。</li>
</ul>
<h4>（二）各階段任務</h4>
<table>
<tr><th>階段</th><th>領導者任務</th></tr>
<tr><td>前身</td><td>建立安全、說明目的與規範</td></tr>
<tr><td>權力與控制</td><td>處理衝突、界線與角色</td></tr>
<tr><td>親密</td><td>深化分享與互助</td></tr>
<tr><td>差異化</td><td>促進自主、承接差異</td></tr>
<tr><td>分離</td><td>總結、告別、轉銜</td></tr>
</table>
<h4>三、易混淆觀念</h4>
<ul>
<li>有衝突不一定代表失敗，權力與控制階段本來就常出現試探與挑戰。</li>
<li>結束階段不只是說再見，也要整理成長與未完成情緒。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>團體階段排序題。</li>
<li>情境判斷目前處於哪個階段。</li>
<li>各階段領導者任務題。</li>
</ul>
` },

  'ds_group_skill': { title:'團體工作技術', content:`
<h4>一、定義</h4>
<p>團體工作技術，是指領導者在團體進行中，用來促進互動、維持安全、整理焦點、處理衝突與推進目標的具體帶領方法。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>連結（Linking）：</strong>把不同成員的經驗、情緒或想法串連起來。</li>
<li><strong>阻斷（Blocking）：</strong>適時停止傷害性、離題或壓迫性的互動。</li>
<li><strong>催化（Facilitating）：</strong>促進成員參與、表達與互動。</li>
<li><strong>摘要（Summarizing）：</strong>整理團體重點，幫助聚焦。</li>
<li><strong>示範（Modeling）：</strong>領導者以自身示範互動方式與回應態度。</li>
</ul>
<h4>三、領導風格</h4>
<table>
<tr><th>風格</th><th>特色</th></tr>
<tr><td>民主式</td><td>鼓勵參與與共同決定</td></tr>
<tr><td>權威式</td><td>由領導者高度主導</td></tr>
<tr><td>放任式</td><td>介入較少，結構較鬆散</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>阻斷不是壓制表達，而是保護團體安全與工作焦點。</li>
<li>連結不是替成員發言，而是讓成員看到彼此經驗的關聯。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>領導者回應語句判斷技術類型。</li>
<li>領導風格比較題。</li>
<li>團體凝聚力與技術運用題。</li>
</ul>
` },

  'ds_group_ethics': { title:'團體工作倫理', content:`
<h4>一、定義</h4>
<p>團體工作倫理，是指在團體服務中，社工需處理保密、知情同意、成員安全、權力差異與界線維護等議題的專業規範。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>保密：</strong>領導者需說明保密原則，但也要提醒團體中的保密無法像個案工作那樣完全控制。</li>
<li><strong>知情同意：</strong>成員應知道團體目的、方式、規則、風險與限制。</li>
<li><strong>成員保護：</strong>避免羞辱、霸凌、污名或不當揭露。</li>
<li><strong>篩選與準備：</strong>並非每個人都適合所有團體，必要時需先評估適配性。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>保密不是只靠領導者承諾，也需建立團體規範。</li>
<li>團體中的自願參與與退出權也屬倫理議題。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>團體保密限制題。</li>
<li>成員保護與界線題。</li>
<li>知情同意題。</li>
</ul>
` },

  'ds_community': { title:'社區工作 — 主分類重點筆記', content:`
<h4>一、核心概念</h4>
<p>社區工作（Community Work）是以社區、居民或共同議題群體為服務單位，透過組織、參與、分析、資源動員與集體行動，促進社區問題解決、能力提升與制度改變的社工方法。</p>
<h4>二、理論架構整理</h4>
<ul>
<li><strong>社區基本概念：</strong>社區不是只有地理範圍，也包含共同關係、認同與互動。</li>
<li><strong>實施模式：</strong>Rothman 三模式最常考。</li>
<li><strong>工作過程：</strong>社區分析、需求評估、組織與動員、方案推動、評估。</li>
<li><strong>關鍵概念：</strong>社會資本、社區能力、社區充能、居民參與。</li>
</ul>
<h4>三、比較</h4>
<table>
<tr><th>模式</th><th>重點</th><th>社工角色</th></tr>
<tr><td>地方發展</td><td>居民參與與社區能力</td><td>使能者、協調者</td></tr>
<tr><td>社會計畫</td><td>問題分析與專業規劃</td><td>專家、分析者</td></tr>
<tr><td>社會行動</td><td>權力改變與社會正義</td><td>倡導者、組織者</td></tr>
</table>
` },

  'ds_comm_concept': { title:'社區工作基本概念', content:`
<h4>一、定義</h4>
<p>社區工作（Community Work）是指社工以社區、地區、組織或共同議題群體為服務單位，透過居民參與、社區分析、資源整合、組織動員與集體行動，促進社區能力提升、問題解決與社會環境改善的直接服務方法。</p>
<h4>二、核心理論內容</h4>
<h4>（一）社區的意義</h4>
<ul>
<li>社區可以是地理性的，例如某個村里、社區住宅區。</li>
<li>社區也可以是功能性或共同議題性的，例如身障家長團體、移工社群。</li>
<li>社區包含人、關係、資源、認同與互動，不只是地圖上的範圍。</li>
</ul>
<h4>（二）社區工作的核心概念</h4>
<ul>
<li><strong>社區能力（Community Capacity）：</strong>社區成員共同解決問題與行動的能力。</li>
<li><strong>社會資本（Social Capital）：</strong>信任、互助、網絡與合作關係。</li>
<li><strong>居民參與：</strong>社區改變不是替居民做，而是與居民一起做。</li>
<li><strong>社區充能（Community Empowerment）：</strong>增強社區自我決定與集體行動能力。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>概念</th><th>重點</th></tr>
<tr><td>社區</td><td>範圍、關係、認同與共同利益</td></tr>
<tr><td>社會資本</td><td>信任、互助、網絡</td></tr>
<tr><td>社區能力</td><td>共同解決問題的能力</td></tr>
<tr><td>居民參與</td><td>社區工作成效的核心條件</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>社區工作不是只辦活動，而是透過活動建立組織與改變能力。</li>
<li>社區不一定是固定地理範圍，也可能是共享議題的群體。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>社區定義題。</li>
<li>社會資本與社區能力概念題。</li>
<li>居民參與的重要性題。</li>
</ul>
` },

  'ds_comm_model': { title:'社區工作實施模式', content:`
<h4>一、定義</h4>
<p>社區工作實施模式，是指社工在面對不同社區問題、資源分布與權力結構時，所選擇的工作路線與策略架構。其中最常考的是 Rothman 的三大模式。</p>
<h4>二、核心理論內容</h4>
<h4>（一）地方發展模式（Locality Development）</h4>
<ul>
<li>重視居民參與、共識形成與社區凝聚。</li>
<li>相信社區有能力共同改善問題。</li>
<li>社工角色偏使能者、協調者。</li>
</ul>
<h4>（二）社會計畫模式（Social Planning）</h4>
<ul>
<li>重視資料分析、專業規劃與技術性解決。</li>
<li>常用在複雜服務系統、福利規劃、需求評估。</li>
<li>社工角色偏專家、研究者、分析者。</li>
</ul>
<h4>（三）社會行動模式（Social Action）</h4>
<ul>
<li>重視權力不平等、資源分配不公與結構改變。</li>
<li>策略可能包含組織、倡導、動員與衝突。</li>
<li>社工角色偏倡導者、組織者。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>模式</th><th>主要目標</th><th>策略</th><th>社工角色</th></tr>
<tr><td>地方發展</td><td>建立社區能力</td><td>參與、合作、共識</td><td>使能者、協調者</td></tr>
<tr><td>社會計畫</td><td>解決社會問題</td><td>分析、規劃、技術</td><td>專家、分析者</td></tr>
<tr><td>社會行動</td><td>改變權力結構</td><td>動員、倡導、衝突</td><td>倡導者、組織者</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>地方發展不是沒有計畫，而是重點放在參與和共識。</li>
<li>社會行動不是單純製造衝突，而是為了回應不平等權力結構。</li>
<li>社會計畫不是只有寫計畫書，而是以資料與專業規劃解決問題。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>Rothman 三模式比較題。</li>
<li>情境題判斷較符合哪一種模式。</li>
<li>社工角色與模式配對題。</li>
</ul>
` },

  'ds_comm_process': { title:'社區工作過程與技術', content:`
<h4>一、定義</h4>
<p>社區工作過程與技術，是指社工在社區場域中，從理解社區、辨識問題、動員居民、整合資源到推動行動與評估成果的一連串方法與技巧。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>社區分析：</strong>了解人口結構、資源、權力關係、文化脈絡與主要議題。</li>
<li><strong>需求評估：</strong>辨識居民實際需要與優先順序，不只看專家認定。</li>
<li><strong>組織與動員：</strong>促進居民參與、建立行動團隊與網絡合作。</li>
<li><strong>資源盤點：</strong>包含正式資源與非正式資源。</li>
<li><strong>方案推動與評估：</strong>從計畫到執行，再回到成效檢視。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>步驟</th><th>重點</th></tr>
<tr><td>分析</td><td>看見社區現況與問題結構</td></tr>
<tr><td>評估</td><td>確認需求與優先性</td></tr>
<tr><td>動員</td><td>組織居民與資源</td></tr>
<tr><td>行動</td><td>推動計畫與改變</td></tr>
<tr><td>評估</td><td>檢視成效與修正</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>需求評估不是只問居民想要什麼，也要看客觀資料與結構條件。</li>
<li>資源盤點不只看政府方案，也要看社區內部網絡與非正式支持。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>社區分析與需求評估題。</li>
<li>工作流程排序題。</li>
<li>技術與步驟配對題。</li>
</ul>
` },

  'ds_comm_issue': { title:'社區工作實施議題', content:`
<h4>一、定義</h4>
<p>社區工作實施議題，是指社工在社區場域中常面對的核心實務主題，例如社區發展、社區照顧、社區充能、居民參與困難、權力不平等與跨系統合作等。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>社區發展：</strong>透過居民參與與在地行動提升社區生活品質與能力。</li>
<li><strong>社區照顧：</strong>讓居民在社區中獲得支持、照顧與參與，而非完全依賴機構。</li>
<li><strong>社區充能：</strong>強化社區自主決定與集體行動能力。</li>
<li><strong>權力與排除：</strong>社區並非完全平等，常有資源分配與代表性問題。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>社區照顧不是把照顧責任全部丟回家庭，而是建立在地支持網絡。</li>
<li>社區充能不是社工代替社區發聲，而是協助社區形成自己的聲音與力量。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>社區發展與社區照顧概念題。</li>
<li>居民參與與社區充能題。</li>
<li>權力不平等情境題。</li>
</ul>
` },

  'sp': { title:'社會政策與立法 — 本科目重點筆記總覽', content:`
<h4>一、本科目整體架構</h4>
<p>社會政策與立法可分成兩大主軸：<strong>社會政策</strong>與<strong>社會立法</strong>。社會政策是在處理「國家如何理解社會問題、如何分配福利、用什麼理念推動制度」；社會立法則是在處理「這些福利與權利，如何透過具體法律被規範、保障與執行」。</p>
<p>因此讀這一科時，要先分清楚：題目是在問<strong>理念／模式／意識形態</strong>，還是在問<strong>法條內容／制度規範／適用條件</strong>。前者偏政策，後者偏立法。</p>
<h4>二、三大主分類關係</h4>
<ul>
<li><strong>社會政策：</strong>處理福利國家理念、福利模式、政策形成與福利輸送。</li>
<li><strong>主要六個立法：</strong>是社工師考試中最核心、最常出現的法規。</li>
<li><strong>其餘各法：</strong>雖然較零散，但常以細節題、數字題、條件題出現。</li>
</ul>
<h4>三、命題重點</h4>
<ul>
<li>意識形態與福利模式比較，例如社會民主、新自由主義、第三條路。</li>
<li>Titmuss 三模式、Esping-Andersen 三種福利國家體制。</li>
<li>社會保險與社會救助、普及式與選擇式之比較。</li>
<li>老人福利法、兒少法、身障法、家暴法、社會救助法、社工師法等六法核心規定。</li>
<li>長照法、國民年金法、志願服務法、性別與兒少相關法規等補充法規。</li>
</ul>
<div class="hl">本科最容易失分的地方，在於把「政策概念」和「法律規定」混在一起。讀的時候要一直提醒自己：這題是在問理念，還是在問法條。</div>
` },

  'sp_policy': { title:'社會政策 — 主分類重點筆記', content:`
<h4>一、核心概念</h4>
<p>社會政策（Social Policy）是在討論國家如何面對貧窮、失業、失能、老化、兒少保護、家庭照顧等社會問題，並透過制度、資源分配與福利輸送來回應人民需求。簡單說，它是在回答：<strong>國家要不要管、管多少、怎麼管、用什麼價值去管</strong>。</p>
<h4>二、理論架構整理</h4>
<ul>
<li><strong>意識形態：</strong>不同政治與福利理念，會影響國家介入程度。</li>
<li><strong>福利模式：</strong>不同學者對福利國家與福利制度的分類方式。</li>
<li><strong>政策過程：</strong>政策從形成到執行，不只是立法而已。</li>
<li><strong>福利輸送：</strong>包含現金、實物、服務與稅式支出等方式。</li>
</ul>
<h4>三、比較</h4>
<table>
<tr><th>面向</th><th>社會政策</th><th>社會立法</th></tr>
<tr><td>核心內容</td><td>理念、模式、制度方向</td><td>具體法律規範與適用條件</td></tr>
<tr><td>常見題型</td><td>比較題、概念題</td><td>細節題、條文題、數字題</td></tr>
<tr><td>讀法</td><td>理解與比較</td><td>整理與記憶</td></tr>
</table>
` },

  'sp_policy_ideology': { title:'福利意識形態與模式', content:`
<h4>一、定義</h4>
<p>福利意識形態與模式，是指不同政治哲學與福利觀如何看待國家責任、市場角色、個人責任與社會平等，並進一步形成不同福利制度安排的理論分類。</p>
<h4>二、核心理論內容</h4>
<h4>（一）主要福利意識形態</h4>
<table>
<tr><th>意識形態</th><th>核心觀點</th></tr>
<tr><td>社會民主</td><td>主張較高程度國家介入、普及福利與社會平等</td></tr>
<tr><td>新自由主義</td><td>強調市場效率、小政府、個人責任與選擇式福利</td></tr>
<tr><td>第三條路</td><td>強調社會投資、就業能力、權利與責任並重</td></tr>
</table>
<h4>（二）Titmuss 三模式</h4>
<ul>
<li><strong>殘補式模式（Residual Model）：</strong>家庭與市場失靈後，國家才介入。</li>
<li><strong>工業成就績效模式（Industrial Achievement-Performance Model）：</strong>福利與工作績效、職位、貢獻連動。</li>
<li><strong>制度再分配模式（Institutional Redistributive Model）：</strong>社會福利是正常制度安排，重視普及與再分配。</li>
</ul>
<h4>（三）Esping-Andersen 三種福利國家體制</h4>
<table>
<tr><th>體制</th><th>代表特徵</th></tr>
<tr><td>自由主義</td><td>市場主導、選擇式、去商品化低</td></tr>
<tr><td>保守主義／統合主義</td><td>重家庭、職業身分、社會保險</td></tr>
<tr><td>社會民主</td><td>普及、高再分配、去商品化高</td></tr>
</table>
<h4>三、易混淆觀念</h4>
<ul>
<li>第三條路不是傳統社會民主，也不是純新自由主義，而是強調社會投資與就業。</li>
<li>殘補式不是沒有福利，而是把福利放在最後介入位置。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>不同福利模式比較題。</li>
<li>Titmuss 與 Esping-Andersen 分類題。</li>
<li>意識形態與政策主張配對題。</li>
</ul>
` },

  'sp_policy_process': { title:'政策過程與輸送', content:`
<h4>一、定義</h4>
<p>政策過程與輸送，是指社會政策從問題形成、議程設定、政策規劃、合法化、執行到評估修正的過程，以及福利如何被實際分配給人民的方式。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>政策過程：</strong>問題辨識、議程設定、政策形成、合法化、執行、評估。</li>
<li><strong>福利輸送方式：</strong>現金給付、實物給付、社會服務、稅式支出。</li>
<li><strong>給付形式比較：</strong>普及式強調全民可近性；選擇式強調資源鎖定。</li>
<li><strong>政策執行：</strong>再好的政策若執行不佳，仍可能產生落差。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>輸送方式</th><th>例子</th></tr>
<tr><td>現金給付</td><td>年金、津貼、補助</td></tr>
<tr><td>實物給付</td><td>餐食、輔具、住宅</td></tr>
<tr><td>社會服務</td><td>居家服務、保護服務、托育</td></tr>
<tr><td>稅式支出</td><td>扣除額、免稅額</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>政策形成不等於立法完成，後面還有執行與評估。</li>
<li>選擇式福利雖較精準，但常伴隨污名與行政成本問題。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>政策過程排序題。</li>
<li>福利輸送類型判斷題。</li>
<li>普及式 vs 選擇式比較題。</li>
</ul>
` },

  'sp_policy_org': { title:'福利組織與資源', content:`
<h4>一、定義</h4>
<p>福利組織與資源，是指社會福利制度中，公部門、民間部門、非營利組織與市場如何分工、合作與競合，以及福利財源、服務供給與治理方式如何安排。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>公部門：</strong>負責規範、保障、資源分配與部分直接服務。</li>
<li><strong>非營利組織（NPO）：</strong>在服務輸送、倡議與社區組織中扮演重要角色。</li>
<li><strong>市場：</strong>在福利混合經濟中可提供部分服務，但可能帶來不平等問題。</li>
<li><strong>新管理主義（New Managerialism）：</strong>強調績效、效率、競爭、契約外包。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>主體</th><th>角色</th></tr>
<tr><td>政府</td><td>制定政策、提供保障、監督</td></tr>
<tr><td>NPO</td><td>服務輸送、倡議、創新</td></tr>
<tr><td>市場</td><td>商品化服務供給</td></tr>
<tr><td>家庭</td><td>非正式照顧與支持</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>外包不等於政府卸責，政府仍有監督與保障責任。</li>
<li>NPO 不是政府，也不等於志工團體而已。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>福利混合經濟題。</li>
<li>新管理主義與契約外包題。</li>
<li>公私協力角色比較題。</li>
</ul>
` },

  'sp_main6': { title:'主要六個立法 — 主分類重點筆記', content:`
<h4>一、主分類定位</h4>
<p>主要六個立法是社工師考試中最核心的法規群，通常包含：<strong>老人福利法、兒童及少年福利與權益保障法、身心障礙者權益保障法、家庭暴力防治法、社會救助法、社會工作師法</strong>。這些法律和社工日常實務高度相關，因此命題頻率高、細節密度也高。</p>
<h4>二、讀法</h4>
<ul>
<li>先抓每一部法的立法目的與服務對象。</li>
<li>再抓核心制度、常考數字、主管機關、社工職責。</li>
<li>最後整理容易混淆的法規差異。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>資格條件題</li>
<li>數字題（年齡、時限、比例）</li>
<li>主管機關與責任分工題</li>
<li>社工職責與法定義務題</li>
</ul>
` },

  'sp_law_elderly': { title:'老人福利法', content:`
<h4>一、定義</h4>
<p>老人福利法是保障老人生活照顧、福利服務、權益維護與社會參與的重要法規。其核心在於回應高齡社會下老人之生活支持、照顧安排與福利需求。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>老人定義：</strong>年滿 65 歲以上之人。</li>
<li><strong>福利內容：</strong>生活照顧、機構服務、家庭照顧者支持、社區照顧與保護服務。</li>
<li><strong>機構類型：</strong>常考安養機構、養護機構與長期照顧機構之差異。</li>
<li><strong>家庭照顧者支持：</strong>喘息、諮詢、訓練與支持服務。</li>
</ul>
<h4>三、條列／表格整理</h4>
<table>
<tr><th>重點</th><th>內容</th></tr>
<tr><td>服務對象</td><td>65 歲以上老人</td></tr>
<tr><td>常考服務</td><td>安養、養護、長照、保護、照顧者支持</td></tr>
<tr><td>重要精神</td><td>尊嚴、安全、照顧與社會參與</td></tr>
</table>
<h4>四、易混淆觀念</h4>
<ul>
<li>老人福利法和長照法有關聯，但不相同；前者範圍更廣，後者更聚焦長期照顧服務。</li>
<li>機構類型不是只看名稱，要看老人自理能力與照顧需求程度。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>老人定義與年齡題。</li>
<li>機構類型比較題。</li>
<li>家庭照顧者支持服務題。</li>
</ul>
` },

  'sp_law_children': { title:'兒童及少年福利與權益保障法', content:`
<h4>一、定義</h4>
<p>兒童及少年福利與權益保障法，是保障兒童及少年生存、保護、發展與參與權利的核心法規，涵蓋托育、保護、安置、收出養、福利服務與權益維護等面向。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>核心精神：</strong>兒童最佳利益、保護與發展並重。</li>
<li><strong>重要制度：</strong>收出養、托育、安置、保護、少年福利與權利保障。</li>
<li><strong>主管機關責任：</strong>規劃兒少福利、保護與發展措施。</li>
<li><strong>社工實務關聯：</strong>保護通報、安置評估、收出養服務、家庭支持。</li>
</ul>
<h4>三、常考細節</h4>
<ul>
<li>主管機關定期調查兒少發展現況。</li>
<li>收出養安排強調漸進接觸與兒少利益。</li>
<li>居家式托育與寄養相關規定常以細節題出現。</li>
</ul>
<h4>四、易混淆觀念</h4>
<ul>
<li>兒少法不只在處理被虐待兒少，也包含一般福利與權利保障。</li>
<li>安置不是唯一答案，家庭支持與保護並行也很重要。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>兒少法適用範圍題。</li>
<li>收出養與安置題。</li>
<li>托育與寄養細節題。</li>
</ul>
` },

  'sp_law_disability': { title:'身心障礙者權益保障法', content:`
<h4>一、定義</h4>
<p>身心障礙者權益保障法，是保障身心障礙者平等參與社會、接受支持、避免歧視與獲得權利實現的重要法規。其精神已從傳統照顧保護，逐步轉向權利保障與社會參與。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>核心精神：</strong>平等參與、權利保障、反歧視。</li>
<li><strong>與 CRPD 關聯：</strong>強調尊嚴、獨立、參與、無障礙、兒童權利等原則。</li>
<li><strong>常考制度：</strong>鑑定與需求評估、保護安置、定額進用、代表比例。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>此法重點不是只有福利補助，更包括教育、就業、無障礙與參與權。</li>
<li>CRPD 的精神不是施捨，而是人權保障。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>保護安置時限題。</li>
<li>CRPD 原則題。</li>
<li>代表比例與制度細節題。</li>
</ul>
` },

  'sp_law_dv': { title:'家庭暴力防治法', content:`
<h4>一、定義</h4>
<p>家庭暴力防治法，是針對家庭成員或特定親密關係間之暴力、控制、傷害與威脅所設計的保護法規，重點在於預防、保護、處遇與權益保障。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>保護令制度：</strong>是本法最常考核心。</li>
<li><strong>社工職責：</strong>通報、保護安置、訪視、協助聲請保護令、資源連結。</li>
<li><strong>服務對象：</strong>不只傳統婚姻家庭，也包含特定親密關係情形。</li>
<li><strong>安全優先：</strong>保護被害人安全是核心原則。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>社工可以協助保護與通報，但不負責逮捕行為人。</li>
<li>家暴法不是只有身體暴力，也涵蓋其他形式的家庭暴力控制。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>保護令效期題。</li>
<li>適用對象與年齡題。</li>
<li>社工角色與責任題。</li>
</ul>
` },

  'sp_law_welfare': { title:'社會救助法', content:`
<h4>一、定義</h4>
<p>社會救助法是國家對經濟弱勢、生活陷入困難者提供最低生活保障與必要救助的重要法規。其核心在於維持基本生存與社會安全，而非獎勵性給付。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>核心精神：</strong>補充性原則（補充家庭、就業與社會保險不足）。</li>
<li><strong>常見對象：</strong>低收入戶、中低收入戶與特殊困境者。</li>
<li><strong>主管機關與審核：</strong>中央與地方分工是常考題。</li>
<li><strong>社工關聯：</strong>資格認定、急難救助、資源連結與生活支持。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>社會救助不是社會保險，前者偏稅收財源與資格審查，後者偏保費與權利義務。</li>
<li>補充性原則不是拒絕幫助，而是表示其他資源優先、不足再補。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>低收入戶與中低收入戶概念題。</li>
<li>主管機關與審核權責題。</li>
<li>補充性原則題。</li>
</ul>
` },

  'sp_law_sw': { title:'社會工作師法', content:`
<h4>一、定義</h4>
<p>社會工作師法是規範社會工作師資格、執業、設立事務所、倫理責任與專業管理的重要法規，是社工專業制度化的重要基礎。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>資格與證照：</strong>規範誰可取得社會工作師資格。</li>
<li><strong>執業管理：</strong>包括執業登記、事務所設立與服務紀錄責任。</li>
<li><strong>專業保障：</strong>社工執行職務時之權益保護與外部協助。</li>
<li><strong>倫理責任：</strong>社工執業需符合專業規範與法定責任。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>有社工背景不等於就是社會工作師，仍須符合法定資格與規範。</li>
<li>社工師法處理的是專業身分與執業，不是一般福利服務內容法。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>事務所設立資格題。</li>
<li>執業紀錄與保存題。</li>
<li>社工執業受侵害時的協助題。</li>
</ul>
` },

  'sp_other': { title:'其餘各法 — 主分類重點筆記', content:`
<h4>一、主分類定位</h4>
<p>其餘各法雖不像主要六法那樣集中，但在考試中很常以「補充細節題」出現，尤其是長照法、國民年金法、志願服務法、性別與兒少相關法規等。</p>
<h4>二、讀法</h4>
<ul>
<li>先抓每部法的保障對象與立法目的。</li>
<li>再記最容易被考的制度細節、數字與例外。</li>
<li>最後整理與主要六法的差別。</li>
</ul>
` },

  'sp_law_ltc': { title:'長期照顧服務法', content:`
<h4>一、定義</h4>
<p>長期照顧服務法是規範長期照顧服務體系、財源、機構管理與服務輸送的重要法規，重點在於回應失能者之持續照顧需求，並建立制度化的長照服務網絡。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>服務對象：</strong>需要長期照顧支持者。</li>
<li><strong>服務內容：</strong>居家、社區、機構與其他長照服務。</li>
<li><strong>財源：</strong>長照特種基金來源是常考重點。</li>
<li><strong>管理：</strong>住宿式機構的保險與管理規定常出題。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>長照財源題。</li>
<li>服務類型題。</li>
<li>機構管理規定題。</li>
</ul>
` },

  'sp_law_pension': { title:'國民年金法', content:`
<h4>一、定義</h4>
<p>國民年金法是針對未納入其他社會保險體系的國民，提供基本老年、身心障礙與遺屬等經濟安全保障的重要法規。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>對象：</strong>未參加其他相關社會保險之國民。</li>
<li><strong>給付：</strong>老年、身心障礙、遺屬等給付。</li>
<li><strong>保費與調整：</strong>月投保金額與指標調整常是考點。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>國民年金不是一般救助津貼，而是具有保險性質的制度安排。</li>
<li>其適用對象需與其他保險制度區分。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>投保對象題。</li>
<li>給付項目題。</li>
<li>月投保金額調整依據題。</li>
</ul>
` },

  'sp_law_volunteer': { title:'志願服務法', content:`
<h4>一、定義</h4>
<p>志願服務法是規範志工服務、運用單位責任、教育訓練、保險與權利義務的重要法規。其精神在於促進無償、自願、公益性的社會參與。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>志工本質：</strong>自願、無償、公益服務。</li>
<li><strong>運用單位責任：</strong>教育訓練、保險、支持與管理。</li>
<li><strong>志工義務：</strong>遵守倫理、接受訓練、維護服務品質。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>志工可以有必要補助，但不等於領薪工作。</li>
<li>志工服務仍有管理與倫理要求，不是完全自由無規範。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>運用單位責任題。</li>
<li>志工權利義務題。</li>
<li>志願服務本質題。</li>
</ul>
` },

  'sp_law_sexual': { title:'性別相關法規', content:`
<h4>一、定義</h4>
<p>性別相關法規，是指保障性別平等、預防性別暴力與回應性侵害、職場性別歧視等問題的法律規範，常見包含性別工作平等法、性侵害犯罪防治法等。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>性別工作平等法：</strong>重視就業平等、性別歧視防治、育嬰留停、哺集乳與托兒設施等。</li>
<li><strong>性侵害犯罪防治法：</strong>重視保護、通報、處遇與司法程序保護。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>性別工作平等法處理的是職場性別平等，不是所有性別議題都歸它管。</li>
<li>性侵害防治相關法規常和家暴法、兒少性剝削法一起考，要注意適用範圍。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>育嬰留職停薪題。</li>
<li>雇主設施設備責任題。</li>
<li>性別平等與性侵害防治概念題。</li>
</ul>
` },

  'sp_law_child2': { title:'兒少相關法規', content:`
<h4>一、定義</h4>
<p>兒少相關法規，是指除兒少法外，針對兒少保護、性剝削防制、特殊境遇家庭支持、兒少未來帳戶等不同議題所設計的補充性法律與制度。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>兒童及少年性剝削防制條例：</strong>重視保護、處遇、司法程序陪同與權益維護。</li>
<li><strong>特殊境遇家庭扶助條例：</strong>針對困境家庭提供經濟與生活支持。</li>
<li><strong>兒少未來教育與發展帳戶：</strong>與弱勢兒少長期發展支持有關。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>不是所有兒少議題都直接回到兒少法，很多會落在特別法規。</li>
<li>特殊境遇家庭條例重點在資格與扶助內容，不是一般性兒少福利服務。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>性剝削程序保護題。</li>
<li>特殊境遇家庭扶助資格與內容題。</li>
<li>兒少相關法規適用範圍題。</li>
</ul>
` },

  'sp_law_other2': { title:'其他各法', content:`
<h4>一、定義</h4>
<p>其他各法通常包含精神衛生法、公益勸募條例等，雖然範圍零散，但和社工實務中的通報、保護、勸募、精神醫療與社區照顧等工作仍密切相關。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>精神衛生法：</strong>與精神照護、保護與社區支持有關。</li>
<li><strong>公益勸募條例：</strong>重視勸募主體資格、用途限制與財務公開。</li>
<li><strong>其他補充法規：</strong>需抓住對象、目的與最常考細節。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>公益勸募並非任何單位都能辦理，主體資格是常考點。</li>
<li>精神衛生相關法規常與醫療、保護、權利限制一起出題，要注意法定程序。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>公益勸募資格與原則題。</li>
<li>精神衛生法概念題。</li>
<li>其他補充法規細節題。</li>
</ul>
` }
});

// ==================== 人類行為與社會環境（hb）＋社會工作研究法（rm）A版筆記覆寫 ====================
Object.assign(NOTES, {
  'hb': { title:'人類行為與社會環境 — 本科目重點筆記總覽（A版）', content:`
<h4>一、這一科到底在讀什麼</h4>
<p>人類行為與社會環境，不是在背一堆發展學者而已，而是在學：<strong>人為什麼會這樣想、這樣做、這樣發展，以及這些發展如何受到家庭、文化、階級、制度與生命歷程影響</strong>。所以這一科不能只用背誦方式讀，必須把「理論 → 發展階段 → 社會處境」串起來。</p>
<p>這一科最核心的問題有三個：第一，人的發展有哪些重要理論；第二，不同生命階段有哪些典型任務與危機；第三，性別、族群、階級、家庭與社會結構如何影響人的行為與生活機會。</p>
<h4>二、三大主分類怎麼定位</h4>
<ul>
<li><strong>人類行為發展理論：</strong>重點在學者、核心概念與理論差異。最常考的是 Piaget、Kohlberg、Freud、Erikson、依附理論、家庭系統、生態系統與一般系統理論。</li>
<li><strong>人生發展階段任務與課題：</strong>重點在不同生命階段的主要任務、危機、特徵與易出現的發展議題。</li>
<li><strong>性別、多元化及新興社會議題：</strong>重點在社會差異與結構處境，包括性別、性傾向、種族、階級、家庭型態與社會排除。</li>
</ul>
<h4>三、這一科最常見的命題路徑</h4>
<ul>
<li>學者與理論配對題</li>
<li>發展階段與典型特徵題</li>
<li>概念比較題，例如依附 vs 認同、成功老化 vs 退出理論</li>
<li>多元文化與社會結構題，例如種族主義、社會排除、貧窮理論</li>
<li>家庭與社會系統題，例如家庭生命週期、家庭系統、生態系統層次</li>
</ul>
<div class="hl">讀這科時，最重要的不是把所有學者都背得很零碎，而是要建立一條清楚脈絡：<strong>理論在解釋什麼人類行為、適用在哪個發展階段、又和哪些社會環境因素有關</strong>。</div>
` },

  'hb_theory': { title:'人類行為發展理論 — 主分類重點筆記', content:`
<h4>一、這個主分類在學什麼</h4>
<p>這個主分類是在學不同理論如何解釋人的發展與行為。它不是只考你記不記得學者名字，而是考你知不知道：<strong>每個理論是從哪個面向理解人、它強調什麼核心概念、最適合用來解釋哪一類現象</strong>。</p>
<h4>二、四大理論群</h4>
<ul>
<li><strong>認知與道德發展理論：</strong>關注人的思考能力、判斷能力與道德推理如何發展。</li>
<li><strong>心理動力理論：</strong>關注人格形成、潛意識、內在衝突與心理社會危機。</li>
<li><strong>家庭理論：</strong>關注家庭成員之間如何互相影響，家庭如何隨生命週期發展。</li>
<li><strong>社會結構理論：</strong>關注個體如何受到系統、環境、文化、權力與社會結構影響。</li>
</ul>
<h4>三、最常考的判斷方式</h4>
<table>
<tr><th>如果題目出現</th><th>優先想到</th></tr>
<tr><td>自我中心、保留概念、抽象思考</td><td>Piaget 認知發展理論</td></tr>
<tr><td>本我、自我、超我；心理社會危機</td><td>Freud / Erikson</td></tr>
<tr><td>界限、互動、家庭角色、家庭規則</td><td>家庭系統理論</td></tr>
<tr><td>微視系統、鉅視系統、棲位、適應</td><td>生態系統理論</td></tr>
</table>
<div class="wn">這個主分類最容易失分的地方，是把理論只當成名詞背誦。考試真正常問的是「某個現象用哪個理論最能解釋」。</div>
` },

  'hb_theory_cognitive': { title:'認知與道德發展理論', content:`
<h4>一、定義</h4>
<p>認知與道德發展理論，是指探討個體的思考方式、理解世界的方法、判斷對錯的能力，如何隨年齡、經驗與社會互動逐步發展的理論群。</p>
<h4>二、Piaget 認知發展理論（Jean Piaget）</h4>
<p>Piaget 認為兒童不是被動吸收知識，而是透過與環境互動主動建構認知。核心概念包括同化（assimilation）、調適／順應（accommodation）與平衡（equilibration）。</p>
<table>
<tr><th>階段</th><th>年齡</th><th>核心特徵</th></tr>
<tr><td>感覺動作期（sensorimotor stage）</td><td>0-2 歲</td><td>透過感覺與動作認識世界，發展物體恆存（object permanence）</td></tr>
<tr><td>前運思期（preoperational stage）</td><td>2-7 歲</td><td>自我中心（egocentrism）、萬物有靈、缺乏可逆思考</td></tr>
<tr><td>具體運思期（concrete operational stage）</td><td>7-11 歲</td><td>可逆思考、保留概念（conservation）、能做具體邏輯推理</td></tr>
<tr><td>形式運思期（formal operational stage）</td><td>11 歲以上</td><td>抽象思考、假設演繹、系統性推理</td></tr>
</table>
<h4>三、Kohlberg 道德發展理論（Lawrence Kohlberg）</h4>
<p>Kohlberg 將道德發展分成三層次六階段，重點不在選了什麼，而在於「為什麼這樣判斷」。</p>
<ul>
<li><strong>前習俗期（preconventional level）：</strong>以避免懲罰、獲得獎賞為主。</li>
<li><strong>習俗期（conventional level）：</strong>以獲得他人認可、維持社會秩序為主。</li>
<li><strong>後習俗期（postconventional level）：</strong>以社會契約、普遍倫理原則進行判斷。</li>
</ul>
<h4>四、Vygotsky 社會文化理論（Lev Vygotsky）</h4>
<p>Vygotsky 強調認知發展離不開社會互動與文化脈絡。最重要概念是近側發展區（zone of proximal development, ZPD）與鷹架（scaffolding）。也就是說，兒童在他人支持下，可以完成自己單獨做不到的任務。</p>
<h4>五、易混淆觀念</h4>
<ul>
<li>Piaget 強調個體主動建構與成熟階段；Vygotsky 更強調社會互動與文化支持。</li>
<li>Kohlberg 在考的是道德推理結構，不是道德內容本身。</li>
<li>保留概念屬具體運思期，不是前運思期。</li>
</ul>
<h4>六、常見考法</h4>
<ul>
<li>年齡與階段配對題</li>
<li>自我中心、保留概念、抽象思考判斷題</li>
<li>Kohlberg 六階段層次題</li>
<li>Vygotsky 的鷹架與 ZPD 概念題</li>
</ul>
` },

  'hb_theory_psycho': { title:'心理動力理論', content:`
<h4>一、定義</h4>
<p>心理動力理論是指從人格結構、潛意識、早期經驗、內在衝突與心理社會危機來理解人類行為與發展的一群理論。</p>
<h4>二、Freud 精神分析理論（Sigmund Freud）</h4>
<p>Freud 認為人格由本我（id）、自我（ego）與超我（superego）組成。本我遵循快樂原則，自我遵循現實原則，超我遵循道德原則。行為表現常和內在衝突、防衛機轉與早期經驗有關。</p>
<table>
<tr><th>人格結構</th><th>原則</th><th>核心功能</th></tr>
<tr><td>本我（id）</td><td>快樂原則</td><td>追求立即滿足，屬原始衝動層面</td></tr>
<tr><td>自我（ego）</td><td>現實原則</td><td>協調本我需求與現實限制</td></tr>
<tr><td>超我（superego）</td><td>道德原則</td><td>代表內化的道德與規範</td></tr>
</table>
<h4>三、Erikson 心理社會發展理論（Erik Erikson）</h4>
<p>Erikson 認為人生歷程可分為八個心理社會發展階段，每一階段都有核心危機需要面對與整合。</p>
<ul>
<li>嬰兒期：基本信任 vs. 不信任</li>
<li>幼兒期：自主 vs. 羞愧與懷疑</li>
<li>學前期：主動 vs. 罪惡感</li>
<li>學齡期：勤奮 vs. 自卑</li>
<li>青少年期：自我認同 vs. 角色混淆</li>
<li>成年早期：親密 vs. 孤立</li>
<li>中年期：生產性 vs. 停滯</li>
<li>老年期：自我統整 vs. 絕望</li>
</ul>
<h4>四、依附理論（Attachment Theory）</h4>
<p>依附理論重點在於幼兒與主要照顧者之間關係的品質，會影響安全感、信任、人際關係與情緒調節。安全依附有助於之後的穩定發展，不安全依附則可能影響後續關係與情緒表現。</p>
<h4>五、易混淆觀念</h4>
<ul>
<li>Freud 偏內在衝突與潛意識；Erikson 偏生命歷程中的社會心理任務。</li>
<li>Erikson 的認同危機對應青少年期；親密 vs. 孤立對應成年初期。</li>
<li>依附理論關注的是早期關係品質，不是單純父母管教風格分類。</li>
</ul>
<h4>六、常見考法</h4>
<ul>
<li>本我、自我、超我的功能判斷題</li>
<li>Erikson 八階段配對題</li>
<li>依附安全／不安全概念題</li>
<li>理論比較題（Freud vs. Erikson）</li>
</ul>
` },

  'hb_theory_family': { title:'家庭理論', content:`
<h4>一、定義</h4>
<p>家庭理論是指從家庭作為一個互動系統來理解個體行為的理論。重點不只在某個家庭成員本身，而在家庭規則、界限、角色、互動模式與生命週期。</p>
<h4>二、家庭系統理論（Family Systems Theory）</h4>
<p>家庭是一個系統，成員彼此相互影響。一個人的改變會牽動其他人，問題常不是單一成員造成，而是整個系統互動的結果。</p>
<ul>
<li><strong>界限（boundary）：</strong>家庭成員、次系統之間的分界與互動規範。</li>
<li><strong>次系統（subsystem）：</strong>如夫妻、親子、手足等。</li>
<li><strong>家庭規則：</strong>家庭成員長期形成的互動模式。</li>
<li><strong>均衡（homeostasis）：</strong>家庭傾向維持熟悉的平衡狀態。</li>
</ul>
<h4>三、家庭生命週期（Family Life Cycle）</h4>
<p>家庭會隨不同生命階段出現不同發展任務，例如結婚、育兒、子女離家、退休與老化。不同階段若調適困難，容易形成壓力與衝突。</p>
<h4>四、Baumrind 管教風格</h4>
<table>
<tr><th>類型</th><th>特徵</th><th>常見影響</th></tr>
<tr><td>權威型（authoritative）</td><td>高關愛、高要求</td><td>通常較有利於自律與社會適應</td></tr>
<tr><td>威權型（authoritarian）</td><td>低關愛、高控制</td><td>可能較服從，但自我表達與自主較弱</td></tr>
<tr><td>放任型（permissive）</td><td>高關愛、低要求</td><td>界限較弱，自律較不足</td></tr>
<tr><td>忽視型（neglectful）</td><td>低關愛、低要求</td><td>發展風險通常最高</td></tr>
</table>
<h4>五、常見考法</h4>
<ul>
<li>家庭系統中的界限與次系統題</li>
<li>家庭生命週期任務題</li>
<li>管教風格比較題</li>
<li>把個人問題放回家庭互動脈絡的情境題</li>
</ul>
` },

  'hb_theory_social': { title:'社會結構理論', content:`
<h4>一、定義</h4>
<p>社會結構理論強調個人的行為與發展，會受到社會制度、權力分配、文化規範、社會階層與環境系統影響。它提醒我們，很多問題不能只從個人特質解釋。</p>
<h4>二、生態系統理論（Ecological Systems Theory）</h4>
<p>重點在個體與多層次環境的互動，包括微視系統（microsystem）、中介系統（mesosystem）、外部系統（exosystem）、鉅視系統（macrosystem）。</p>
<h4>三、一般系統理論（General Systems Theory）</h4>
<p>強調系統間的互動、界限、輸入輸出、回饋、均衡等特性。常見概念包括開放系統、回饋（feedback）、非加總性（non-summativity）、穩定狀態（steady state）。</p>
<h4>四、女性主義理論（Feminist Theory）</h4>
<p>重視性別、權力、父權結構與差異處境，強調個人困境與社會制度之間的關聯。</p>
<h4>五、易混淆觀念</h4>
<ul>
<li>生態系統理論更常考具體層次；一般系統理論較常考系統特性。</li>
<li>女性主義理論不是只談女性，而是在談性別權力與制度壓迫。</li>
<li>社會結構理論的共同點是：都把焦點放到個體之外的系統與結構。</li>
</ul>
<h4>六、常見考法</h4>
<ul>
<li>四層系統判斷題</li>
<li>系統特性比較題</li>
<li>性別與權力結構題</li>
<li>個體行為與社會環境連結題</li>
</ul>
` },

  'hb_stages': { title:'人生發展階段任務與課題 — 主分類重點筆記', content:`
<h4>一、這個主分類在學什麼</h4>
<p>這個主分類是在讀：不同生命階段的人，通常會面對什麼發展任務、危機與社會期待。重點不只是年齡分類，而是每一階段「典型要面對的課題」。</p>
<h4>二、四個大區塊</h4>
<ul>
<li><strong>嬰幼兒期與兒童期：</strong>依附、認知、語言、社會化、學習與規範建立。</li>
<li><strong>青少年期：</strong>自我認同、同儕關係、身體形象、個人神話與從眾。</li>
<li><strong>成年期與中年期：</strong>親密關係、工作與家庭平衡、生產性、照顧責任。</li>
<li><strong>老年期：</strong>退休調適、角色變化、成功老化、喪失與死亡議題。</li>
</ul>
<h4>三、最常見命題</h4>
<ul>
<li>某個特徵出現在什麼年齡階段</li>
<li>某個理論的發展任務屬於哪一階段</li>
<li>生命階段常見社會心理議題判斷</li>
<li>老年、青少年、家庭角色壓力的比較題</li>
</ul>
` },

  'hb_stage_early': { title:'嬰幼兒期與兒童期', content:`
<h4>一、定義</h4>
<p>嬰幼兒期與兒童期是人類發展的基礎階段，重點在安全感建立、語言與認知發展、情緒調節、社會化與學習能力養成。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>依附：</strong>幼兒與主要照顧者的關係品質，會影響安全感與後續人際關係。</li>
<li><strong>語言與認知：</strong>從感覺動作、象徵理解到具體邏輯推理逐步發展。</li>
<li><strong>社會化：</strong>學習規範、角色、合作與自我控制。</li>
<li><strong>學習與成就：</strong>進入學齡期後，勤奮、自信與自我效能感很重要。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>嬰幼兒期較重依附與信任建立；兒童期則逐漸進入學校社會化與學習成就。</li>
<li>Piaget 的前運思期與具體運思期常被混淆，關鍵在是否已具備保留概念與可逆思考。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>依附與信任建立題</li>
<li>兒童認知與語言發展題</li>
<li>學齡期勤奮 vs. 自卑題</li>
<li>社會化與規範學習題</li>
</ul>
` },

  'hb_stage_youth': { title:'青少年期', content:`
<h4>一、定義</h4>
<p>青少年期是從兒童走向成人的過渡階段，重點在身體成熟、自我認同形成、同儕影響、獨立需求與社會角色探索。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>認同發展：</strong>Erikson 認為青少年主要任務是自我認同 vs. 角色混淆。</li>
<li><strong>同儕影響：</strong>青少年對同儕接納高度敏感，從眾行為通常在此階段明顯。</li>
<li><strong>個人神話（personal fable）：</strong>覺得自己獨特、特別，甚至不會發生壞事在自己身上。</li>
<li><strong>想像觀眾（imaginary audience）：</strong>認為別人一直在注意自己。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>認同危機是青少年期，不是成年初期。</li>
<li>青少年雖逐漸能抽象思考，但情緒與衝動控制未必同步成熟。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>自我認同題</li>
<li>同儕、從眾與個人神話題</li>
<li>形式運思與抽象思考題</li>
<li>青春期社會心理調適題</li>
</ul>
` },

  'hb_stage_adult': { title:'成年期與中年期', content:`
<h4>一、定義</h4>
<p>成年期與中年期的重點在親密關係、工作角色、家庭責任、自我實現與社會生產性。這一階段不只是穩定下來，也常伴隨多重角色壓力。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>成年早期：</strong>重點在親密 vs. 孤立，包含伴侶關係、友誼與承諾建立。</li>
<li><strong>中年期：</strong>重點在生產性 vs. 停滯，包含照顧下一代、工作投入、社會參與與生命意義感。</li>
<li><strong>三明治世代（sandwich generation）：</strong>同時要照顧子女與父母的中年人，常是考點。</li>
</ul>
<h4>三、補充概念</h4>
<ul>
<li><strong>Sternberg 愛情三角理論：</strong>親密、熱情、承諾三元素。</li>
<li><strong>社會時鐘（social clock）：</strong>社會文化對某年齡該完成什麼角色有期待。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>親密 vs. 孤立題</li>
<li>生產性 vs. 停滯題</li>
<li>愛情三角理論題</li>
<li>多重角色壓力與家庭責任題</li>
</ul>
` },

  'hb_stage_elder': { title:'老年期', content:`
<h4>一、定義</h4>
<p>老年期的核心不只是生理老化，而是退休、角色轉變、失落調適、健康維持、社會參與與生命統整。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>自我統整 vs. 絕望：</strong>Erikson 認為老年期的任務是回顧人生，形成整體感與接納感。</li>
<li><strong>成功老化（successful aging）：</strong>Rowe 與 Kahn 提出避免疾病失能、維持高功能、積極參與生活。</li>
<li><strong>退休調適：</strong>涉及收入、角色、社交、生活節奏與自我價值調整。</li>
<li><strong>喪慟與死亡議題：</strong>老年期常面對伴侶、朋友、健康與功能喪失。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>成功老化不是沒有疾病，而是即使老化仍能維持功能與參與。</li>
<li>老年理論中，活動理論與退出理論常被拿來比較；現在考題較常偏向成功老化與持續理論。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>成功老化概念題</li>
<li>退休與角色調適題</li>
<li>Erikson 老年期任務題</li>
<li>喪失、死亡恐懼與老化議題題</li>
</ul>
` },

  'hb_diversity': { title:'性別、多元化及新興社會議題 — 主分類重點筆記', content:`
<h4>一、這個主分類在學什麼</h4>
<p>這個主分類重點在：人的發展與生活不只受年齡影響，也深受性別、性傾向、族群、階級、貧窮、家庭型態與社會排除影響。也就是說，要從差異與權力去理解人的行為與處境。</p>
<h4>二、三大重點</h4>
<ul>
<li><strong>性別與性取向：</strong>性別角色、性別認同、性傾向、恐同與歧視。</li>
<li><strong>種族、族群與社會階層：</strong>種族主義、社會排除、貧窮理論、階級與不平等。</li>
<li><strong>家庭多元議題：</strong>單親、重組、跨國婚姻、新住民、脆弱家庭等。</li>
</ul>
<h4>三、命題提醒</h4>
<p>這一區很常出現價值判斷與概念辨識，尤其會考你是否把差異誤當成偏差，或把結構問題錯看成個人問題。</p>
` },

  'hb_div_gender': { title:'性別與性取向', content:`
<h4>一、定義</h4>
<p>此子分類在探討性別角色、性別認同、性傾向與社會文化規範如何影響人的自我認同、人際關係與社會處境。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>性別認同：</strong>個體如何理解並認定自己的性別。</li>
<li><strong>性傾向：</strong>個體情感、浪漫或性吸引的對象取向。</li>
<li><strong>性別角色：</strong>社會文化對男性、女性或其他性別位置的期待。</li>
<li><strong>LGBTQ+ 議題：</strong>涉及認同、權利、污名與社會支持。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>性別認同、性別表達、性傾向不是同一件事。</li>
<li>恐同症（homophobia）是對同性戀或雙性戀者的恐懼、排斥與敵意，不只是「不喜歡」而已。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>概念區辨題</li>
<li>性別刻板印象題</li>
<li>恐同與歧視題</li>
<li>多元性別權益與支持題</li>
</ul>
` },

  'hb_div_race': { title:'種族、族群與社會階層', content:`
<h4>一、定義</h4>
<p>這一區重點在於理解種族、族群與社會階層如何影響資源分配、機會取得、社會參與與個人生活經驗。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>種族主義（racism）：</strong>基於種族或族群差異而產生的偏見、歧視與制度性不平等。</li>
<li><strong>社會階層：</strong>社會中的資源、地位、權力分配形成不同層級。</li>
<li><strong>社會排除（social exclusion）：</strong>個人或群體被排除於重要制度、資源與參與機會之外。</li>
<li><strong>社會融合／社會包容（social inclusion）：</strong>讓不同群體有平等參與和被納入社會生活的機會。</li>
</ul>
<h4>三、貧窮理論整理</h4>
<table>
<tr><th>理論</th><th>核心觀點</th></tr>
<tr><td>貧窮文化理論（culture of poverty）</td><td>認為貧窮者形成特定價值與行為模式，代代傳遞</td></tr>
<tr><td>結構／衝突觀點</td><td>認為貧窮與不平等來自社會結構與資源分配不公</td></tr>
<tr><td>功能論</td><td>認為貧窮在社會中被維持並具有某些功能</td></tr>
</table>
<h4>四、常見考法</h4>
<ul>
<li>種族主義與歧視概念題</li>
<li>社會排除 vs. 社會包容題</li>
<li>貧窮理論比較題</li>
<li>階級與資源不平等題</li>
</ul>
` },

  'hb_div_family': { title:'家庭多元議題', content:`
<h4>一、定義</h4>
<p>家庭多元議題是指家庭型態與家庭處境的多樣化，包括單親、重組家庭、跨國婚姻、新住民家庭、隔代教養、脆弱家庭等。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>家庭型態多元：</strong>家庭不再只有傳統核心家庭樣貌。</li>
<li><strong>新住民與跨國婚姻家庭：</strong>常涉及文化適應、語言、教養與社會支持問題。</li>
<li><strong>脆弱家庭（vulnerable family）：</strong>通常指多重風險與壓力累積的家庭，需要整合性支持。</li>
<li><strong>單親與重組家庭：</strong>常伴隨經濟、教養、角色調整與社會支持需求。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>家庭多元不等於家庭功能失常。</li>
<li>跨國婚姻家庭不能只用文化差異解釋，也要看制度資源與社會接納程度。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>多元家庭型態概念題</li>
<li>新住民與跨文化家庭支持題</li>
<li>脆弱家庭風險與支持題</li>
<li>家庭多元與污名化判斷題</li>
</ul>
` },

  'rm': { title:'社會工作研究法 — 本科目重點筆記總覽（A版）', content:`
<h4>一、這一科到底在讀什麼</h4>
<p>社會工作研究法，是在學「如何用有系統的方法產生可信的知識」。它不是只有統計，也不是只有研究設計，而是一整條流程：從問題形成、概念化、研究設計、抽樣、資料蒐集、分析到研究倫理。</p>
<h4>二、四大主分類</h4>
<ul>
<li><strong>理論與研究的關連：</strong>先釐清理論、概念、變項、假設與因果關係。</li>
<li><strong>研究設計：</strong>處理測量、信效度、抽樣與資料蒐集。</li>
<li><strong>研究方法：</strong>處理調查研究、質性研究、評估研究與行動研究。</li>
<li><strong>研究結果判讀、分析與研究倫理：</strong>處理量化分析、質性分析與倫理規範。</li>
</ul>
<h4>三、這科最常見的失分點</h4>
<ul>
<li>概念、變項、指標、操作化混在一起</li>
<li>信度與效度分不清</li>
<li>抽樣法判斷錯誤</li>
<li>實驗設計與準實驗設計混淆</li>
<li>統計名詞只背中文，遇到題目就認不出來</li>
</ul>
<div class="hl">讀這科最有效的方法，是把它當成一條流程：<strong>我要研究什麼 → 怎麼定義 → 怎麼選樣本 → 怎麼蒐資料 → 怎麼分析 → 有沒有符合倫理</strong>。</div>
` },

  'rm_theory': { title:'理論與研究的關連 — 主分類重點筆記', content:`
<h4>一、這個主分類在學什麼</h4>
<p>研究不是一開始就發問卷，而是要先把概念想清楚。這個主分類重點在於：理論如何形成問題意識、概念如何變成可研究的變項、研究邏輯如何從理論走到資料。</p>
<h4>二、核心內容</h4>
<ul>
<li><strong>理論：</strong>用來解釋現象、建立概念與預測關係。</li>
<li><strong>概念：</strong>研究者想要討論的抽象想法，例如社會支持、壓力、生活品質。</li>
<li><strong>變項：</strong>可觀察、可比較、可測量的特徵。</li>
<li><strong>假設：</strong>對變項之間關係的可檢驗陳述。</li>
<li><strong>因果模型：</strong>用來說明變項如何彼此影響。</li>
</ul>
<h4>三、最常考的判斷路徑</h4>
<p>當題目出現某個抽象概念時，你要先問：這是理論、概念、變項還是測量指標？很多考題就是在測這種層次辨識。</p>
` },

  'rm_theory_concept': { title:'理論、概念與變項', content:`
<h4>一、定義</h4>
<p>理論、概念與變項，是研究最基礎的三個層次。理論用來解釋現象，概念是理論中的抽象單位，變項則是能在研究中被觀察、分類或測量的具體表現。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>概念化（conceptualization）：</strong>把抽象概念的意義說清楚。</li>
<li><strong>操作化（operationalization）：</strong>把抽象概念轉成可觀察、可測量的指標。</li>
<li><strong>假設（hypothesis）：</strong>對兩個以上變項關係的可檢驗預測。</li>
<li><strong>命題（proposition）：</strong>理論中對概念關係的抽象陳述，不一定可直接檢驗。</li>
</ul>
<h4>三、變項分類</h4>
<table>
<tr><th>類型</th><th>說明</th></tr>
<tr><td>自變項（independent variable）</td><td>被視為影響其他變項的原因</td></tr>
<tr><td>依變項（dependent variable）</td><td>被影響、被解釋的結果</td></tr>
<tr><td>控制變項（control variable）</td><td>研究中刻意固定或納入控制的變項</td></tr>
<tr><td>中介變項（mediating variable）</td><td>解釋自變項如何影響依變項的中間機制</td></tr>
<tr><td>干擾／調節變項（moderating variable）</td><td>改變自變項與依變項關係方向或強度的變項</td></tr>
</table>
<h4>四、常見考法</h4>
<ul>
<li>概念化 vs. 操作化題</li>
<li>假設、命題、理論層次題</li>
<li>自變項、依變項判斷題</li>
<li>中介與干擾變項比較題</li>
</ul>
` },

  'rm_theory_logic': { title:'歸納法與演繹法', content:`
<h4>一、定義</h4>
<p>歸納法與演繹法，是研究推理的兩條基本路線。前者是從資料與觀察中整理出理論，後者是從理論出發形成假設並加以檢驗。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>歸納法（induction）：</strong>從具體觀察走向概念與理論，常見於質性研究或探索性研究。</li>
<li><strong>演繹法（deduction）：</strong>從理論走向假設，再用資料檢驗，常見於量化研究。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>歸納法不是沒有理論，而是理論形成較依賴資料累積。</li>
<li>演繹法不是只會驗證，也可以用來推翻理論。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>研究邏輯判斷題</li>
<li>量化 vs. 質性常見推理模式題</li>
<li>從理論到假設、從觀察到理論的流程題</li>
</ul>
` },

  'rm_theory_causal': { title:'因果模型', content:`
<h4>一、定義</h4>
<p>因果模型是用來說明變項之間可能存在的因果關係架構。研究者透過理論與設計，檢驗某些因素是否會影響特定結果。</p>
<h4>二、因果關係的基本條件</h4>
<ul>
<li><strong>相關：</strong>兩個變項要有關聯。</li>
<li><strong>時間先後：</strong>原因必須先於結果發生。</li>
<li><strong>排除其他解釋：</strong>盡量控制或排除其他可能原因。</li>
</ul>
<h4>三、常見變項關係</h4>
<ul>
<li>自變項 → 依變項</li>
<li>中介變項：說明作用機制</li>
<li>干擾／調節變項：改變作用強度或方向</li>
<li>虛假關係：看似有關，其實受第三變項影響</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>因果關係條件題</li>
<li>虛假關係判斷題</li>
<li>中介與調節變項題</li>
<li>實驗設計如何提升因果推論題</li>
</ul>
` },

  'rm_design': { title:'研究設計 — 主分類重點筆記', content:`
<h4>一、這個主分類在學什麼</h4>
<p>研究設計是在決定：我要如何把研究問題變成一個可以執行、可以蒐集資料、可以檢驗品質的研究。</p>
<h4>二、三大核心</h4>
<ul>
<li><strong>測量：</strong>我如何把概念變成題目、量表或指標。</li>
<li><strong>抽樣：</strong>我要找誰來研究，樣本能不能代表母群體。</li>
<li><strong>資料蒐集：</strong>我用問卷、訪談、觀察還是次級資料。</li>
</ul>
<h4>三、最常考點</h4>
<ul>
<li>信度與效度比較</li>
<li>抽樣方法判斷</li>
<li>資料蒐集法優缺點</li>
<li>測量層次與可用統計方法</li>
</ul>
` },

  'rm_design_measure': { title:'測量與信效度', content:`
<h4>一、定義</h4>
<p>測量是指把抽象概念轉化為可觀察、可記錄的方式。研究品質常透過信度（reliability）與效度（validity）判斷。</p>
<h4>二、測量層次</h4>
<table>
<tr><th>層次</th><th>特徵</th><th>例子</th></tr>
<tr><td>名目尺度（nominal scale）</td><td>分類、無大小順序</td><td>性別、婚姻狀況</td></tr>
<tr><td>次序尺度（ordinal scale）</td><td>有順序、間距不一定相等</td><td>滿意度高低、教育程度</td></tr>
<tr><td>等距尺度（interval scale）</td><td>有順序、間距相等、無絕對零點</td><td>溫度、智力測驗分數</td></tr>
<tr><td>比率尺度（ratio scale）</td><td>有順序、間距相等、有絕對零點</td><td>年齡、收入、身高</td></tr>
</table>
<h4>三、信度（Reliability）</h4>
<ul>
<li><strong>再測信度：</strong>不同時間重測的一致性。</li>
<li><strong>複本信度：</strong>不同版本測量的一致性。</li>
<li><strong>內部一致性：</strong>量表題項彼此一致程度，例如 Cronbach's alpha。</li>
<li><strong>評分者間信度：</strong>不同評分者判斷的一致性。</li>
</ul>
<h4>四、效度（Validity）</h4>
<ul>
<li><strong>表面效度：</strong>看起來像不像在測那個概念。</li>
<li><strong>內容效度：</strong>是否涵蓋概念的重要面向。</li>
<li><strong>效標關聯效度：</strong>和外部標準的關聯程度。</li>
<li><strong>建構效度：</strong>是否真正測到理論中的構念。</li>
</ul>
<h4>五、易混淆觀念</h4>
<ul>
<li>信度高不代表效度一定高。</li>
<li>效度通常建立在基本信度之上，但兩者不是同義詞。</li>
</ul>
<h4>六、常見考法</h4>
<ul>
<li>測量層次判斷題</li>
<li>信度類型辨識題</li>
<li>效度類型辨識題</li>
<li>量表品質判斷題</li>
</ul>
` },

  'rm_design_sampling': { title:'抽樣方法', content:`
<h4>一、定義</h4>
<p>抽樣是從母群體中選出研究對象的過程。抽樣方式會影響研究結果是否具有代表性與可推論性。</p>
<h4>二、機率抽樣</h4>
<ul>
<li><strong>簡單隨機抽樣（simple random sampling）：</strong>每個成員被抽中的機會相等。</li>
<li><strong>系統抽樣（systematic sampling）：</strong>依固定間隔抽樣。</li>
<li><strong>分層抽樣（stratified sampling）：</strong>先分層再抽樣，提升代表性。</li>
<li><strong>叢集抽樣（cluster sampling）：</strong>以群體為單位抽樣。</li>
</ul>
<h4>三、非機率抽樣</h4>
<ul>
<li><strong>便利抽樣（convenience sampling）：</strong>選容易接觸者。</li>
<li><strong>立意抽樣（purposive sampling）：</strong>依研究目的選特定對象。</li>
<li><strong>滾雪球抽樣（snowball sampling）：</strong>由受試者介紹其他對象。</li>
<li><strong>配額抽樣（quota sampling）：</strong>依設定比例選取樣本。</li>
</ul>
<h4>四、易混淆觀念</h4>
<ul>
<li>能不能推論到母群體，和抽樣方式密切相關。</li>
<li>質性研究常用立意抽樣，不是因為隨便，而是因為要找最能提供資訊者。</li>
</ul>
<h4>五、常見考法</h4>
<ul>
<li>抽樣法情境判斷題</li>
<li>機率 vs. 非機率抽樣比較題</li>
<li>代表性與外部效度題</li>
</ul>
` },

  'rm_design_data': { title:'資料蒐集方法', content:`
<h4>一、定義</h4>
<p>資料蒐集方法是指研究者用什麼方式取得資訊。不同方法有不同優勢、限制與適用情境。</p>
<h4>二、主要方法</h4>
<ul>
<li><strong>問卷調查：</strong>適合大量資料、標準化蒐集。</li>
<li><strong>訪談：</strong>可深入理解經驗與意義。</li>
<li><strong>觀察：</strong>可直接記錄行為與互動。</li>
<li><strong>次級資料分析：</strong>使用既有資料，如政府統計、機構資料。</li>
</ul>
<h4>三、常見比較</h4>
<table>
<tr><th>方法</th><th>優點</th><th>限制</th></tr>
<tr><td>問卷</td><td>效率高、易量化</td><td>深度不足、受題目品質影響大</td></tr>
<tr><td>訪談</td><td>深度高、可追問</td><td>耗時、分析複雜</td></tr>
<tr><td>觀察</td><td>接近真實情境</td><td>觀察者效應、紀錄困難</td></tr>
<tr><td>次級資料</td><td>省時省成本</td><td>受限於原始資料品質與設計</td></tr>
</table>
<h4>四、常見考法</h4>
<ul>
<li>資料蒐集法適用情境題</li>
<li>問卷與訪談比較題</li>
<li>觀察法類型與限制題</li>
<li>次級資料優缺點題</li>
</ul>
` },

  'rm_methods': { title:'研究方法 — 主分類重點筆記', content:`
<h4>一、這個主分類在學什麼</h4>
<p>這個主分類處理的是「研究到底怎麼做」。也就是說，在前面概念與設計都定好之後，你要選用哪一類研究方法來回答問題。</p>
<h4>二、四個大方向</h4>
<ul>
<li><strong>調查研究法：</strong>收集較大量標準化資料。</li>
<li><strong>質性研究方法：</strong>深入理解經驗、意義與脈絡。</li>
<li><strong>評估研究：</strong>評估方案、服務或介入成效。</li>
<li><strong>行動研究：</strong>研究與實務改變同時進行。</li>
</ul>
` },

  'rm_method_survey': { title:'調查研究法', content:`
<h4>一、定義</h4>
<p>調查研究法（survey research）是透過問卷、結構化訪談等方式，從較多研究對象蒐集標準化資料，以描述現況、比較差異或分析變項關係。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>重視標準化題目與一致的施測程序。</li>
<li>常見形式包括郵寄問卷、電話調查、面訪、網路問卷。</li>
<li>適合做描述研究、橫斷研究與大樣本量化分析。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>調查研究不一定能推論因果，多數只能說明相關或現況。</li>
<li>回收率、題目設計與樣本代表性都會影響品質。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>問卷調查優缺點題</li>
<li>郵寄、電話、網路調查比較題</li>
<li>橫斷式 vs. 縱貫式調查題</li>
</ul>
` },

  'rm_method_qual': { title:'質性研究方法', content:`
<h4>一、定義</h4>
<p>質性研究方法是透過深度訪談、焦點團體、參與觀察、民族誌等方式，理解人們如何經驗、詮釋與建構其生活世界。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>深度訪談：</strong>重視受訪者的經驗與意義。</li>
<li><strong>焦點團體：</strong>透過團體互動蒐集看法。</li>
<li><strong>民族誌：</strong>長期進入場域理解文化與生活實踐。</li>
<li><strong>紮根理論（grounded theory）：</strong>從資料中逐步發展理論。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>質性研究不是不嚴謹，而是重視脈絡、深度與意義。</li>
<li>質性研究常用歸納邏輯，不是完全沒有理論。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>質性方法辨識題</li>
<li>焦點團體與深度訪談比較題</li>
<li>紮根理論分析流程題</li>
<li>質性研究品質與信實度題</li>
</ul>
` },

  'rm_method_eval': { title:'評估研究', content:`
<h4>一、定義</h4>
<p>評估研究是針對方案、服務、政策或介入成效進行系統性評估，以判斷是否有效、是否值得持續、如何改進。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>形成性評估（formative evaluation）：</strong>在方案進行中，用來修正與改善。</li>
<li><strong>總結性評估（summative evaluation）：</strong>在方案後期，用來判斷整體成效。</li>
<li><strong>實驗設計：</strong>隨機分派、控制組、前後測，因果推論能力最強。</li>
<li><strong>準實驗設計：</strong>較接近實務場域，但控制較弱。</li>
<li><strong>單案研究設計：</strong>常用於社工個案或臨床介入成效評估。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>形成性 vs. 總結性評估題</li>
<li>實驗設計與準實驗設計題</li>
<li>單案設計題</li>
<li>方案成效判斷題</li>
</ul>
` },

  'rm_method_action': { title:'行動研究', content:`
<h4>一、定義</h4>
<p>行動研究（action research）是研究者與實務工作者、社區成員一起合作，在行動中進行研究、在研究中推動改變的方法。</p>
<h4>二、核心理論內容</h4>
<ul>
<li>研究與改變同步進行。</li>
<li>重視參與、反思、循環修正。</li>
<li>常見於社區工作、組織改革、實務創新與參與式研究。</li>
<li>參與式行動研究（participatory action research, PAR）更強調研究對象共同參與與共同決策。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>行動研究特色題</li>
<li>研究與改變並行概念題</li>
<li>PAR 與傳統研究差異題</li>
</ul>
` },

  'rm_analysis': { title:'研究結果判讀、分析與研究倫理 — 主分類重點筆記', content:`
<h4>一、這個主分類在學什麼</h4>
<p>這個主分類是在處理研究結果出來之後，研究者如何判讀、分析與報告，同時確保整個研究過程符合倫理原則。</p>
<h4>二、三大重點</h4>
<ul>
<li><strong>量化資料分析：</strong>描述統計、推論統計、顯著性與變項關係。</li>
<li><strong>質性資料分析：</strong>編碼、主題整理、概念建構。</li>
<li><strong>研究倫理：</strong>知情同意、保密、避免傷害、IRB。</li>
</ul>
` },

  'rm_analysis_quant': { title:'量化資料分析', content:`
<h4>一、定義</h4>
<p>量化資料分析是利用數字資料，透過統計方法整理、描述與檢驗資料中的模式、差異與關係。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>描述統計：</strong>用來整理資料，例如平均數、中位數、眾數、標準差、百分比。</li>
<li><strong>推論統計：</strong>用樣本結果推論母群體，例如 t 檢定、卡方檢定、變異數分析、相關、迴歸。</li>
<li><strong>顯著性：</strong>表示結果不太可能只是隨機誤差造成。</li>
</ul>
<h4>三、易混淆觀念</h4>
<ul>
<li>平均數、中位數、眾數是描述統計，不是推論統計。</li>
<li>顯著不等於效果一定大或一定重要。</li>
<li>相關不等於因果。</li>
</ul>
<h4>四、常見考法</h4>
<ul>
<li>描述統計與推論統計區分題</li>
<li>常見統計方法適用情境題</li>
<li>顯著性與相關概念題</li>
</ul>
` },

  'rm_analysis_qual': { title:'質性資料分析', content:`
<h4>一、定義</h4>
<p>質性資料分析是將訪談、觀察、文本等非數字資料加以整理、分類、編碼與詮釋，逐步形成主題、概念與理論理解。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>編碼（coding）：</strong>將資料切分、標記、命名。</li>
<li><strong>主題分析（thematic analysis）：</strong>整理出反覆出現的重要主題。</li>
<li><strong>紮根理論分析：</strong>包含開放編碼、主軸編碼、選擇編碼等。</li>
<li><strong>持續比較法：</strong>不斷比較資料與概念，修正分類。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>編碼與主題分析題</li>
<li>紮根理論分析流程題</li>
<li>質性分析的詮釋與嚴謹性題</li>
</ul>
` },

  'rm_analysis_ethics': { title:'研究倫理', content:`
<h4>一、定義</h4>
<p>研究倫理是指研究者在整個研究過程中，必須保障受試者權益、避免研究傷害、維持誠信與專業責任的原則。</p>
<h4>二、核心理論內容</h4>
<ul>
<li><strong>知情同意（informed consent）：</strong>受試者應清楚知道研究目的、程序、風險、權利後再決定是否參與。</li>
<li><strong>保密與匿名：</strong>保護個人資料與身分資訊。</li>
<li><strong>避免傷害：</strong>降低身心、社會、法律與隱私風險。</li>
<li><strong>可退出權：</strong>受試者可隨時退出，不應被強迫。</li>
<li><strong>研究倫理審查（IRB）：</strong>高風險或涉及人的研究，通常需接受倫理審查。</li>
</ul>
<h4>三、常見考法</h4>
<ul>
<li>知情同意題</li>
<li>保密與匿名比較題</li>
<li>研究傷害與保護措施題</li>
<li>IRB 功能題</li>
</ul>
` }
});

// ==================== 初始化 ====================
async function init() {
  document.getElementById('loadingOverlay').style.display = 'flex';
  try {
    await loadUserData();
    userData = normalizeUserData(userData);
    renderHome();
  } catch (e) {
    console.error('Init failed, resetting local cache:', e);
    try { localStorage.removeItem(LOCAL_CACHE_KEY); } catch (_) {}
    userData = structuredClone(DEFAULT_USER_DATA);
    renderHome();
  } finally {
    document.getElementById('loadingOverlay').style.display = 'none';
  }
}
init();
