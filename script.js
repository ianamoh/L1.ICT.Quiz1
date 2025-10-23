// --- Configuration ---
// Your specific Google Apps Script Web App URL for data submission.
const GOOGLE_SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzP8Ie9X5FSvyDAC2KG94a9HGmlFOHuy_vj2Lkv9mAY5JBPabVt4gYX5Ir48FWcW6rg/exec"; 

// A placeholder for the final parsed questions and their correct answers
let quizData = [];

// Global variable to store student data (Code: Name)
let studentMap = {};

// Pagination State
const QUESTIONS_PER_PAGE = 5;
let currentPage = 0; // Starts at page 0
let studentAnswers = {}; // Stores all student answers: { qID: "selected text", ... }
// --- End Configuration ---

// --- Student Data Loading and Dropdown Functions ---

function loadStudentData() {
    fetch('students.txt')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load students.txt');
            }
            return response.text();
        })
        .then(text => {
            parseAndPopulateStudents(text);
        })
        .catch(error => {
            console.error("Error loading student data:", error);
            document.getElementById('student-id').disabled = true;
            document.getElementById('student-name').value = "Error loading student list.";
        });
}

function parseAndPopulateStudents(rawText) {
    const lines = rawText.trim().split('\n').filter(line => line.trim() !== '');
    const selectElement = document.getElementById('student-id');
    
    lines.forEach(line => {
        const parts = line.split(/,(.*)/s).map(p => p.trim()).filter(p => p !== '');
        
        if (parts.length === 2) {
            const code = parts[0];
            const name = parts[1];
            studentMap[code] = name;

            const option = document.createElement('option');
            option.value = code;
            option.textContent = code;
            selectElement.appendChild(option);
        }
    });
    selectElement.addEventListener('change', updateStudentName);
}

function updateStudentName() {
    const code = document.getElementById('student-id').value;
    const nameInput = document.getElementById('student-name');
    nameInput.value = studentMap[code] || 'Name Not Found';
}

// --- Quiz Content Loading and Rendering Functions ---

function loadQuestions() {
    fetch('questions.txt')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load questions.txt (Check local server or path)');
            }
            return response.text();
        })
        .then(text => {
            parseAndRenderQuestions(text);
        })
        .catch(error => {
            console.error("Error loading questions:", error);
            document.getElementById('quiz-container').innerHTML = `<p style="color: red;">Could not load test content. Error: ${error.message}</p>`;
        });
}

function parseAndRenderQuestions(rawText) {
    const questionBlocks = rawText.split('---').filter(block => block.trim() !== '');

    quizData = questionBlocks.map((block, index) => {
        const lines = block.trim().split('\n').map(line => line.trim());
        const questionLine = lines.find(line => line.startsWith('Q:'));
        const questionText = questionLine ? questionLine.substring(2).trim() : `Question ${index + 1}`;
        const optionLines = lines.filter(line => line.startsWith('A:'));
        
        const options = optionLines.map(line => {
            const isCorrect = line.endsWith('*');
            const text = line.substring(2).trim().replace('*', '').trim();
            return { text, isCorrect };
        });

        return {
            id: `q${index + 1}`,
            question: questionText,
            options: options,
            correctAnswer: options.find(opt => opt.isCorrect)?.text 
        };
    }).filter(q => q.correctAnswer);

    renderQuiz();
}

function renderQuiz() {
    const container = document.getElementById('quiz-container');
    container.innerHTML = '';

    if (quizData.length === 0) {
        container.innerHTML = '<p>No questions loaded. Check your questions.txt format.</p>';
        return;
    }

    // Calculate which questions to render based on the current page
    const startIndex = currentPage * QUESTIONS_PER_PAGE;
    const endIndex = startIndex + QUESTIONS_PER_PAGE;
    const questionsToRender = quizData.slice(startIndex, endIndex);

    questionsToRender.forEach((q, qIndex) => {
        const globalIndex = startIndex + qIndex;
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        
        questionDiv.innerHTML = `<strong>${globalIndex + 1}. ${q.question}</strong><br>`; 

        q.options.forEach((option, oIndex) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            
            const inputName = `question_${q.id}`; 
            const inputId = `${q.id}_option_${oIndex}`;
            const isChecked = studentAnswers[q.id] === option.text; // Check if this option was previously selected

            optionDiv.innerHTML = `
                <input type="radio" id="${inputId}" name="${inputName}" value="${option.text}" ${isChecked ? 'checked' : ''} required>
                <label for="${inputId}">${option.text}</label>
            `;
            questionDiv.appendChild(optionDiv);
        });

        container.appendChild(questionDiv);
    });
    
    // Add pagination controls after the questions
    renderPaginationControls(container);
}

// --- Pagination and Navigation Functions ---

function saveCurrentAnswers() {
    const startIndex = currentPage * QUESTIONS_PER_PAGE;
    const endIndex = startIndex + QUESTIONS_PER_PAGE;
    const questionsOnPage = quizData.slice(startIndex, endIndex);

    questionsOnPage.forEach(q => {
        const inputName = `question_${q.id}`;
        const selectedOption = document.querySelector(`input[name="${inputName}"]:checked`);
        
        if (selectedOption) {
            studentAnswers[q.id] = selectedOption.value;
        }
    });
}

function renderPaginationControls(container) {
    const totalPages = Math.ceil(quizData.length / QUESTIONS_PER_PAGE);
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'pagination-controls';

    // Previous Button
    if (currentPage > 0) {
        const prevButton = document.createElement('button');
        prevButton.textContent = '← Previous';
        prevButton.onclick = () => navigatePage(-1);
        controlsDiv.appendChild(prevButton);
    }
    
    // Next Button (or Finish Button)
    if (currentPage < totalPages - 1) {
        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next Page →';
        nextButton.onclick = () => navigatePage(1);
        controlsDiv.appendChild(nextButton);
    }

    // Display page number
    const pageStatus = document.createElement('span');
    pageStatus.textContent = `Page ${currentPage + 1} of ${totalPages}`;
    controlsDiv.appendChild(pageStatus);
    
    container.appendChild(controlsDiv);

    // Show/Hide the final submission button
    const submitButton = document.getElementById('submit-button');
    if (currentPage === totalPages - 1) {
        submitButton.style.display = 'block';
    } else {
        submitButton.style.display = 'none';
    }
}

function navigatePage(direction) {
    saveCurrentAnswers();
    currentPage += direction;
    renderQuiz();
}

// --- Submission Handler ---

document.getElementById('quiz-form').addEventListener('submit', function(event) {
    event.preventDefault(); 
    
    const studentId = document.getElementById('student-id').value.trim();
    const studentName = document.getElementById('student-name').value.trim(); 

    if (!studentName || !studentId || studentName === 'Name Not Found') {
        alert("Please select your Student Code.");
        return;
    }
    
    // STEP 1: Define a unique key for this student's submission on this browser.
    const submissionKey = `test_submitted_${studentId}`;

    // STEP 2: CHECK FOR LOCAL STORAGE FLAG (Client-side duplicate prevention)
    if (localStorage.getItem(submissionKey) === 'true') {
        alert("❌ Error: ER0001 - This test has already been completed and submitted from this browser for this Student ID. If this is an error, please contact your instructor.");
        return; 
    }

    // --- SCORING LOGIC ---
    // 1. Final Save: Make sure the answers on the LAST page are recorded
    saveCurrentAnswers(); 

    let score = 0;
    const totalQuestions = quizData.length; 

    // 2. Iterate over ALL questions and check stored answers
    quizData.forEach(q => {
        if (studentAnswers[q.id] === q.correctAnswer) {
            score++;
        }
    });
    
    // Check if the student answered every single question before submission (Optional)
    if (Object.keys(studentAnswers).length < totalQuestions) {
         if (!confirm(`You have only answered ${Object.keys(studentAnswers).length} out of ${totalQuestions} questions. Are you sure you want to submit?`)) {
             return; 
         }
    }
    
    // --- END SCORING LOGIC ---

    // PREPARE DATA FOR SUBMISSION 
    const submissionData = {
        studentName: studentName,
        studentId: studentId,
        score: score,
        totalQuestions: totalQuestions
    };

    // SUBMIT DATA to Google Apps Script
    fetch(GOOGLE_SHEET_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors', 
        cache: 'no-cache',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(submissionData) 
    })
    .then(() => {
        // STEP 3: SET LOCAL STORAGE FLAG ON SUCCESS
        localStorage.setItem(submissionKey, 'true'); 
        
        // MODIFIED ALERT: Simple confirmation, no score displayed
        alert(`✅ Test submitted successfully! Thank you, ${studentName}. Your results will be released by Dr. Naoumi.`);
        
        // Disable the form and inputs permanently
        document.getElementById('quiz-form').style.pointerEvents = 'none'; 
        document.getElementById('submit-button').textContent = 'Submitted (Disabled)';
    })
    .catch(error => {
        console.error('Error submitting data:', error);
        alert('❌ There was a network error submitting your test. Please check your connection and try again.');
        document.getElementById('quiz-form').style.pointerEvents = 'auto'; 
        document.getElementById('submit-button').textContent = 'Submit Test';
    });
});

// --- Initialization ---
// Start the process by loading all necessary data when the script runs
loadStudentData();
loadQuestions();