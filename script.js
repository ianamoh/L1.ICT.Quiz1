// === CONFIGURATION ===
//const APPSCRIPT_URL = "http://127.0.0.1:5000";
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzP8Ie9X5FSvyDAC2KG94a9HGmlFOHuy_vj2Lkv9mAY5JBPabVt4gYX5Ir48FWcW6rg/exec";
const QUIZ_DURATION_MINUTES = 20; // ⚙️ Change this to set quiz duration

// === GLOBAL DATA ===
window.quizData = [];
let hasSubmitted = false;
let timerInterval = null;

// === ACCESS CONTROL ===
async function checkExamAccess() {
  try {
    //const response = await fetch(`${APPSCRIPT_URL}/exam-access`);
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
      textDiv.textContent = data.message || "Access Closed.";
      overlay.style.display = "flex";
      quizApp.style.display = "none";
      return false;
    }
  } catch (err) {
    console.error("Access check failed:", err);
    const overlay = document.getElementById("global-lockout-message");
    const textDiv = document.getElementById("lockout-text");
    textDiv.textContent = "Connection error. Please try again.";
    overlay.style.display = "flex";
    return false;
  }
}

// === INITIALIZATION ===
window.addEventListener("DOMContentLoaded", async () => {
  // Check if already submitted - show beautiful message instead of alert
  if (localStorage.getItem('quizSubmitted') === 'true') {
    document.body.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        margin: 0;
        padding: 20px;
      ">
        <div style="
          background: white;
          padding: 40px 60px;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          text-align: center;
          max-width: 500px;
        ">
          <div style="
            font-size: 64px;
            color: #667eea;
            margin-bottom: 20px;
          ">✓</div>
          <h1 style="
            color: #333;
            margin: 0 0 15px 0;
            font-size: 1.8em;
          ">Quiz Already Submitted</h1>
          <p style="
            color: #666;
            font-size: 1.1em;
            line-height: 1.6;
            margin: 0;
          ">You have already submitted this quiz. Multiple submissions are not allowed. You may now close this window.</p>
        </div>
      </div>
    `;
    return;
  }

  const allowed = await checkExamAccess();
  if (!allowed) return;
  
  await loadStudents();
  await loadQuestions();
  startTimer();
});

// === LOAD STUDENTS ===
async function loadStudents() {
  const res = await fetch("students.txt");
  const text = await res.text();
  const lines = text.trim().split("\n");
  const select = document.getElementById("student-id");

  lines.forEach(line => {
    const [code, name] = line.split(",");
    const option = document.createElement("option");
    option.value = code.trim();
    option.textContent = code.trim();
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    const selected = select.value;
    const student = lines.find(line => line.startsWith(selected));
    if (student) {
      const name = student.split(",")[1];
      document.getElementById("student-name").value = name.trim();
    }
  });
}

// === LOAD QUESTIONS ===
async function loadQuestions() {
  const res = await fetch("questions.txt");
  const text = await res.text();
  const blocks = text.trim().split(/-{3,}/);
  const container = document.getElementById("quiz-container");
  container.innerHTML = "";
  window.quizData = [];

  blocks.forEach((block, idx) => {
    const lines = block.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return;

    const questionLine = lines.find(l => l.startsWith("Q:")) || lines[0];
    const answerLines = lines.filter(l => l.startsWith("A:"));

    const questionText = questionLine.replace(/^Q:\s*/, "").trim();

    const answers = answerLines.map(a => {
      const text = a.replace(/^A:\s*/, "").replace(/\*$/, "").trim();
      const correct = a.endsWith("*");
      return { text, correct };
    });

    quizData.push({
      number: idx + 1,
      question: questionText,
      answers: answers,
      multiCorrect: answers.filter(a => a.correct).length > 1
    });

    const qDiv = document.createElement("div");
    qDiv.className = "question";

    const title = document.createElement("strong");
    title.textContent = `${idx + 1}. ${questionText}`;
    qDiv.appendChild(title);

    const inputType = answers.filter(a => a.correct).length > 1 ? "checkbox" : "radio";

    answers.forEach((ans, ansIdx) => {
      const optionDiv = document.createElement("div");
      optionDiv.className = "option";

      const input = document.createElement("input");
      input.type = inputType;
      input.name = `q${idx + 1}`;
      input.value = ansIdx + 1;
      input.id = `q${idx + 1}_${ansIdx}`;

      const label = document.createElement("label");
      label.htmlFor = input.id;
      label.textContent = ans.text;

      optionDiv.appendChild(input);
      optionDiv.appendChild(label);
      qDiv.appendChild(optionDiv);
    });

    container.appendChild(qDiv);
  });

  document.getElementById("submit-button").style.display = "block";

  // Validation: Check for questions without correct answers
  const invalidQuestions = quizData.filter(q => 
    q.answers.filter(a => a.correct).length === 0
  );

  if (invalidQuestions.length > 0) {
    console.error('❌ Invalid questions detected (no correct answers):', 
      invalidQuestions.map(q => `Q${q.number}`).join(', '));
  }
}

// === CALCULATE SCORE ===
function calculateScore() {
  let score = 0;

  quizData.forEach((q, idx) => {
    const selectedInputs = Array.from(
      document.querySelectorAll(`input[name="q${idx + 1}"]:checked`)
    );
    const selectedIndices = selectedInputs.map(inp => Number(inp.value));
    const correctIndices = q.answers
      .map((ans, i) => (ans.correct ? i + 1 : null))
      .filter(i => i !== null);

    // Defensive check: Skip questions with no correct answers
    if (correctIndices.length === 0) {
      console.warn(`⚠️ Question ${idx + 1} has no correct answers defined - skipping`);
      return; // Don't award points for malformed questions
    }

    const isCorrect =
      selectedIndices.length === correctIndices.length &&
      selectedIndices.every(i => correctIndices.includes(i));

    if (isCorrect) {
      score++;
      console.log(`✓ Question ${idx + 1}: Correct`);
    }
  });

  return score;
}

// === TIMER ===
function startTimer() {
  const timerElement = document.getElementById("countdown-timer");
  const timerValueElement = document.getElementById("timer-value");
  
  let timeRemaining = QUIZ_DURATION_MINUTES * 60;
  
  timerInterval = setInterval(() => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    
    timerValueElement.textContent = 
      `${minutes}:${seconds.toString().padStart(2, "0")}`;
    
    // Visual warnings
    if (timeRemaining <= 60) {
      timerElement.classList.add("critical");
      timerElement.classList.remove("warning");
    } else if (timeRemaining <= 300) {
      timerElement.classList.add("warning");
    }
    
    // Time expired
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      timerValueElement.textContent = "TIME'S UP!";
      autoSubmitQuiz();
    }
    
    timeRemaining--;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    const timerElement = document.getElementById("countdown-timer");
    timerElement.classList.add("hidden");
  }
}

function autoSubmitQuiz() {
  submitQuiz(true);
}

// === FORM SUBMISSION EVENT ===
document.getElementById("quiz-form")?.addEventListener("submit", e => {
  e.preventDefault();
  submitQuiz(false);
});

// === QUIZ SUBMISSION ===
async function submitQuiz(isAutoSubmit = false) {
  const studentId = document.getElementById("student-id").value.trim();
  const studentName = document.getElementById("student-name").value.trim();

  if (!studentId || !studentName) {
    alert("Please select your student code first.");
    return;
  }

  // Silent check - no alert
  if (localStorage.getItem('quizSubmitted') === 'true') {
    return;
  }

  if (hasSubmitted) {
    return;
  }

  // Stop timer and show loading
  stopTimer();
  
  const submitButton = document.getElementById("submit-button");
  const submitText = document.getElementById("submit-text");
  const loadingSpinner = document.getElementById("loading-spinner");
  
  submitButton.classList.add("loading");
  submitButton.disabled = true;
  submitText.style.display = "none";
  loadingSpinner.style.display = "inline";

  const allAnswers = [];
  document.querySelectorAll(".question").forEach((qDiv, i) => {
    const checked = Array.from(
      qDiv.querySelectorAll("input[type='checkbox']:checked, input[type='radio']:checked")
    );
    const selectedIndices = checked.map(inp => Number(inp.value));
    const answerText = selectedIndices.length > 0 ? selectedIndices.join("|") : "X";
    allAnswers.push(`${i + 1}:${answerText}`);
  });

  const serializedAnswers = `(${allAnswers.join(", ")})`;
  const finalScore = calculateScore();

  const payload = {
    studentId,
    studentName,
    score: finalScore,
    totalQuestions: quizData.length,
    allAnswers: serializedAnswers,
  };

  console.log("Submitting quiz:", payload);

  try {
    //const res = await fetch(`${APPSCRIPT_URL}/submit`, {
	    const res = await fetch(`${APPSCRIPT_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const data = await res.json();
    console.log("Submission result:", data);

    if (data.status === "SUCCESS") {
      // Lock submission
      localStorage.setItem('quizSubmitted', 'true');
      hasSubmitted = true;
      
      // Show success banner
      showSuccessBanner(studentName);
      
      // Disable all inputs
      document.getElementById("student-id").disabled = true;
      document.getElementById("student-name").disabled = true;
      document.querySelectorAll("input[type='checkbox'], input[type='radio']").forEach(input => {
        input.disabled = true;
      });
      
      // Scroll to top to see success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
    } else {
      // Re-enable on failure
      alert(data.message || "Submission failed. Please try again.");
      submitButton.classList.remove("loading");
      submitButton.disabled = false;
      submitText.style.display = "inline";
      loadingSpinner.style.display = "none";
    }
  } catch (err) {
    console.error("Submission error:", err);
    alert("Network error. Please try again.");
    submitButton.classList.remove("loading");
    submitButton.disabled = false;
    submitText.style.display = "inline";
    loadingSpinner.style.display = "none";
  }
}

function showSuccessBanner(studentName) {
  const banner = document.getElementById("success-banner");
  const messageElement = document.getElementById("success-message");
  
  const firstName = studentName.split(" ")[0];
  messageElement.textContent = 
    `Thank you, ${firstName}, for submitting your answers! Your test has been recorded successfully. Results will be released soon by Dr. Naoumi. You may now close this window.`;
  
  banner.style.display = "block";
  document.body.style.paddingTop = "160px";
}
