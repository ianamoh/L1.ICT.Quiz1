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
// studentAnswers stores an array of selected option text for each question: { qID: ["text1", "text2"], ... }
let studentAnswers = {}; 
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

// 2. Parse the raw text into a structured array (Updated for Multiple Correct Answers)
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

        // Store an array of all correct answers (text)
        const correctAnswers = options.filter(opt => opt.isCorrect).map(opt => opt.text);
        
        return {
            id: `q${index + 1}`,
            question: questionText,
            options: options,
            // The correct answer is now an array of strings
            correctAnswer: correctAnswers 
        };
    }).filter(q => q.correctAnswer.length > 0); // Ensure at least one correct answer exists

    renderQuiz();
}

// 3. Render the structured questions as HTML elements (Updated for Checkboxes)
function renderQuiz() {
    const container = document.getElementById('quiz-container');
    container.innerHTML = '';

    if (quizData.length === 0) {
        container.innerHTML = '<p>No questions loaded. Check your questions.txt format.</p>';
        return;
    }

    const startIndex = currentPage * QUESTIONS_PER_PAGE;
    const endIndex = startIndex + QUESTIONS_PER_PAGE;
    const questionsToRender = quizData.slice(startIndex, endIndex);

    questionsToRender.forEach((q, qIndex) => {
        const globalIndex = startIndex + qIndex;
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        
        questionDiv.innerHTML = `<strong>${globalIndex + 1}. ${q.question}</strong><br>`; 

        // Retrieve the student's previously selected answers for this question (defaults to empty array)
        const selectedAnswers = studentAnswers[q.id] || [];

        q.options.forEach((option, oIndex) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            
            // TYPE IS NOW CHECKBOX
            const inputName = `question_${q.id}`; 
            const inputId = `${q.id}_option_${oIndex}`;
            
            // Check if the current option's text is in the stored array of answers
            const isChecked = selectedAnswers.includes(option.text);

            optionDiv.innerHTML = `
                <input type="checkbox" id="${inputId}" name="${inputName}" value="${option.text}" ${isChecked ? 'checked' : ''}>
                <label for="${inputId}">${option.text}</label>
            `;
            questionDiv.appendChild(optionDiv);
        });

        container.appendChild(questionDiv);
    });
    
    renderPaginationControls(container);
}

// --- Pagination and Navigation Functions ---

// Function to handle saving answers on the current page (Updated to capture array of values)
function saveCurrentAnswers() {
    const startIndex = currentPage * QUESTIONS_PER_PAGE;
    const endIndex = startIndex + QUESTIONS_PER_PAGE;
    const questionsOnPage = quizData.slice(startIndex, endIndex);

    questionsOnPage.forEach(q => {
        const inputName = `question_${q.id}`;
        
        // Use querySelectorAll to find ALL checked checkboxes for this question
        const checkedOptions = document.querySelectorAll(`input[name="${inputName}"]:checked`);
        
        // Store the array of selected answers for this question
        studentAnswers[q.id] = Array.from(checkedOptions).map(input => input.value);
    });
}

function renderPaginationControls(container) {
    const totalPages = Math.ceil(quizData.length / QUESTIONS_PER_PAGE);
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'pagination-controls';

    if (currentPage > 0) {
        const prevButton = document.createElement('button');
        prevButton.textContent = '← Previous';
        prevButton.onclick = () => navigatePage(-1);
        controlsDiv.appendChild(prevButton);
    }
    
    if (currentPage < totalPages - 1) {
        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next Page →';
        nextButton.onclick = () => navigatePage(1);
        controlsDiv.appendChild(nextButton);
    }

    const pageStatus = document.createElement('span');
    pageStatus.textContent = `Page ${currentPage + 1} of ${totalPages}`;
    controlsDiv.appendChild(pageStatus);
    
    container.appendChild(controlsDiv);

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

// Function to format all answers into a single string: (Q#:Ans1|Ans2, Q#:X)
function formatAllAnswersForLogging() {
    let logStringParts = [];

    // Loop through every single question in the quizData array
    quizData.forEach((q, index) => {
        const questionNumber = index + 1;
        const studentSelections = studentAnswers[q.id] || []; // Get the array of selected texts (or empty array)
        
        // Find the index (1-based) of the selected options
        let selectedIndices = [];

        // Check the student's selections against the full list of options for this question
        q.options.forEach((option, optionIndex) => {
            if (studentSelections.includes(option.text)) {
                // Option index is 0-based, so add 1 for the 1-based answer number (A1, A2, etc.)
                selectedIndices.push(optionIndex + 1);
            }
        });

        let answerCode;
        if (selectedIndices.length === 0) {
            // No answer selected (represented by 'X')
            answerCode = 'X';
        } else {
            // Combine selected answer numbers with the pipe '|' separator
            answerCode = selectedIndices.join('|');
        }

        // Add the formatted part: (Q1:1, Q2:1|2, Q3:X)
        logStringParts.push(`${questionNumber}:${answerCode}`);
    });

    // Join all question parts into one final string
    return `(${logStringParts.join(', ')})`;
}


// --- Submission Handler (Updated for Strict Multi-Selection Scoring) ---

// --- Submission Handler (WITH LOADING INDICATOR) ---

// --- Submission Handler (WITH LOADING INDICATOR) ---

function setSubmissionState(isLoading) {
    const button = document.getElementById('submit-button');
    const textSpan = document.getElementById('submit-text');
    
    if (isLoading) {
        // State: Loading (Show spinner, disable clicks)
        button.classList.add('loading');
        button.disabled = true; 
    } else {
        // State: Ready (Hide spinner, enable clicks)
        button.classList.remove('loading');
        button.disabled = false; 
        textSpan.textContent = 'Submit Test'; // Reset text
    }
}


document.getElementById('quiz-form').addEventListener('submit', function(event) {
    event.preventDefault(); 
    
    const studentId = document.getElementById('student-id').value.trim();
    const studentName = document.getElementById('student-name').value.trim(); 

    if (!studentName || !studentId || studentName === 'Name Not Found') {
        alert("Please select your Student Code.");
        return;
    }
    
    const submissionKey = `test_submitted_${studentId}`;

    if (localStorage.getItem(submissionKey) === 'true') {
        alert("❌ Error: ER0001 - This test has already been completed and submitted from this browser for this Student ID. If this is an error, please contact your instructor.");
        return; 
    }
    
    // START: Activate the loading spinner and disable the button
    setSubmissionState(true);

    // --- SCORING LOGIC (Remains the same) ---
    saveCurrentAnswers();
    let score = 0;
    const totalQuestions = quizData.length; 

    quizData.forEach(q => {
        const correctOptions = q.correctAnswer.sort();
        const studentSelections = studentAnswers[q.id] ? studentAnswers[q.id].sort() : [];
        const lengthMatch = studentSelections.length === correctOptions.length;
        const contentMatch = lengthMatch && correctOptions.every((val, index) => val === studentSelections[index]);
        if (contentMatch) {
            score++;
        }
    });

    // Incomplete Test Warning (Remains the same)
    if (Object.keys(studentAnswers).length < totalQuestions) {
         if (!confirm(`You have only answered ${Object.keys(studentAnswers).length} out of ${totalQuestions} questions. Are you sure you want to submit?`)) {
             setSubmissionState(false); // Re-enable button on cancel
             return; 
         }
    }
    
    // PREPARE DATA FOR SUBMISSION (Remains the same)
    const submissionData = {
        studentName: studentName, studentId: studentId,
        score: score, totalQuestions: totalQuestions,
        allAnswers: formatAllAnswersForLogging()
    };

    // --- FINAL SUBMISSION LOGIC FIX ---
    fetch(GOOGLE_SHEET_WEB_APP_URL, {
        method: 'POST', 
        mode: 'no-cors', 
        cache: 'no-cache',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData) 
    })
 .then(() => {
        // 1. Set final state and STOP spinner IMMEDIATELY
        const button = document.getElementById('submit-button');
        button.textContent = 'Submitted (Disabled)';
        button.classList.remove('loading'); 

        // 2. Set client-side flag
        localStorage.setItem(submissionKey, 'true'); 

        // 3. Disable the form
        document.getElementById('quiz-form').style.pointerEvents = 'none';

        // 4. DISPLAY NON-BLOCKING SUCCESS MESSAGE
        const successDiv = document.getElementById('success-message');
        const studentName = document.getElementById('student-name').value.trim();
        
        successDiv.innerHTML = `✅ **Test Submitted!** Thank you, ${studentName}. Your results will be released by Dr. Naoumi.`;
        successDiv.style.display = 'block'; // Make the message visible

        // No alert() means no blocking, allowing the spinner to stop instantly!
    })
    // ... [rest of the .catch block remains the same] ...
    // ... [rest of the .catch block remains the same] ...
    .catch(error => {
        // **TRUE ERROR LOGIC:** This should only run if the network connection fails completely.
        console.error('CRITICAL Network Error:', error);
        alert('❌ CRITICAL NETWORK ERROR. Please check connection and try again.');
        
        // Re-enable button and stop spinner on true failure
        setSubmissionState(false); 
        document.getElementById('quiz-form').style.pointerEvents = 'auto'; 
    });
});

// --- Initialization ---
loadStudentData();
loadQuestions();