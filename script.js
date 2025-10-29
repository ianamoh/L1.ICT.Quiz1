// === CONFIGURATION ===
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzP8Ie9X5FSvyDAC2KG94a9HGmlFOHuy_vj2Lkv9mAY5JBPabVt4gYX5Ir48FWcW6rg/exec";
const QUIZ_DURATION_MINUTES = 20;

// === GLOBAL DATA ===
window.quizData = [];
let hasSubmitted = false;
let timerInterval = null;

// === NEW: Single Question Navigation ===
let currentQuestionIndex = 0;
let userAnswers = [];
let flaggedQuestions = [];
let currentStudentId = '';
let currentStudentName = '';

// === ACCESS CONTROL ===
async function checkExamAccess() {
  try {
    const response = await fetch(`${APPSCRIPT_URL}`);
    const data = await response.json();
    console.log("Access check:", data);

    const overlay = document.getElementById("global-lockout-message");
    const textDiv = document.getElementById("lockout-text");
    const quizApp = document.getElementById("quiz-app");

    if (data.access === "open") {
      overlay.style.display = "none";
      quizApp.style.display = "block";
      console.log("Server UTC time:", data.now);
      return true;
    } else {
      textDiv.textContent = data.message || "Exam is currently closed.";
      overlay.style.display = "flex";
      quizApp.style.display = "none";
      return false;
    }
  } catch (error) {
    console.error("Access check failed:", error);
    alert("Unable to verify exam access. Please check your connection.");
    return false;
  }
}

// === STUDENT VALIDATION ===
async function validateStudent() {
  const studentId = document.getElementById('student-id').value.trim();
  
  if (!studentId) {
    alert('Please enter your Student ID');
    return;
  }

  try {
    const response = await fetch('students.txt');
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    let found = false;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts[0] && parts[0].trim() === studentId) {
        currentStudentId = studentId;
        currentStudentName = parts[1] ? parts[1].trim() : 'Unknown';
        found = true;
        break;
      }
    }

    if (found) {
      // Hide login, show quiz
      document.getElementById('student-login-section').style.display = 'none';
      document.getElementById('quiz-section').style.display = 'block';
      
      // Load questions and start
      await loadQuestions();
      startTimer();
    } else {
      alert('Invalid Student ID. Please check and try again.');
    }
  } catch (error) {
    console.error('Student validation error:', error);
    alert('Error loading student data. Please try again.');
  }
}

// === LOAD QUESTIONS ===
async function loadQuestions() {
  try {
    const response = await fetch('questions.txt');
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    let currentQuestion = null;
    window.quizData = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Question line (starts with number and period)
      if (/^\d+\./.test(line)) {
        if (currentQuestion) {
          window.quizData.push(currentQuestion);
        }
        currentQuestion = {
          question: line,
          options: [],
          correct: []
        };
      }
      // Option line (starts with letter and parenthesis)
      else if (/^[a-z]\)/.test(line)) {
        if (currentQuestion) {
          const optionText = line.substring(2).trim();
          const isCorrect = optionText.startsWith('*');
          const cleanText = isCorrect ? optionText.substring(1).trim() : optionText;
          
          currentQuestion.options.push(cleanText);
          if (isCorrect) {
            currentQuestion.correct.push(currentQuestion.options.length - 1);
          }
        }
      }
    }

    // Push last question
    if (currentQuestion) {
      window.quizData.push(currentQuestion);
    }

    console.log(`Loaded ${window.quizData.length} questions`);
    
    // Validate questions
    const invalidQuestions = window.quizData
      .map((q, idx) => q.correct.length === 0 ? idx + 1 : null)
      .filter(q => q !== null);
    
    if (invalidQuestions.length > 0) {
      console.warn(`⚠️ Questions with no correct answers: Q${invalidQuestions.join(', Q')}`);
    }

    // Initialize user answers array
    userAnswers = new Array(window.quizData.length).fill(null).map(() => []);
    
    // Display first question
    displayQuestion(0);
    updateQuestionStatus();

  } catch (error) {
    console.error('Error loading questions:', error);
    alert('Failed to load questions. Please refresh the page.');
  }
}

// === SINGLE QUESTION DISPLAY ===
function displayQuestion(index) {
  currentQuestionIndex = index;
  const question = window.quizData[index];
  const card = document.getElementById('question-card');
  
  // Update question counter
  document.getElementById('current-q-num').textContent = index + 1;
  document.getElementById('total-q-num').textContent = window.quizData.length;
  
  // Update progress
  const progress = ((index + 1) / window.quizData.length) * 100;
  document.getElementById('progress-fill').style.width = progress + '%';
  document.getElementById('progress-percent').textContent = Math.round(progress) + '%';
  
  // Build question HTML
  let html = `
    <div class="question-number">Question ${index + 1}</div>
    <div class="question-text">${question.question}</div>
    <div class="options-container">
  `;
  
  question.options.forEach((option, i) => {
    const optionLetter = String.fromCharCode(97 + i); // a, b, c, d...
    const isSelected = userAnswers[index] && userAnswers[index].includes(i);
    
    html += `
      <div class="option-item ${isSelected ? 'selected' : ''}" onclick="selectOption(${index}, ${i})">
        <div class="option-checkbox"></div>
        <div class="option-label">${optionLetter}) ${option}</div>
      </div>
    `;
  });
  
  html += `</div>`;
  
  card.innerHTML = html;
  
  // Add slide animation
  card.style.animation = 'none';
  setTimeout(() => {
    card.style.animation = 'fadeIn 0.5s ease';
  }, 10);
  
  // Update button states
  updateNavigationButtons(index);
  updateQuestionStatus();
}

// === SELECT OPTION ===
function selectOption(questionIndex, optionIndex) {
  if (!userAnswers[questionIndex]) {
    userAnswers[questionIndex] = [];
  }
  
  // Toggle selection
  const answerIndex = userAnswers[questionIndex].indexOf(optionIndex);
  if (answerIndex > -1) {
    userAnswers[questionIndex].splice(answerIndex, 1);
  } else {
    userAnswers[questionIndex].push(optionIndex);
  }
  
  // Redisplay question to update UI
  displayQuestion(questionIndex);
}

// === NAVIGATION ===
function nextQuestion() {
  if (currentQuestionIndex < window.quizData.length - 1) {
    currentQuestionIndex++;
    displayQuestion(currentQuestionIndex);
  }
}

function previousQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    displayQuestion(currentQuestionIndex);
  }
}

function jumpToQuestion(index) {
  currentQuestionIndex = index;
  displayQuestion(index);
}

// === FLAG QUESTION ===
function flagQuestion() {
  const index = flaggedQuestions.indexOf(currentQuestionIndex);
  if (index > -1) {
    flaggedQuestions.splice(index, 1);
  } else {
    flaggedQuestions.push(currentQuestionIndex);
  }
  
  const btn = document.getElementById('btn-flag');
  const icon = document.getElementById('flag-icon');
  
  if (flaggedQuestions.includes(currentQuestionIndex)) {
    btn.classList.add('flagged');
    icon.textContent = '🚩';
  } else {
    btn.classList.remove('flagged');
    icon.textContent = '🏳️';
  }
  
  updateQuestionStatus();
}

// === UPDATE UI ELEMENTS ===
function updateNavigationButtons(index) {
  const btnPrev = document.getElementById('btn-previous');
  const btnNext = document.getElementById('btn-next');
  const btnSubmit = document.getElementById('btn-submit');
  const btnFlag = document.getElementById('btn-flag');
  
  // Previous button
  btnPrev.style.display = index > 0 ? 'block' : 'none';
  
  // Next/Submit button
  if (index === window.quizData.length - 1) {
    btnNext.style.display = 'none';
    btnSubmit.style.display = 'block';
  } else {
    btnNext.style.display = 'block';
    btnSubmit.style.display = 'none';
  }
  
  // Update flag button state
  if (flaggedQuestions.includes(index)) {
    btnFlag.classList.add('flagged');
    document.getElementById('flag-icon').textContent = '🚩';
  } else {
    btnFlag.classList.remove('flagged');
    document.getElementById('flag-icon').textContent = '🏳️';
  }
}

function updateQuestionStatus() {
  const container = document.getElementById('question-status');
  let html = '';
  
  for (let i = 0; i < window.quizData.length; i++) {
    let statusClass = 'status-unanswered';
    
    if (flaggedQuestions.includes(i)) {
      statusClass = 'status-flagged';
    } else if (userAnswers[i] && userAnswers[i].length > 0) {
      statusClass = 'status-answered';
    }
    
    html += `<div class="status-dot ${statusClass}" onclick="jumpToQuestion(${i})" title="Question ${i + 1}">${i + 1}</div>`;
  }
  
  container.innerHTML = html;
}

// === TIMER ===
function startTimer() {
  let timeLeft = QUIZ_DURATION_MINUTES * 60;
  const timerDisplay = document.getElementById('time-remaining');
  const timerContainer = document.querySelector('.timer-display');

  timerInterval = setInterval(() => {
    timeLeft--;

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Warning colors
    if (timeLeft <= 60) {
      timerContainer.style.background = 'linear-gradient(135deg, #fecaca, #fca5a5)';
    } else if (timeLeft <= 300) {
      timerContainer.style.background = 'linear-gradient(135deg, #fed7aa, #fdba74)';
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      alert('Time is up! Submitting your quiz...');
      submitQuiz();
    }
  }, 1000);
}

// === SUBMIT QUIZ ===
async function submitQuiz() {
  if (hasSubmitted) {
    alert('You have already submitted this quiz.');
    return;
  }

  // Check for unanswered questions
  const unanswered = userAnswers.filter(ans => !ans || ans.length === 0).length;
  
  if (unanswered > 0) {
    const confirmSubmit = confirm(
      `You have ${unanswered} unanswered question(s). Do you want to submit anyway?`
    );
    if (!confirmSubmit) return;
  }

  // Stop timer
  clearInterval(timerInterval);

  // Calculate score
  let score = 0;
  let allAnswersStr = '';

  window.quizData.forEach((question, qIndex) => {
    const userAns = userAnswers[qIndex] || [];
    const correctAns = question.correct;
    
    // Check if answer is correct
    const isCorrect = JSON.stringify(userAns.sort()) === JSON.stringify(correctAns.sort());
    if (isCorrect) score++;
    
    // Build answer string
    const ansStr = userAns.length > 0 ? userAns.map(i => i + 1).join('|') : 'X';
    allAnswersStr += `${qIndex + 1}:${ansStr}, `;
  });

  allAnswersStr = `(${allAnswersStr.slice(0, -2)})`;

  console.log('Submitting quiz:', {
    studentId: currentStudentId,
    studentName: currentStudentName,
    score: score,
    totalQuestions: window.quizData.length,
    allAnswers: allAnswersStr
  });

  const payload = {
    studentId: currentStudentId,
    studentName: currentStudentName,
    score: score,
    totalQuestions: window.quizData.length,
    allAnswers: allAnswersStr
  };

  try {
    const res = await fetch(`${APPSCRIPT_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const result = await res.json();
    console.log('Submission result:', result);

    if (result.status === 'SUCCESS') {
      hasSubmitted = true;
      localStorage.setItem('hasSubmitted_' + currentStudentId, 'true');
      
      // Show results
      document.getElementById('quiz-section').style.display = 'none';
      document.getElementById('results-section').style.display = 'block';
      document.getElementById('result-student-name').textContent = currentStudentName;
      document.getElementById('result-time').textContent = new Date().toLocaleString();
      
    } else {
      alert('Submission failed: ' + (result.message || 'Unknown error'));
    }

  } catch (error) {
    console.error('Submission error:', error);
    alert('Failed to submit quiz. Please try again or contact your professor.');
  }
}

// === ANTI-CHEATING MEASURES (Optional) ===
// Disable right-click
document.addEventListener('contextmenu', e => e.preventDefault());

// Disable print screen
document.addEventListener('keyup', e => {
  if (e.key === 'PrintScreen') {
    navigator.clipboard.writeText('');
    alert('Screenshots are disabled during the quiz.');
  }
});

// Detect tab switching
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.warn('Student switched tabs at: ' + new Date().toISOString());
  }
});

// === INITIALIZE ===
window.addEventListener('DOMContentLoaded', () => {
  checkExamAccess();
});
