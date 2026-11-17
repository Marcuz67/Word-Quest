(function () {
  "use strict";

  const STORE_KEY = "word-trail-grade8-v1";
  const ROUND_SIZE = 20;
  const RETENTION_DAYS = 180;
  const STAGES = [
    { id: "easy", title: "Easy", subtitle: "Build your word foundations", icon: "leaf" },
    { id: "intermediate", title: "Intermediate", subtitle: "Read between the lines", icon: "layers" },
    { id: "expert", title: "Expert", subtitle: "Take on a word workout", icon: "spark" }
  ];
  const SKILLS = {
    definition: { title: "Word definition", short: "Definitions", icon: "book" },
    context: { title: "Context clues", short: "Context clues", icon: "search" },
    sentence: { title: "Sentence building", short: "Sentence building", icon: "pencil" }
  };
  const app = document.getElementById("app");
  let state = loadState();
  let view = state.teacher ? "auth" : "teacher-setup";
  let authMode = "student";
  let authStudentCreate = false;
  let modal = "";
  let toastText = "";
  let toastTimer = null;
  let levelUpText = "";
  let levelUpTimer = null;
  let currentProfile = null;
  let currentRole = "";
  let expiredNotice = false;

  function emptyStage() {
    return { mastered: [], mistakes: {}, attempts: {}, skillStats: {}, practiceSeen: [], firstQuizRunId: "", firstQuizScore: null, firstQuizCompleted: false, advanceUnlocked: false };
  }

  function emptyStages() {
    return { easy: emptyStage(), intermediate: emptyStage(), expert: emptyStage() };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved && Array.isArray(saved.profiles)) {
        saved.teacher = saved.teacher || null;
        saved.theme = saved.theme === "dark" ? "dark" : "light";
        saved.history = Array.isArray(saved.history) ? saved.history : [];
        return saved;
      }
    } catch (error) {
      console.warn("Saved progress could not be read.", error);
    }
    return { profiles: [], currentProfileId: "", history: [], teacher: null, theme: "light" };
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Progress could not be saved on this device.", error);
      showToast("This browser could not save progress. Check its storage settings.");
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function byId(id) {
    return (window.WORD_QUESTIONS || []).find(function (question) { return question.id === id; });
  }

  function getStage(id) {
    return currentProfile && currentProfile.stages ? currentProfile.stages[id] : null;
  }

  function masteredCount(id) {
    return stageScore(currentProfile, id);
  }

  function stageRun(profile, id) {
    if (!profile) return null;
    if (profile.activeRun && profile.activeRun.stage === id) return profile.activeRun;
    return profile.pausedRuns && profile.pausedRuns[id] ? profile.pausedRuns[id] : null;
  }

  function stageScore(profile, id) {
    const stage = profile && profile.stages ? profile.stages[id] : null;
    if (!stage) return 0;
    if (typeof stage.firstQuizScore === "number") return Math.max(0, Math.min(ROUND_SIZE, stage.firstQuizScore));
    const run = stageRun(profile, id);
    if (run && run.official) return Math.min(ROUND_SIZE, run.responses.filter(function (response) { return response.correct; }).length);
    const words = (stage.mastered || []).map(function (questionId) {
      const question = byId(questionId);
      return question ? question.word.toLowerCase() : questionId;
    });
    return Math.min(ROUND_SIZE, new Set(words).size);
  }

  function stageComplete(id) {
    const stage = getStage(id);
    return Boolean(stage && stage.firstQuizCompleted);
  }

  function stageUnlocked(id) {
    if (id === "easy") return true;
    const priorId = id === "intermediate" ? "easy" : "intermediate";
    const prior = getStage(priorId);
    return stageComplete(priorId) || Boolean(prior && prior.advanceUnlocked);
  }

  function stageInfo(id) {
    return STAGES.find(function (stage) { return stage.id === id; }) || STAGES[0];
  }

  function todayString() {
    return localDateString(new Date());
  }

  function localDateString(date) {
    return date.getFullYear() + "-" +
      String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0");
  }

  function addDays(date, days) {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
  }

  function createProfile(name) {
    if (currentRole !== "teacher") {
      showToast("Only a teacher can add a learner account.");
      return;
    }
    const now = new Date();
    const profile = {
      id: "learner-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      name: name.trim(),
      createdAt: now.toISOString(),
      expiresAt: localDateString(addDays(now, RETENTION_DAYS)),
      stages: emptyStages(),
      activeRun: null,
      pausedRuns: {},
      lastResult: null
    };
    state.profiles.push(profile);
    saveState();
    view = "teacher";
    modal = "";
    render();
  }

  function createStudentAccount(name, username, pin) {
    if (currentRole || view !== "auth" || !name || !username || pin.length < 4) return;
    const now = new Date();
    const profile = {
      id: "learner-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      name: name.trim(),
      username: username.trim().toLowerCase(),
      pin: pin,
      createdAt: now.toISOString(),
      expiresAt: localDateString(addDays(now, RETENTION_DAYS)),
      stages: emptyStages(),
      activeRun: null,
      pausedRuns: {},
      lastResult: null
    };
    state.profiles.push(profile);
    authStudentCreate = false;
    activateLearner(profile.id, "student");
  }

  function prepareProfile() {
    currentProfile = state.profiles.find(function (profile) { return profile.id === state.currentProfileId; }) || null;
    if (!currentProfile) return;
    if (!currentProfile.stages) currentProfile.stages = emptyStages();
    if (!currentProfile.pausedRuns || typeof currentProfile.pausedRuns !== "object") currentProfile.pausedRuns = {};
    STAGES.forEach(function (stageInfoValue) {
      const stage = currentProfile.stages[stageInfoValue.id] || (currentProfile.stages[stageInfoValue.id] = emptyStage());
      stage.mastered = Array.isArray(stage.mastered) ? stage.mastered : [];
      stage.mistakes = stage.mistakes || {};
      stage.attempts = stage.attempts || {};
      stage.skillStats = stage.skillStats || {};
      stage.practiceSeen = Array.isArray(stage.practiceSeen) ? stage.practiceSeen : [];
      const legacyScore = Math.min(ROUND_SIZE, new Set(stage.mastered.map(function (id) { const question = byId(id); return question ? question.word.toLowerCase() : id; })).size);
      if (typeof stage.firstQuizCompleted !== "boolean") stage.firstQuizCompleted = legacyScore >= ROUND_SIZE;
      if (typeof stage.advanceUnlocked !== "boolean") stage.advanceUnlocked = legacyScore >= ROUND_SIZE / 2;
      if (stage.firstQuizCompleted && typeof stage.firstQuizScore !== "number") stage.firstQuizScore = legacyScore;
    });
    if (currentProfile.activeRun && currentProfile.activeRun.stage && !currentProfile.stages[currentProfile.activeRun.stage].firstQuizCompleted && !currentProfile.stages[currentProfile.activeRun.stage].firstQuizRunId) {
      currentProfile.stages[currentProfile.activeRun.stage].firstQuizRunId = currentProfile.activeRun.id;
      currentProfile.activeRun.official = true;
    }
    Object.keys(currentProfile.pausedRuns).forEach(function (stageId) {
      const run = currentProfile.pausedRuns[stageId];
      if (run && run.stage && !currentProfile.stages[run.stage].firstQuizCompleted && !currentProfile.stages[run.stage].firstQuizRunId) {
        currentProfile.stages[run.stage].firstQuizRunId = run.id;
        run.official = true;
      }
    });
    if (currentProfile.expiresAt && currentProfile.expiresAt < todayString()) {
      currentProfile.stages = emptyStages();
      currentProfile.lastResult = null;
      currentProfile.activeRun = null;
      currentProfile.pausedRuns = {};
      state.history = (state.history || []).filter(function (entry) { return entry.learnerId !== currentProfile.id; });
      currentProfile.expiresAt = localDateString(addDays(new Date(), RETENTION_DAYS));
      expiredNotice = true;
      saveState();
    }
  }

  function activateLearner(profileId, role) {
    if (role !== "teacher" && role !== "student") return;
    if (role === "teacher" && currentRole !== "teacher") return;
    const profile = state.profiles.find(function (entry) { return entry.id === profileId; });
    if (!profile) {
      showToast("Ask your teacher to add this learner account.");
      return;
    }
    currentRole = role;
    state.currentProfileId = profileId;
    currentProfile = profile;
    prepareProfile();
    view = "home";
    modal = "";
    saveState();
    render();
  }

  function profilePoints(profile) {
    return STAGES.reduce(function (total, stage) {
      return total + stageScore(profile, stage.id);
    }, 0);
  }

  function announceLevelUp(level) {
    levelUpText = "Level up! You reached Level " + level + "!";
    clearTimeout(levelUpTimer);
    levelUpTimer = setTimeout(function () {
      levelUpText = "";
      render();
    }, 3600);
  }

  function overallProgress() {
    return percent(masteredTotal(), ROUND_SIZE * STAGES.length);
  }

  function learnerLevel(profile) {
    const progress = profile ? percent(profilePoints(profile), ROUND_SIZE * STAGES.length) : overallProgress();
    return Math.max(1, Math.min(10, Math.floor(progress / 10) + 1));
  }

  function formatDate(dateString) {
    if (!dateString) return "Not set";
    const value = new Date(dateString + "T12:00:00");
    if (Number.isNaN(value.getTime())) return dateString;
    return value.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function percent(part, whole) {
    return whole ? Math.round((part / whole) * 100) : 0;
  }

  function icon(name, size) {
    const paths = {
      leaf: '<path d="M20 4c-8 0-14 4-14 11a5 5 0 0 0 5 5c7 0 11-6 9-16Z"/><path d="M4 20c4-5 7-8 13-11"/>',
      layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
      spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
      book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5v-12Z"/><path d="M4 16.5A2.5 2.5 0 0 1 6.5 14H20M8 7h8"/>',
      search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5M8 10.5h5M10.5 8v5"/>',
      pencil: '<path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"/><path d="m14.5 6 3.5 3.5"/>',
      arrow: '<path d="M4 12h15M13 5l7 7-7 7"/>',
      chart: '<path d="M4 20V9m6 11V4m6 16v-7m6 7V7"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
      back: '<path d="m15 18-6-6 6-6M20 12H9"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      reset: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      trophy: '<path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 7H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
      sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.7 4.7l1.4 1.4m9.8 9.8 1.4 1.4M2.5 12h2m15 0h2M4.7 19.3l1.4-1.4m9.8-9.8 1.4-1.4"/><path d="M10.5 11h.1m3 0h.1m-3.3 2a2.2 2.2 0 0 0 3.2 0"/>',
      moon: '<path d="M19.8 14.2A8 8 0 0 1 9.8 4.1 8.5 8.5 0 1 0 19.8 14.2Z"/><path d="M10.4 12.1h.1m3.1 0h.1m-3.2 2a2 2 0 0 0 3.1 0"/>'
    };
    return '<svg class="icon" width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.book) + "</svg>";
  }

  function safeQuestionContext(question) {
    const context = (window.WORD_CONTEXTS || {})[question.word.toLowerCase()];
    if (context) return context;
    return "Read the sentence carefully: the word " + question.word + " is used in a real-life situation.";
  }

  function makeSessionQuestion(question, skill, stageBank) {
    const meaning = question.options[question.correctIndex];
    if (skill === "sentence") {
      const context = safeQuestionContext(question);
      const escapedWord = question.word.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
      const sentence = context.replace(new RegExp("\\b" + escapedWord + "\\b", "i"), "_____");
      const otherWords = shuffle(stageBank.filter(function (item) {
        return item.id !== question.id && item.word.toLowerCase() !== question.word.toLowerCase();
      })).slice(0, 3).map(function (item) { return item.word; });
      const choices = shuffle([question.word].concat(otherWords));
      return {
        id: question.id,
        word: question.word,
        skill: skill,
        prompt: "Choose the word that completes the sentence.",
        context: sentence,
        options: choices,
        answerIndex: choices.findIndex(function (choice) { return choice.toLowerCase() === question.word.toLowerCase(); }),
        meaning: meaning
      };
    }

    const pairs = question.options.map(function (text, index) { return { text: text, originalIndex: index }; });
    const choices = shuffle(pairs);
    return {
      id: question.id,
      word: question.word,
      skill: skill,
      prompt: skill === "context" ? "What does “" + question.word + "” most likely mean in this sentence?" : "Which definition best matches “" + question.word + "”?",
      context: skill === "context" ? safeQuestionContext(question) : "",
      options: choices.map(function (option) { return option.text; }),
      answerIndex: choices.findIndex(function (option) { return option.originalIndex === question.correctIndex; }),
      meaning: meaning
    };
  }

  function buildRun(stageId, mode, practice) {
    if (currentProfile.activeRun) {
      showToast("Resume or finish your saved round before starting another.");
      return;
    }
    if (currentProfile.pausedRuns && currentProfile.pausedRuns[stageId]) {
      showToast("Resume your paused quiz from this stage card.");
      return;
    }
    const stage = getStage(stageId);
    const bank = (window.WORD_QUESTIONS || []).filter(function (question) { return question.stage === stageId; });
    const answeredIds = new Set(Object.keys(stage.attempts || {}));
    const chosen = shuffle(bank.filter(function (question) { return !answeredIds.has(question.id); })).slice(0, ROUND_SIZE);

    if (!chosen.length) {
      showToast("You have answered every question in this stage’s bank.");
      return;
    }

    const skills = shuffle(
      Array(7).fill("definition").concat(Array(7).fill("context"), Array(6).fill("sentence"))
    );
    const questions = chosen.map(function (question, index) {
      return makeSessionQuestion(question, skills[index % skills.length], bank);
    });
    const official = !stage.firstQuizCompleted && !stage.firstQuizRunId;
    const run = {
      id: "run-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      stage: stageId,
      mode: mode,
      practice: Boolean(practice) || !official,
      official: official,
      questions: questions,
      responses: [],
      cursor: 0,
      selectedIndex: null,
      pending: false,
      startedAt: new Date().toISOString()
    };
    if (official) stage.firstQuizRunId = run.id;
    currentProfile.activeRun = run;
    saveState();
    view = "quiz";
    modal = "";
    render();
  }

  function currentQuestion() {
    const run = currentProfile && currentProfile.activeRun;
    return run ? run.questions[run.cursor] : null;
  }

  function answerQuestion() {
    const run = currentProfile && currentProfile.activeRun;
    const question = currentQuestion();
    if (!run || !question || run.pending || run.selectedIndex == null) return;
    const previousLevel = learnerLevel(currentProfile);
    const correct = run.selectedIndex === question.answerIndex;
    const pointsBefore = masteredCount(run.stage);
    const selectedText = question.options[run.selectedIndex];
    const response = {
      id: question.id,
      word: question.word,
      skill: question.skill,
      prompt: question.prompt,
      context: question.context,
      options: question.options,
      selectedIndex: run.selectedIndex,
      selectedText: selectedText,
      answerText: question.options[question.answerIndex],
      meaning: question.meaning,
      correct: correct
    };
    run.responses.push(response);
    run.pending = true;

    const stage = getStage(run.stage);
    stage.attempts[question.id] = (stage.attempts[question.id] || 0) + 1;
    if (!stage.skillStats[question.skill]) stage.skillStats[question.skill] = { correct: 0, total: 0 };
    stage.skillStats[question.skill].total += 1;
    if (correct) stage.skillStats[question.skill].correct += 1;

    if (correct) {
      if (run.official) {
        const sameWord = (window.WORD_QUESTIONS || []).filter(function (item) {
          return item.stage === run.stage && item.word.toLowerCase() === question.word.toLowerCase();
        });
        const hasWord = stage.mastered.some(function (id) {
          const item = byId(id);
          return item && item.word.toLowerCase() === question.word.toLowerCase();
        });
        if (!hasWord && masteredCount(run.stage) < ROUND_SIZE) {
          sameWord.forEach(function (item) {
            if (!stage.mastered.includes(item.id)) stage.mastered.push(item.id);
          });
        }
      }
      if (stage.mistakes[question.id]) {
        stage.mistakes[question.id].resolvedAt = new Date().toISOString();
        stage.mistakes[question.id].correctAnswer = question.meaning;
      }
    } else {
      const old = stage.mistakes[question.id] || { count: 0 };
      stage.mistakes[question.id] = {
        count: old.count + 1,
        lastWrong: selectedText,
        correctAnswer: question.meaning,
        lastAt: new Date().toISOString(),
        resolvedAt: ""
      };
    }

    if (run.practice && !stage.practiceSeen.includes(question.id)) {
      stage.practiceSeen.push(question.id);
    }

    const runCorrect = run.responses.filter(function (item) { return item.correct; }).length;
    if (run.official && runCorrect >= ROUND_SIZE / 2 && !run.advancePrompted) {
      run.advancePrompted = true;
      modal = "advance-50";
    }
    const newLevel = learnerLevel(currentProfile);
    saveState();
    if (newLevel > previousLevel) announceLevelUp(newLevel);
    else render();
  }

  function finishRun() {
    const run = currentProfile && currentProfile.activeRun;
    if (!run) return;
    const correct = run.responses.filter(function (response) { return response.correct; }).length;
    const result = {
      id: run.id,
      stage: run.stage,
      stageTitle: stageInfo(run.stage).title,
      mode: run.mode,
      practice: run.practice,
      total: run.responses.length,
      correct: correct,
      wrong: run.responses.length - correct,
      accuracy: percent(correct, run.responses.length),
      mastered: masteredCount(run.stage),
      responses: run.responses,
      endedAt: new Date().toISOString()
    };
    if (run.official) {
      const stage = getStage(run.stage);
      stage.firstQuizCompleted = true;
      stage.firstQuizScore = Math.min(ROUND_SIZE, correct);
    }
    if (!Array.isArray(state.history)) state.history = [];
    state.history.unshift({ learnerId: currentProfile.id, result: result });
    state.history = state.history.slice(0, 250);
    currentProfile.lastResult = result;
    currentProfile.activeRun = null;
    saveState();
    view = "results";
    render();
  }

  function nextQuestion() {
    const run = currentProfile && currentProfile.activeRun;
    if (!run) return;
    if (run.cursor >= run.questions.length - 1) {
      finishRun();
      return;
    }
    run.cursor += 1;
    run.selectedIndex = null;
    run.pending = false;
    saveState();
    render();
  }

  function showToast(message) {
    toastText = message;
    clearTimeout(toastTimer);
    render();
    toastTimer = setTimeout(function () {
      toastText = "";
      render();
    }, 3000);
  }

  function masteredTotal() {
    return STAGES.reduce(function (sum, stage) { return sum + masteredCount(stage.id); }, 0);
  }

  function unansweredCount(id) {
    const stage = getStage(id);
    if (!stage) return 0;
    const answered = new Set(Object.keys(stage.attempts || {}));
    return (window.WORD_QUESTIONS || []).filter(function (question) { return question.stage === id && !answered.has(question.id); }).length;
  }

  function progressBar(value, max, extraClass) {
    const width = Math.max(0, Math.min(100, percent(value, max)));
    return '<div class="progress-track ' + (extraClass || "") + '" role="progressbar" aria-label="Progress" aria-valuenow="' + value + '" aria-valuemin="0" aria-valuemax="' + max + '"><span style="width:' + width + '%"></span></div>';
  }

  function renderLevelTrack(profile) {
    const points = profilePoints(profile);
    const progress = percent(points, ROUND_SIZE * STAGES.length);
    const level = learnerLevel(profile);
    const markers = Array.from({ length: 10 }, function (_, index) {
      const reached = progress >= (index + 1) * 10;
      return '<span class="level-marker ' + (reached ? "reached" : "") + (level === index + 1 ? " current" : "") + '" aria-label="Level ' + (index + 1) + (reached ? " reached" : "") + '"><b>' + (index + 1) + '</b></span>';
    }).join("");
    return '<section class="level-card glass-card"><div class="level-copy"><div><p class="eyebrow">YOUR OVERALL LEVEL</p><h2>Level ' + level + '<span> / 10</span></h2></div><strong>' + progress + '%</strong></div><p>Each level represents 10% progress across all three stages.</p><div class="level-markers">' + markers + '</div>' + progressBar(points, ROUND_SIZE * STAGES.length, "level-progress") + '</section>';
  }

  function renderWelcome() {
    if (view === "teacher-setup") {
      return '<main class="auth-page"><section class="auth-card glass-card"><div class="welcome-mark">' + icon("book", 30) + '</div><p class="eyebrow">WORD TRAIL · GRADE 8</p><h1>Set up your teacher account.</h1><p class="lead">A teacher account manages learner profiles on this device.</p><form id="teacher-setup-form" class="auth-form"><label for="teacher-name">Teacher name</label><input id="teacher-name" name="name" maxlength="32" autocomplete="name" placeholder="e.g. Ms. Santos" required><label for="teacher-username">Username</label><input id="teacher-username" name="username" maxlength="32" autocomplete="username" required><label for="teacher-pin">Password or passcode</label><input id="teacher-pin" name="pin" type="password" minlength="4" autocomplete="new-password" required><button class="button button-primary" type="submit">Create teacher account ' + icon("arrow", 18) + '</button></form><p class="privacy-note">' + icon("lock", 16) + ' Account and learner progress are saved locally on this device.</p></section></main>';
    }
    return renderAuth();
  }

  function renderAuth() {
    const teacherLearners = (state.profiles || []).filter(function (profile) { return !profile.username; });
    const studentContent = authStudentCreate
      ? '<form id="student-create-form" class="auth-form"><label for="student-name">Your name</label><input id="student-name" name="name" maxlength="32" autocomplete="name" required><label for="student-username">Choose a username</label><input id="student-username" name="username" maxlength="32" autocomplete="username" required><label for="student-pin">Choose a password or passcode</label><input id="student-pin" name="pin" type="password" minlength="4" autocomplete="new-password" required><button class="button button-primary" type="submit">Create student account ' + icon("arrow", 18) + '</button><button class="text-button" type="button" data-action="student-login-mode">I already have an account</button></form><p class="privacy-note">' + icon("lock", 16) + ' Student accounts are stored on this device.</p>'
      : '<form id="student-login-form" class="auth-form"><label for="student-login-username">Username</label><input id="student-login-username" name="username" autocomplete="username" required><label for="student-login-pin">Password or passcode</label><input id="student-login-pin" name="pin" type="password" autocomplete="current-password" required><button class="button button-primary" type="submit">Log in as student ' + icon("arrow", 18) + '</button></form><button class="text-button create-account-link" type="button" data-action="student-create-mode">Create a student account</button>' + (teacherLearners.length ? '<div class="teacher-login-shortcut"><span>Or choose a learner account added by your teacher</span><div class="learner-login-list">' + teacherLearners.map(function (profile) { return '<button class="learner-login-choice" data-action="student-login" data-id="' + escapeHtml(profile.id) + '"><span class="profile-avatar">' + escapeHtml(profile.name.trim().slice(0, 1).toUpperCase()) + '</span><span><strong>' + escapeHtml(profile.name) + '</strong><small>Level ' + learnerLevel(profile) + '</small></span>' + icon("arrow", 18) + '</button>'; }).join("") + '</div></div>' : '');
    const content = authMode === "teacher"
      ? '<form id="teacher-login-form" class="auth-form"><label for="login-username">Username</label><input id="login-username" name="username" autocomplete="username" required><label for="login-pin">Password or passcode</label><input id="login-pin" name="pin" type="password" autocomplete="current-password" required><button class="button button-primary" type="submit">Log in as teacher ' + icon("arrow", 18) + '</button></form>'
      : studentContent;
    return '<main class="auth-page"><section class="auth-card glass-card"><div class="welcome-mark">' + icon("book", 30) + '</div><p class="eyebrow">WORD TRAIL · GRADE 8</p><h1>A little wordplay,<br>a lot of growth.</h1><p class="lead">Build word power one playful challenge at a time.</p><div class="auth-tabs"><button data-action="auth-mode" data-mode="student" class="' + (authMode === "student" ? "active" : "") + '">Student</button><button data-action="auth-mode" data-mode="teacher" class="' + (authMode === "teacher" ? "active" : "") + '">Teacher / Admin</button></div><div class="auth-content">' + content + '</div><div class="welcome-skills"><span>' + icon("book", 18) + ' Definitions</span><span>' + icon("search", 18) + ' Context clues</span><span>' + icon("pencil", 18) + ' Sentence building</span></div></section></main>';
  }

  function renderTeacherDashboard() {
    const profiles = state.profiles || [];
    const cards = profiles.length ? profiles.map(function (profile) {
      const points = profilePoints(profile);
      const level = learnerLevel(profile);
      return '<button class="teacher-learner-card" data-action="open-learner" data-id="' + escapeHtml(profile.id) + '"><span class="profile-avatar">' + escapeHtml(profile.name.trim().slice(0, 1).toUpperCase()) + '</span><span class="teacher-learner-main"><strong>' + escapeHtml(profile.name) + '</strong><small>Level ' + level + ' · ' + points + ' / 60 points · ' + percent(points, 60) + '%</small>' + progressBar(points, 60) + '</span>' + icon("arrow", 18) + '</button>';
    }).join("") : '<div class="empty-card"><strong>No learner profiles yet</strong><p>Add a learner below to begin tracking their vocabulary progress.</p></div>';
    return '<main class="page teacher-page"><section class="progress-intro"><p class="eyebrow">TEACHER WORKSPACE</p><h1>Manage learners.</h1><p class="lead">Create learner profiles and open a learner’s progress on this device.</p></section><div class="section-heading"><h2>Learner profiles</h2><span>' + profiles.length + (profiles.length === 1 ? ' LEARNER' : ' LEARNERS') + '</span></div><section class="teacher-learner-list">' + cards + '</section><section class="settings-card teacher-add-card"><div class="settings-title">' + icon("user", 19) + '<div><strong>Add a learner</strong><span>Only a teacher or admin can create learner profiles.</span></div></div><form id="new-profile-form" class="auth-form"><label for="new-nickname">Learner name or nickname</label><input id="new-nickname" name="nickname" maxlength="24" placeholder="e.g. Word Explorer" required><button class="button button-primary" type="submit">Add learner ' + icon("arrow", 18) + '</button></form></section></main>';
  }

  function renderTopbar() {
    const loggedIn = Boolean(currentRole);
    const identityName = currentRole === "teacher" && !currentProfile ? state.teacher && state.teacher.name || "Teacher" : currentProfile ? currentProfile.name : "";
    const identity = escapeHtml(identityName);
    const avatarInitial = escapeHtml(String(identityName).trim().slice(0, 1).toUpperCase() || "S");
    const themeButton = '<button class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ' + (state.theme === "dark" ? "light" : "dark") + ' theme" title="Switch theme">' + icon(state.theme === "dark" ? "sun" : "moon", 20) + '<span>' + (state.theme === "dark" ? "Light" : "Dark") + '</span></button>';
    const accountCluster = '<div class="account-cluster"><span class="topbar-identity"><span class="account-avatar">' + avatarInitial + '</span><span class="account-name">' + identity + '</span></span><button class="logout-button" data-action="logout">Log out</button></div>';
    const tools = !loggedIn ? "" : currentRole === "teacher"
      ? '<div class="topbar-actions">' + themeButton + '<button class="profile-button" data-action="manage-learners">' + icon("user", 18) + '<span>Learners</span></button>' + accountCluster + '</div>'
      : '<div class="topbar-actions">' + themeButton + accountCluster + '</div>';
    return '<header class="topbar"><div class="topbar-left"><button class="brand" data-action="go-home" aria-label="Go to stages"><span class="brand-mark">W</span><span>Word Trail<small>Grade 8 word workshop</small></span></button></div>' + (loggedIn ? tools : '<div class="topbar-actions">' + themeButton + '</div>') + '</header>';
  }

  function renderBottomNav() {
    return '<nav class="bottom-nav" aria-label="Main navigation">' +
      '<button data-action="nav-home" class="' + (view === "home" || view === "quiz" || view === "results" ? "active" : "") + '">' + icon("book", 20) + '<span>Stages</span></button>' +
      '<button data-action="nav-progress" class="' + (view === "progress" ? "active" : "") + '">' + icon("chart", 20) + '<span>Progress</span></button></nav>';
  }

  function renderStageCard(stage) {
    const count = masteredCount(stage.id);
    const unlocked = stageUnlocked(stage.id);
    const completed = stageComplete(stage.id);
    const paused = currentProfile.pausedRuns && currentProfile.pausedRuns[stage.id];
    const activeHere = currentProfile.activeRun && currentProfile.activeRun.stage === stage.id;
    const canStart = !currentProfile.activeRun;
    return '<article class="stage-card ' + (unlocked ? "" : "locked") + '">' +
      '<div class="stage-card-top"><span class="stage-icon">' + icon(stage.icon, 24) + '</span><span class="stage-number">0' + (STAGES.indexOf(stage) + 1) + '</span>' +
      (completed ? '<span class="status-pill done">' + icon("check", 14) + ' Quiz complete</span>' : unlocked ? '<span class="stage-arrow">' + icon("arrow", 20) + '</span>' : '<span class="lock-badge">' + icon("lock", 17) + '</span>') + '</div>' +
      '<h3>' + escapeHtml(stage.title) + '</h3><p class="stage-subtitle">' + escapeHtml(stage.subtitle) + '</p>' +
      '<div class="stage-score"><span>' + count + ' of 20 points</span><strong>' + percent(count, ROUND_SIZE) + '%</strong></div>' +
      progressBar(count, ROUND_SIZE) +
      '<div class="stage-card-actions">' +
      (paused && canStart ? '<button class="button button-primary button-small" data-action="resume-paused" data-stage="' + stage.id + '">Resume paused quiz · Question ' + (paused.cursor + 1) + ' ' + icon("arrow", 16) + '</button>' : activeHere ? '<button class="button button-primary button-small" data-action="resume">Resume quiz ' + icon("arrow", 16) + '</button>' : canStart && unlocked && !completed ? '<button class="button button-primary button-small" data-action="start-round" data-stage="' + stage.id + '">Start 20-question quiz ' + icon("arrow", 16) + '</button>' : canStart && completed && unansweredCount(stage.id) ? '<button class="button button-soft button-small" data-action="start-practice" data-stage="' + stage.id + '">Continue with new words ' + icon("arrow", 16) + '</button>' : "") +
      (!unlocked ? '<span class="review-hint">Reach 10 correct or finish all 20 in the previous quiz</span>' : completed ? '<span class="review-hint">First quiz score is locked at ' + count + '/20</span>' : "") +
      '</div></article>';
  }

  function renderHome() {
    const total = masteredTotal();
    const activeRun = currentProfile.activeRun;
    const pausedCards = Object.keys(currentProfile.pausedRuns || {}).map(function (stageId) {
      const run = currentProfile.pausedRuns[stageId];
      return '<section class="resume-card paused-resume-card"><div><strong>Paused ' + escapeHtml(stageInfo(stageId).title) + ' quiz</strong><span>Come back later to finish all 20 questions. Paused at question ' + (run.cursor + 1) + ' of ' + run.questions.length + '.</span></div><button class="button button-primary button-small" data-action="resume-paused" data-stage="' + escapeHtml(stageId) + '">Resume ' + icon("arrow", 16) + '</button></section>';
    }).join("");
    return '<main class="page"><section class="intro-row"><div><p class="eyebrow">YOUR WORD JOURNEY</p><h1>A little wordplay,<br>a lot of growth.</h1><p class="lead">Choose your next challenge. One word at a time.</p></div><span class="intro-spark">' + icon("spark", 30) + '</span></section>' +
      '<section class="hero-progress"><div class="hero-label"><span>YOUR WORD WORKSHOP</span>' + icon("spark", 20) + '</div><div class="hero-score">' + total + '<span> / 60</span></div><p>first-quiz points earned</p>' + progressBar(total, 60, "hero-bar") + '<div class="hero-foot"><span>20 questions in each first quiz</span><span>' + percent(total, 60) + '%</span></div></section>' + renderLevelTrack(currentProfile) +
      (expiredNotice ? '<div class="notice-card">' + icon("clock", 18) + '<span>Older saved scores expired and were cleared. Your new progress window is active.</span></div>' : "") +
      (activeRun ? '<section class="resume-card"><div><strong>Your quiz is waiting</strong><span>' + escapeHtml(stageInfo(activeRun.stage).title) + ' · Question ' + (activeRun.cursor + 1) + ' of ' + activeRun.questions.length + '</span></div><button class="button button-primary button-small" data-action="resume">Resume ' + icon("arrow", 16) + '</button></section>' : pausedCards) +
      '<div class="section-heading"><h2>Choose a stage</h2><span>01 — 03</span></div><section class="stage-list">' + STAGES.map(renderStageCard).join("") + '</section>' +
      '<section class="skill-strip"><div class="section-heading compact"><h2>Three ways to grow</h2></div><div class="skill-grid">' + Object.keys(SKILLS).map(function (key) { return '<div class="skill-chip">' + icon(SKILLS[key].icon, 18) + '<span>' + escapeHtml(SKILLS[key].title) + '</span></div>'; }).join("") + '</div></section></main>';
  }

  function getSkillTotals() {
    const totals = {
      definition: { correct: 0, total: 0 },
      context: { correct: 0, total: 0 },
      sentence: { correct: 0, total: 0 }
    };
    STAGES.forEach(function (stageInfoValue) {
      const stage = getStage(stageInfoValue.id);
      Object.keys(stage.skillStats || {}).forEach(function (skill) {
        if (!totals[skill]) totals[skill] = { correct: 0, total: 0 };
        totals[skill].correct += stage.skillStats[skill].correct;
        totals[skill].total += stage.skillStats[skill].total;
      });
    });
    return totals;
  }

  function learnerHistory() {
    return (state.history || []).filter(function (item) { return item.learnerId === currentProfile.id; });
  }

  function renderHistoryRows() {
    const history = learnerHistory().slice(0, 8);
    if (!history.length) return '<div class="empty-card"><div class="empty-icon">' + icon("chart", 22) + '</div><strong>Your activity will show up here</strong><p>Finish a quiz to see your score, accuracy, and answer review.</p></div>';
    return '<div class="activity-list">' + history.map(function (entry) {
      const result = entry.result;
      return '<article class="activity-row"><span class="activity-dot ' + (result.practice ? "practice" : "") + '">' + icon(result.practice ? "book" : "check", 17) + '</span><div class="activity-main"><strong>' + escapeHtml(result.stageTitle) + (result.practice ? ' · Practice' : ' · Round') + '</strong><span>' + formatDate(result.endedAt.slice(0, 10)) + ' · ' + result.correct + '/' + result.total + ' correct</span></div><span class="accuracy-pill">' + result.accuracy + '%</span></article>';
    }).join("") + '</div>';
  }

  function renderProgress() {
    const total = masteredTotal();
    const skills = getSkillTotals();
    const expiry = currentProfile.expiresAt || "";
    return '<main class="page progress-page"><section class="progress-intro"><p class="eyebrow">YOUR WORD JOURNEY</p><h1>Every word counts.</h1><p class="lead">A closer look at the skills you’re building.</p></section>' + renderLevelTrack(currentProfile) +
      '<section class="stat-card"><div class="stat-icon">' + icon("book", 24) + '</div><strong>' + total + '<span> / 60</span></strong><p>first-quiz points earned</p>' + progressBar(total, 60) + '</section>' +
      '<div class="section-heading"><h2>Stage by stage</h2><span>YOUR SCORES</span></div><section class="progress-stage-list">' + STAGES.map(function (stageInfoValue) {
        const count = masteredCount(stageInfoValue.id);
        const stage = currentProfile.stages[stageInfoValue.id];
        const status = stageComplete(stageInfoValue.id) ? "Quiz complete" : stageUnlocked(stageInfoValue.id) ? (stage.advanceUnlocked ? "Unlocked · quiz paused" : "Unlocked") : "Locked";
        return '<article class="progress-stage"><div class="progress-stage-head"><div><span class="progress-stage-icon">' + icon(stageInfoValue.icon, 18) + '</span><strong>' + stageInfoValue.title + '</strong></div><span>' + count + ' / 20</span></div>' + progressBar(count, ROUND_SIZE) + '<div class="progress-stage-foot"><span>' + percent(count, ROUND_SIZE) + '% score</span><span>' + status + '</span></div></article>';
      }).join("") + '</section>' +
      '<div class="section-heading"><h2>Skill snapshot</h2><span>ALL PRACTICE</span></div><section class="skill-stats">' + Object.keys(SKILLS).map(function (skill) {
        const stat = skills[skill];
        return '<article class="skill-stat"><span class="skill-stat-icon">' + icon(SKILLS[skill].icon, 20) + '</span><div><strong>' + escapeHtml(SKILLS[skill].title) + '</strong><span>' + stat.correct + ' correct of ' + stat.total + ' answered</span></div><b>' + percent(stat.correct, stat.total) + '%</b></article>';
      }).join("") + '</section>' +
      '<div class="section-heading"><h2>Recent activity</h2><span>LAST 8 ROUNDS</span></div><section>' + renderHistoryRows() + '</section>' +
      '<section class="settings-card"><div class="settings-title">' + icon("clock", 19) + '<div><strong>Score storage</strong><span>Saved on this device until the date you choose.</span></div></div><label for="expiry-date">Scores kept until</label><input type="date" id="expiry-date" min="' + todayString() + '" value="' + escapeHtml(expiry) + '"><p class="settings-caption">Current learner: ' + escapeHtml(currentProfile.name) + ' · stored locally on this device</p><button class="button button-danger-outline" data-action="reset-scores">' + icon("reset", 17) + ' Reset this learner’s scores</button></section></main>';
  }

  function renderQuiz() {
    const run = currentProfile.activeRun;
    if (!run) return renderHome();
    const question = currentQuestion();
    const response = run.responses[run.cursor];
    const answered = Boolean(run.pending);
    const correctCount = run.responses.filter(function (item) { return item.correct; }).length;
    const stageScore = masteredCount(run.stage);
    const skill = SKILLS[question.skill];
    const choiceMarkup = question.options.map(function (choice, index) {
      let className = "answer-option";
      if (run.selectedIndex === index) className += " selected";
      if (answered && index === question.answerIndex) className += " correct-option";
      if (answered && run.selectedIndex === index && index !== question.answerIndex) className += " wrong-option";
      return '<button class="' + className + '" data-action="select-answer" data-index="' + index + '" ' + (answered ? "disabled" : "") + ' aria-pressed="' + (run.selectedIndex === index) + '"><span class="option-letter">' + String.fromCharCode(65 + index) + '</span><span>' + escapeHtml(choice) + '</span>' + (answered && index === question.answerIndex ? '<span class="option-check">' + icon("check", 18) + '</span>' : "") + '</button>';
    }).join("");
    let feedback = "";
    if (answered) {
      feedback = '<div class="answer-feedback ' + (response.correct ? "feedback-correct" : "feedback-wrong") + '"><div class="feedback-heading">' + icon(response.correct ? "check" : "book", 20) + '<strong>' + (response.correct ? "That’s right!" : "Not quite — here’s the answer") + '</strong></div><p><b>' + escapeHtml(question.word) + '</b> means ' + escapeHtml(question.meaning) + '</p>' + (!response.correct ? '<span class="your-answer">Your choice: ' + escapeHtml(response.selectedText) + '</span>' : "") + '</div>';
    }
    return '<main class="quiz-page"><button class="back-link" data-action="exit-quiz">' + icon("back", 18) + ' Back to stages</button>' +
      '<div class="quiz-topline"><span>' + escapeHtml(stageInfo(run.stage).title) + (run.practice ? ' · Unanswered words' : ' · First quiz') + '</span><span>Question ' + (run.cursor + 1) + ' of ' + run.questions.length + '</span></div>' +
      progressBar(run.cursor + (answered ? 1 : 0), run.questions.length, "quiz-progress") +
      '<div class="quiz-scoreboard"><div><span>First-quiz score</span><strong>' + stageScore + '<small> / 20</small></strong></div><div><span>Right this round</span><strong>' + correctCount + '</strong></div><div><span>Accuracy</span><strong>' + percent(correctCount, run.responses.length) + '<small>%</small></strong></div></div>' +
      '<section class="question-card"><div class="question-meta"><span class="skill-tag">' + icon(skill.icon, 16) + ' ' + escapeHtml(skill.title) + '</span><span class="question-count">WORD ' + (run.cursor + 1).toString().padStart(2, "0") + '</span></div>' +
      (question.skill === "definition" ? '<h1 class="target-word">' + escapeHtml(question.word) + '</h1>' : "") +
      '<h2 class="question-prompt">' + escapeHtml(question.prompt) + '</h2>' +
      (question.context ? '<blockquote class="context-sentence">' + escapeHtml(question.context).replace(new RegExp(escapeRegex(question.word), "ig"), function (match) { return '<b>' + escapeHtml(match) + '</b>'; }) + '</blockquote>' : "") +
      '<div class="answer-list">' + choiceMarkup + '</div>' +
      (!answered ? '<button class="button button-primary confirm-button" data-action="confirm-answer" ' + (run.selectedIndex == null ? "disabled" : "") + '>Confirm answer ' + icon("arrow", 18) + '</button>' : feedback) +
      (answered ? '<button class="button button-primary confirm-button" data-action="next-question">' + (run.cursor === run.questions.length - 1 ? "See my results" : "Next word") + ' ' + icon("arrow", 18) + '</button>' : "") +
      '</section><p class="quiz-note">You can change your choice until you confirm it.</p></main>';
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
  }

  function renderResults() {
    const result = currentProfile.lastResult;
    if (!result) return renderHome();
    const completed = stageComplete(result.stage);
    const next = STAGES[STAGES.findIndex(function (stage) { return stage.id === result.stage; }) + 1];
    const canAdvance = Boolean(next && stageUnlocked(next.id));
    const orderedResponses = result.responses.map(function (item, index) { return { item: item, index: index }; }).sort(function (left, right) {
      if (left.item.correct !== right.item.correct) return left.item.correct ? 1 : -1;
      return left.index - right.index;
    });
    let firstMistake = true;
    const responseRows = orderedResponses.map(function (entry) {
      const item = entry.item;
      const mark = item.correct ? icon("check", 17) : icon("close", 17);
      const badge = item.correct ? "" : '<span class="mistake-badge">' + (firstMistake ? "First mistake" : "Mistake") + '</span>';
      const expanded = !item.correct && firstMistake ? " open" : "";
      if (!item.correct && firstMistake) firstMistake = false;
      return '<details class="result-answer ' + (item.correct ? "result-correct" : "result-wrong") + '"' + expanded + '><summary><span class="result-number">Q' + (entry.index + 1).toString().padStart(2, "0") + '</span><span class="result-word">' + escapeHtml(item.word) + '<small>' + escapeHtml(SKILLS[item.skill].title) + '</small></span>' + badge + '<span class="result-mark">' + mark + '</span></summary><div class="result-detail">' + (item.context ? '<p class="result-context">' + escapeHtml(item.context) + '</p>' : "") + '<p><b>Your answer:</b> ' + escapeHtml(item.selectedText) + '</p><p><b>Correct answer:</b> ' + escapeHtml(item.answerText) + '</p><p><b>Meaning:</b> ' + escapeHtml(item.meaning) + '</p></div></details>';
    }).join("");
    let nextActions = "";
    if (completed || canAdvance) {
      nextActions = (next ? '<button class="button button-primary" data-action="start-round" data-stage="' + next.id + '">Advance to ' + escapeHtml(next.title) + ' ' + icon("arrow", 17) + '</button>' : '<div class="complete-banner">' + icon("trophy", 20) + '<span>You completed all three stages. Amazing word work!</span></div>') +
        (completed && unansweredCount(result.stage) ? '<button class="button button-soft" data-action="start-practice" data-stage="' + result.stage + '">Try unanswered words</button>' : "");
    } else {
      nextActions = '<button class="button button-primary" data-action="start-round" data-stage="' + result.stage + '">Try another round ' + icon("arrow", 17) + '</button>';
    }
    return '<main class="page result-page"><button class="back-link" data-action="go-home">' + icon("back", 18) + ' Back to stages</button>' +
      '<section class="result-hero ' + (completed ? "result-stage-complete" : "") + '"><div class="result-hero-icon">' + icon(completed ? "trophy" : "spark", 27) + '</div><p class="eyebrow">' + (result.practice ? "PRACTICE COMPLETE" : completed ? "FIRST QUIZ COMPLETE" : "ROUND COMPLETE") + '</p><h1>' + (result.practice ? "Nice extra practice." : completed ? "You did it!" : "Nice work, " + escapeHtml(currentProfile.name) + ".") + '</h1><p>' + escapeHtml(result.stageTitle) + (result.practice ? " unanswered-word practice" : " quiz") + ' · ' + result.total + ' questions answered</p><div class="result-stats"><div><strong>' + result.correct + '<small> / ' + result.total + '</small></strong><span>Correct this round</span></div><div><strong>' + result.accuracy + '<small>%</small></strong><span>Round accuracy</span></div><div><strong>' + Math.min(20, result.mastered) + '<small> / 20</small></strong><span>Official first-quiz score</span></div></div>' + progressBar(result.mastered, 20, "result-progress") + '<p class="result-hint">' + (result.practice ? "Your official first-quiz score stays locked; answered questions are never reused." : "This is your stage score from the first 20-question quiz. You may advance now, regardless of score.") + '</p></section>' +
      '<section class="results-list"><div class="section-heading"><h2>Answer review</h2><span>' + result.correct + ' RIGHT · ' + result.wrong + ' WRONG · MISTAKES FIRST</span></div><div class="answer-review-list">' + responseRows + '</div></section>' +
      '<div class="result-actions">' + nextActions + '</div></main>';
  }

  function renderProfiles() { return renderTeacherDashboard(); }

  function renderModal() {
    if (!modal) return "";
    if (modal === "advance-50") {
      const run = currentProfile && currentProfile.activeRun;
      if (!run) return "";
      const next = STAGES[STAGES.findIndex(function (stage) { return stage.id === run.stage; }) + 1];
      const quizFinished = run.responses.length >= run.questions.length;
      const correctCount = run.responses.filter(function (response) { return response.correct; }).length;
      const detail = quizFinished
        ? 'You answered all 20 questions. Your first-quiz score is ' + correctCount + '/20 and is now final.'
        : 'If you advance now, this quiz will pause. Come back later to finish all 20 questions and see your final score.';
      const advance = next ? '<button class="button button-primary" data-action="advance-now">Advance to ' + escapeHtml(next.title) + ' ' + icon("arrow", 17) + '</button>' : '<p class="modal-inline-note">This is the final stage. Continue to finish the quiz.</p>';
      const continueText = quizFinished ? "Continue to results" : "Continue this quiz";
      return '<div class="modal-backdrop advance-backdrop" role="presentation"><section class="confirm-modal advance-modal" role="dialog" aria-modal="true" aria-labelledby="advance-title"><button class="modal-close" data-action="close-modal" aria-label="Close">' + icon("close", 18) + '</button><span class="modal-icon advance-icon">' + icon("arrow", 23) + '</span><p class="eyebrow">50% QUIZ GOAL</p><h2 id="advance-title">You got 10 answers right!</h2><p>' + detail + '</p><div class="modal-actions advance-actions">' + advance + '<button class="button button-soft" data-action="continue-quiz">' + continueText + '</button></div></section></div>';
    }
    if (modal === "reset") {
      return '<div class="modal-backdrop" role="presentation"><section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" data-action="close-modal" aria-label="Close">' + icon("close", 18) + '</button><span class="modal-icon danger">' + icon("reset", 22) + '</span><h2 id="modal-title">Reset ' + escapeHtml(currentProfile.name) + '’s scores?</h2><p>This clears this learner’s quiz scores, activity history, and any unfinished or paused quizzes from this device. Other learner profiles stay as they are.</p><div class="modal-actions"><button class="button button-soft" data-action="close-modal">Keep scores</button><button class="button button-danger" data-action="confirm-reset">Reset scores</button></div></section></div>';
    }
    return "";
  }

  function render() {
    document.documentElement.dataset.theme = state.theme === "dark" ? "dark" : "light";
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const themeColor = state.theme === "dark" ? "#061a14" : "#84e9a3";
    if (themeMeta) themeMeta.setAttribute("content", themeColor);
    if (window.WordTrailAndroid && typeof window.WordTrailAndroid.setTheme === "function") {
      window.WordTrailAndroid.setTheme(state.theme === "dark" ? "dark" : "light");
    }
    if (view !== "teacher-setup" && view !== "auth" && !currentRole) view = state.teacher ? "auth" : "teacher-setup";
    if (currentRole === "teacher" && !currentProfile && view !== "teacher-setup" && view !== "auth") view = "teacher";
    if (view === "teacher-setup" || view === "auth") {
      app.innerHTML = '<div class="app-shell public-shell">' + renderTopbar() + renderWelcome() + '</div>';
    } else if (view === "teacher" && currentRole === "teacher" && !currentProfile) {
      app.innerHTML = '<div class="app-shell teacher-shell">' + renderTopbar() + renderTeacherDashboard() + '</div>';
    } else if (!currentProfile) {
      view = "auth";
      app.innerHTML = '<div class="app-shell public-shell">' + renderTopbar() + renderAuth() + '</div>';
    } else {
      let content = "";
      if (view === "home") content = renderHome();
      else if (view === "progress") content = renderProgress();
      else if (view === "quiz") content = renderQuiz();
      else if (view === "results") content = renderResults();
      else content = renderHome();
      app.innerHTML = '<div class="app-shell' + (view === "quiz" ? " quiz-shell" : "") + '">' + renderTopbar() + content + (view === "quiz" ? "" : renderBottomNav()) + '</div>' + renderModal();
    }
    if (toastText) {
      app.insertAdjacentHTML("beforeend", '<div class="toast" role="status">' + escapeHtml(toastText) + '</div>');
    }
    if (levelUpText) {
      app.insertAdjacentHTML("beforeend", '<div class="level-up-toast" role="status" aria-live="polite"><span class="level-up-spark">' + icon("trophy", 21) + '</span><span>' + escapeHtml(levelUpText) + '</span></div>');
    }
  }

  window.WordTrailHandleBack = function () {
    if (modal) {
      modal = "";
      render();
      return true;
    }
    if (view === "quiz" && currentProfile && currentProfile.activeRun) {
      view = "home";
      render();
      return true;
    }
    if (view === "results" || view === "progress") {
      view = "home";
      render();
      return true;
    }
    if (currentRole === "teacher" && currentProfile) {
      currentProfile = null;
      state.currentProfileId = "";
      view = "teacher";
      saveState();
      render();
      return true;
    }
    if (view === "teacher" && currentRole === "teacher") {
      view = "auth";
      render();
      return true;
    }
    return false;
  };

  app.addEventListener("submit", function (event) {
    if (event.target.id === "teacher-setup-form") {
      event.preventDefault();
      const formData = new FormData(event.target);
      const name = String(formData.get("name") || "").trim();
      const username = String(formData.get("username") || "").trim();
      const pin = String(formData.get("pin") || "");
      if (!name || !username || pin.length < 4) return;
      state.teacher = { name: name, username: username, pin: pin };
      currentRole = "teacher";
      currentProfile = null;
      view = "teacher";
      saveState();
      render();
    } else if (event.target.id === "teacher-login-form") {
      event.preventDefault();
      const formData = new FormData(event.target);
      const username = String(formData.get("username") || "").trim().toLowerCase();
      const pin = String(formData.get("pin") || "");
      if (state.teacher && username === String(state.teacher.username).toLowerCase() && pin === state.teacher.pin) {
        currentRole = "teacher";
        currentProfile = null;
        state.currentProfileId = "";
        view = "teacher";
        render();
      } else {
        showToast("That teacher username or password is not correct.");
      }
    } else if (event.target.id === "student-login-form") {
      event.preventDefault();
      const formData = new FormData(event.target);
      const username = String(formData.get("username") || "").trim().toLowerCase();
      const pin = String(formData.get("pin") || "");
      const profile = (state.profiles || []).find(function (entry) {
        return entry.username && String(entry.username).toLowerCase() === username && entry.pin === pin;
      });
      if (profile) activateLearner(profile.id, "student");
      else showToast("That student username or password is not correct.");
    } else if (event.target.id === "student-create-form") {
      event.preventDefault();
      const formData = new FormData(event.target);
      const name = String(formData.get("name") || "").trim();
      const username = String(formData.get("username") || "").trim().toLowerCase();
      const pin = String(formData.get("pin") || "");
      if (!name || !username || pin.length < 4) return;
      if ((state.profiles || []).some(function (entry) { return entry.username && String(entry.username).toLowerCase() === username; })) {
        showToast("That username is already in use. Please choose another one.");
        return;
      }
      createStudentAccount(name, username, pin);
    } else if (event.target.id === "new-profile-form") {
      event.preventDefault();
      if (currentRole !== "teacher") {
        showToast("Only a teacher can add a learner account.");
        return;
      }
      const formData = new FormData(event.target);
      const name = String(formData.get("nickname") || "").trim();
      if (name) createProfile(name);
    }
  });

  app.addEventListener("change", function (event) {
    if (event.target.id === "expiry-date" && currentProfile) {
      if (!event.target.value) {
        showToast("Choose a valid storage date.");
        return;
      }
      currentProfile.expiresAt = event.target.value;
      saveState();
      showToast("Score storage date updated.");
    }
  });

  app.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    const stageId = button.getAttribute("data-stage");

    if (action === "toggle-theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      saveState();
      render();
    } else if (action === "auth-mode") {
      authMode = button.getAttribute("data-mode") === "teacher" ? "teacher" : "student";
      authStudentCreate = false;
      render();
    } else if (action === "student-create-mode") {
      authStudentCreate = true;
      render();
    } else if (action === "student-login-mode") {
      authStudentCreate = false;
      render();
    } else if (action === "student-login") {
      activateLearner(button.getAttribute("data-id"), "student");
    } else if (action === "open-learner") {
      if (currentRole !== "teacher") {
        showToast("Only a teacher can open learner records.");
      } else {
        activateLearner(button.getAttribute("data-id"), "teacher");
      }
    } else if (action === "manage-learners") {
      if (currentRole === "teacher") {
        currentProfile = null;
        state.currentProfileId = "";
        view = "teacher";
        modal = "";
        render();
      }
    } else if (action === "logout") {
      currentRole = "";
      currentProfile = null;
      state.currentProfileId = "";
      authMode = "student";
      modal = "";
      view = "auth";
      saveState();
      render();
    } else if (action === "go-home" || action === "nav-home") {
      view = currentRole === "teacher" && !currentProfile ? "teacher" : currentProfile ? "home" : "auth";
      modal = "";
      render();
    } else if (action === "nav-progress") {
      if (currentProfile) {
        view = "progress";
        render();
      }
    } else if (action === "profiles") {
      if (currentRole === "teacher") {
        currentProfile = null;
        view = "teacher";
        render();
      }
    } else if (action === "choose-profile") {
      if (currentRole === "teacher") activateLearner(button.getAttribute("data-id"), "teacher");
    } else if (action === "start-round") {
      if (!stageUnlocked(stageId)) {
        showToast("Reach 10 correct answers or finish all 20 questions in the previous quiz.");
      } else {
        buildRun(stageId, "mixed", false);
      }
    } else if (action === "start-practice") {
      buildRun(stageId, "practice", true);
    } else if (action === "resume") {
      view = "quiz";
      render();
    } else if (action === "resume-paused") {
      if (currentProfile.activeRun) {
        showToast("Finish or pause your current quiz first.");
        return;
      }
      const paused = currentProfile.pausedRuns && currentProfile.pausedRuns[stageId];
      if (paused) {
        currentProfile.activeRun = paused;
        delete currentProfile.pausedRuns[stageId];
        view = "quiz";
        saveState();
        render();
      }
    } else if (action === "exit-quiz") {
      view = "home";
      render();
    } else if (action === "select-answer") {
      const run = currentProfile && currentProfile.activeRun;
      if (run && !run.pending) {
        run.selectedIndex = Number(button.getAttribute("data-index"));
        saveState();
        render();
      }
    } else if (action === "confirm-answer") {
      answerQuestion();
    } else if (action === "next-question") {
      nextQuestion();
    } else if (action === "continue-quiz") {
      modal = "";
      render();
    } else if (action === "advance-now") {
      const run = currentProfile && currentProfile.activeRun;
      if (!run || !run.official || run.responses.filter(function (response) { return response.correct; }).length < ROUND_SIZE / 2) return;
      const stage = getStage(run.stage);
      stage.advanceUnlocked = true;
      if (run.responses.length >= run.questions.length) {
        modal = "";
        finishRun();
      } else {
        currentProfile.pausedRuns[run.stage] = run;
        currentProfile.activeRun = null;
        view = "home";
        modal = "";
        saveState();
        render();
      }
    } else if (action === "reset-scores") {
      modal = "reset";
      render();
    } else if (action === "close-modal") {
      modal = "";
      render();
    } else if (action === "confirm-reset") {
      const learnerId = currentProfile.id;
      state.history = (state.history || []).filter(function (entry) { return entry.learnerId !== learnerId; });
      currentProfile.stages = emptyStages();
      currentProfile.activeRun = null;
      currentProfile.pausedRuns = {};
      currentProfile.lastResult = null;
      currentProfile.expiresAt = localDateString(addDays(new Date(), RETENTION_DAYS));
      modal = "";
      view = "home";
      saveState();
      showToast("Scores reset. A fresh word journey starts now.");
    }
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js").catch(function () {});
    });
  }

  render();
})();
