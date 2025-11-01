// === CONFIGURATION ===
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzP8Ie9X5FSvyDAC2KG94a9HGmlFOHuy_vj2Lkv9mAY5JBPabVt4gYX5Ir48FWcW6rg/exec";
const QUIZ_DURATION_MINUTES = 20;

// === GLOBAL DATA ===
window.quizData = [];
let hasSubmitted = false;
let timerInterval = null;
let currentQuestionIndex = 0;
let userAnswers = [];
let flaggedQuestions = [];
let currentStudentId = '';
let currentStudentName = '';

// === SESSION PROTECTION ===
let quizInProgress = false;
let browserHasSubmitted = false; // NEW: Track if THIS browser submitted


// Warn on page refresh/close
window.addEventListener('beforeunload', (e) => {
  if (quizInProgress && !hasSubmitted) {
    e.preventDefault();
    e.returnValue = 'Your quiz is in progress. Are you sure you want to leave?';
    return e.returnValue;
  }
});

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

// === CHECK STUDENT ID (WITH SUBMISSION CHECK) ===
async function checkStudentId() {
  const studentId = document.getElementById('student-id').value.trim();
  
  if (!studentId) {
    alert('Please enter your Student ID');
    return;
  }

 // Check if THIS browser already submitted any quiz (browser lock)
const browserSubmitted = localStorage.getItem('browser_submitted_quiz');
if (browserSubmitted === 'true') {
  alert('You have already submitted this quiz!!'); // Two exclamation marks = browser used
  document.getElementById('student-id').value = '';
  return;
}

// Check if this specific student already submitted
const submissionKey = 'hasSubmitted_' + studentId;
const alreadySubmitted = localStorage.getItem(submissionKey);

if (alreadySubmitted === 'true') {
  alert('You have already submitted this quiz!'); // One exclamation mark = student ID used
  document.getElementById('student-id').value = '';
  return;
}


  try {
    const response = await fetch('students.txt');
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    let found = false;
    let studentName = '';
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts[0] && parts[0].trim() === studentId) {
        studentName = parts[1] ? parts[1].trim() : 'Unknown';
        found = true;
        break;
      }
    }

    if (found) {
      currentStudentId = studentId;
      currentStudentName = studentName;
      
      document.getElementById('step-1-enter-id').classList.add('fade-out');
      
      setTimeout(() => {
        document.getElementById('step-1-enter-id').style.display = 'none';
        document.getElementById('step-2-confirm').style.display = 'block';
        document.getElementById('confirmed-name').textContent = studentName;
        document.getElementById('confirmed-id').textContent = `ID: ${studentId}`;
      }, 300);
      
    } else {
      alert('Student ID not found. Please check and try again.');
      document.getElementById('student-id').value = '';
      document.getElementById('student-id').focus();
    }
    
  } catch (error) {
    console.error('Student validation error:', error);
    alert('Error loading student data. Please try again.');
  }
}


// === START QUIZ AFTER CONFIRMATION ===
async function startQuizConfirmed() {
  // Mark quiz as in progress
  quizInProgress = true;
  
  // Hide login section
  document.getElementById('student-login-section').style.display = 'none';
  document.getElementById('quiz-section').style.display = 'block';
  
  // Load questions and start timer
  await loadQuestions();
  startTimer();
}

// === RESET LOGIN ===
function resetLogin() {
  // Reset stored values
  currentStudentId = '';
  currentStudentName = '';
  
  // Clear input
  document.getElementById('student-id').value = '';
  
  // Show step 1, hide step 2
  document.getElementById('step-2-confirm').classList.add('fade-out');
  
  setTimeout(() => {
    document.getElementById('step-2-confirm').style.display = 'none';
    document.getElementById('step-2-confirm').classList.remove('fade-out');
    document.getElementById('step-1-enter-id').style.display = 'block';
    document.getElementById('step-1-enter-id').classList.remove('fade-out');
    document.getElementById('student-id').focus();
  }, 300);
}

// === LOAD QUESTIONS ===
async function loadQuestions() {
  try {
    const response = await fetch('questions.txt');
    const text = await response.text();
    
    console.log('Loading questions...');
    
    // Split by "---" separator
    const blocks = text.split('---').map(b => b.trim()).filter(b => b);
    window.quizData = [];

    blocks.forEach((block, blockIndex) => {
      const lines = block.split(/\r?\n/).map(line => line.trim()).filter(line => line);
      
      if (lines.length === 0) return;

      let question = '';
      let options = [];
      let correct = [];

      lines.forEach((line) => {
        // Question line (starts with Q:)
        if (line.startsWith('Q:')) {
          question = line.substring(2).trim();
        }
        // Answer line (starts with A:)
        else if (line.startsWith('A:')) {
          let answerText = line.substring(2).trim();
          
          // Check if asterisk at the end
          if (answerText.endsWith('*')) {
            correct.push(options.length);
            answerText = answerText.slice(0, -1).trim(); // Remove asterisk
          }
          
          options.push(answerText);
        }
      });

      if (question && options.length > 0) {
        window.quizData.push({
          question: question,
          options: options,
          correct: correct
        });
        
        console.log(`Q${blockIndex + 1}: ${question.substring(0, 30)}... [${correct.length} correct answer(s)]`);
      }
    });

    console.log(`✅ Successfully loaded ${window.quizData.length} questions`);
    
    // Debug first question
    if (window.quizData.length > 0) {
      console.log('Sample question:', window.quizData[0]);
    }
    
    // Check if no questions loaded
    if (window.quizData.length === 0) {
      alert('No questions found in questions.txt. Please check the file format.');
      return;
    }
    
    // Validate questions
    const invalidQuestions = window.quizData
      .map((q, idx) => q.correct.length === 0 ? idx + 1 : null)
      .filter(q => q !== null);
    
    if (invalidQuestions.length > 0) {
      console.warn(`⚠️ Questions with no correct answers: Q${invalidQuestions.join(', Q')}`);
    } else {
      console.log('✅ All questions have correct answers marked!');
    }

    // Initialize user answers array
    userAnswers = new Array(window.quizData.length).fill(null).map(() => []);
    
    // Display first question
    if (window.quizData.length > 0) {
      displayQuestion(0);
      updateQuestionStatus();
    }

  } catch (error) {
    console.error('❌ Error loading questions:', error);
    alert('Failed to load questions. Please check console (F12) for details.');
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
  
  // Build question HTML with student watermark
  let html = `
    <div class="question-header-row">
      <div class="question-number">Question ${index + 1}</div>
      <div class="student-watermark">for ${currentStudentName}</div>
    </div>
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

// Continue in next part...
// ... (continued from Part 1)

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
  const btnFlag = document.getElementById('btn-flag');
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

// === SUBMIT QUIZ (WITH SPINNER) ===
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

  // Show loading spinner
  document.getElementById('loading-overlay').style.display = 'flex';
  
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

    // Hide loading spinner
    document.getElementById('loading-overlay').style.display = 'none';

if (result.status === 'SUCCESS') {
  hasSubmitted = true;
  quizInProgress = false;
  browserHasSubmitted = true; // NEW
  
  // Mark this student as submitted
  localStorage.setItem('hasSubmitted_' + currentStudentId, 'true');
  
  // NEW: Mark this browser as having submitted ANY quiz
  localStorage.setItem('browser_submitted_quiz', 'true');
  
  // Show results
  document.getElementById('quiz-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'block';
  document.getElementById('result-student-name').textContent = currentStudentName;
  document.getElementById('result-time').textContent = new Date().toLocaleString();
}

 else {
      alert('Submission failed: ' + (result.message || 'Unknown error'));
    }

  } catch (error) {
    console.error('Submission error:', error);
    
    // Hide loading spinner
    document.getElementById('loading-overlay').style.display = 'none';
    
    alert('Failed to submit quiz. Please try again or contact your professor.');
  }
}

// === ANTI-CHEATING MEASURES ===
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
  if (document.hidden && quizInProgress) {
    console.warn('Student switched tabs at: ' + new Date().toISOString());
  }
});

// === INITIALIZE ===
window.addEventListener('DOMContentLoaded', () => {
  checkExamAccess();
});


