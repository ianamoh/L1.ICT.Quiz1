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
let studentAnswers = {}; 

// --- Device Security Flag ---
const DEVICE_SUBMITTED_KEY = 'device_used_for_test';

// --- Timer Configuration ---
const TEST_DURATION_MINUTES = 20;
let timerInterval;
let timeRemainingSeconds; 

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

    quizData.forEach((q, index) => {
        const questionNumber = index + 1;
        const studentSelections = studentAnswers[q.id] || []; 
        
        let selectedIndices = [];

        q.options.forEach((option, optionIndex) => {
            if (studentSelections.includes(option.text)) {
                selectedIndices.push(optionIndex + 1);
            }
        });

        let answerCode;
        if (selectedIndices.length === 0) {
            answerCode = 'X';
        } else {
            answerCode = selectedIndices.join('|');
        }

        logStringParts.push(`${questionNumber}:${answerCode}`);
    });

    return `(${logStringParts.join(', ')})`;
}


// --- Timer Functions ---

function startTimer() {
    // Check if the device lock is active, do not start timer if locked
    if (localStorage.getItem(DEVICE_SUBMITTED_KEY) === 'true') {
        return;
    }
    
    const duration = TEST_DURATION_MINUTES * 60; // Convert minutes to seconds
    timeRemainingSeconds = duration;
    
    // Check local storage for remaining time (in case of accidental mid-test refresh)
    const storedStartTime = localStorage.getItem('testStartTime');
    
    if (storedStartTime) {
        const timeElapsed = Math.floor((Date.now() - storedStartTime) / 1000);
        timeRemainingSeconds = duration - timeElapsed;
        
        // If time ran out while the student was away, end the test immediately
        if (timeRemainingSeconds <= 0) {
            endTestDueToTimeout();
            return;
        }
    } else {
        // First time starting the test, record the start time
        localStorage.setItem('testStartTime', Date.now());
    }
    
    // Display initial time and start the interval
    displayTime();
    timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
    timeRemainingSeconds--;

    if (timeRemainingSeconds <= 0) {
        // Stop the timer and trigger the lockout procedure
        clearInterval(timerInterval);
        endTestDueToTimeout();
        return;
    }
    
    displayTime();
}

function displayTime() {
    const display = document.getElementById('timer-display');
    if (!display) return;
    
    const minutes = Math.floor(timeRemainingSeconds / 60);
    const seconds = timeRemainingSeconds % 60;
    
    // Format to MM:SS
    const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    display.textContent = `Time Remaining: ${formattedTime}`;
    
    // Change color when time is low to create urgency
    if (timeRemainingSeconds <= 60) {
        display.style.color = 'red';
        display.style.fontWeight = 'bold';
    } else {
         // Keep blue color set in CSS for consistency if not urgent
         display.style.color = '#dc3545';
         display.style.fontWeight = 'bold';
    }
}

function endTestDueToTimeout() {
    // Check if the test has already been submitted to prevent double submission
    if (localStorage.getItem(DEVICE_SUBMITTED_KEY) === 'true') {
         return;
    }
    
    // 1. Display the "Time is Up" message
    const statusDiv = document.getElementById('status-message');
    statusDiv.style.display = 'block';
    statusDiv.style.backgroundColor = '#cfe2ff'; // Light blue background
    statusDiv.style.color = '#084298'; // Dark blue text
    statusDiv.style.border = '1px solid #b6d4fe'; // Blue border
    statusDiv.innerHTML = `
        🔵 **Time Has Expired!** <br>Your answers have been automatically submitted for scoring. 
        <br>Please contact Dr. Naoumi with any questions.
    `;
    
    // 2. Automatically submit the current answers
    // Note: This triggers the submit handler, which does the final locking and data logging.
    const submitButton = document.getElementById('submit-button');
    submitButton.click();
    
    // 3. Clean up (The submit handler will perform the permanent lock/cleanup)
    localStorage.removeItem('testStartTime');
}

// --- Submission Handler (WITH NON-BLOCKING SUCCESS MESSAGE) ---

function setSubmissionState(isLoading) {
    const button = document.getElementById('submit-button');
    const textSpan = document.getElementById('submit-text');
    
    if (isLoading) {
        button.classList.add('loading');
        button.disabled = true; 
    } else {
        button.classList.remove('loading');
        button.disabled = false; 
        textSpan.textContent = 'Submit Test';
    }
}

// Function to lock the entire quiz on success (Remains the same)
function lockQuizPermanently() {
    document.getElementById('quiz-form').style.pointerEvents = 'none';
    const headerSection = document.getElementById('header-section');
    if (headerSection) {
        headerSection.style.pointerEvents = 'none'; // Lock the dropdown too
    }
    // Set the global device lock flag
    localStorage.setItem(DEVICE_SUBMITTED_KEY, 'true');
}

// Function to check device status on page load (Red Lockout - Neutralized Message)
function checkDeviceLock() {
    const statusDiv = document.getElementById('status-message');
    
    if (localStorage.getItem(DEVICE_SUBMITTED_KEY) === 'true') {
        // Display RED lockout banner on hard refresh
        
        statusDiv.style.display = 'block';
        statusDiv.style.backgroundColor = '#f8d7da'; // Light red background
        statusDiv.style.color = '#721c24'; // Dark red text
        statusDiv.style.border = '1px solid #f5c6cb'; // Red border
        statusDiv.innerHTML = `
            ❌ **Attempt Not Allowed!** <br>Your submission attempt for this test has already been recorded. 
            <br>Please contact Dr. Naoumi if you believe this is an error.
        `;
        
        const container = document.getElementById('quiz-container');
        container.innerHTML = ''; // Clear the quiz questions visually
        lockQuizPermanently(); // Visually lock the entire form (dropdown, buttons)
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

    // --- COMBINED SECURITY CHECK (Neutralized Messaging) ---
    if (localStorage.getItem(submissionKey) === 'true' || localStorage.getItem(DEVICE_SUBMITTED_KEY) === 'true') {
        alert("❌ Error: Submission not permitted. This test has been recorded or an attempt has been made.");
        return; 
    }
    
    // START: Activate the loading spinner
    setSubmissionState(true);

    // --- SCORING LOGIC ---
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

    // Incomplete Test Warning
    if (Object.keys(studentAnswers).length < totalQuestions) {
         if (!confirm(`You have only answered ${Object.keys(studentAnswers).length} out of ${totalQuestions} questions. Are you sure you want to submit?`)) {
             setSubmissionState(false); // Re-enable button on cancel
             return; 
         }
    }
    
    // PREPARE DATA FOR SUBMISSION 
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
        // 1. Stop timer and clean up start time
        clearInterval(timerInterval);
        localStorage.removeItem('testStartTime'); 
        
        // 2. **IMMEDIATE ACTIONS:** Stop spinner and set the permanent state
        const button = document.getElementById('submit-button');
        button.textContent = 'Submitted (Disabled)';
        button.classList.remove('loading'); // Stop spinner visually immediately

        // 3. Set client-side flag
        localStorage.setItem(submissionKey, 'true'); 
        localStorage.setItem(DEVICE_SUBMITTED_KEY, 'true'); // Lock the device

        // 4. Disable the form and controls (non-blocking)
        lockQuizPermanently(); 

        // 5. DISPLAY NON-BLOCKING SUCCESS MESSAGE (Setting GREEN success colors)
        const statusDiv = document.getElementById('status-message');
        const studentName = document.getElementById('student-name').value.trim();
        
        statusDiv.style.backgroundColor = '#d4edda'; // Light green background
        statusDiv.style.color = '#155724'; // Dark green text
        statusDiv.style.border = '1px solid #c3e6cb'; // Green border
        
        // This runs instantly, allowing the spinner to stop
        statusDiv.innerHTML = `✅ **Test Submitted!** Thank you, ${studentName}. Your results will be released by Dr. Naoumi.`;
        statusDiv.style.display = 'block'; 
        
        // 6. SCROLL: Smoothly scroll to the success message
        statusDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
    .catch(error => {
        // TRUE ERROR LOGIC
        console.error('CRITICAL Network Error:', error);
        
        // Stop timer on network failure
        clearInterval(timerInterval);

        const statusDiv = document.getElementById('status-message');
        
        // Display the red error banner
        statusDiv.style.display = 'block';
        statusDiv.style.backgroundColor = '#f8d7da'; 
        statusDiv.style.color = '#721c24'; 
        statusDiv.style.border = '1px solid #f5c6cb'; 
        statusDiv.innerHTML = '❌ **CRITICAL ERROR:** Submission failed due to a network issue. Please check your connection and try again.';
        
        // SCROLL: Smoothly scroll to the error message
        statusDiv.scrollIntoView({ behavior: 'smooth', block: 'start' }); 
        
        // Re-enable button and stop spinner on true failure
        setSubmissionState(false); 
        document.getElementById('quiz-form').style.pointerEvents = 'auto'; 
    });
});

// --- Initialization ---
// Make sure to call the new check on page load
checkDeviceLock(); 
loadStudentData();
loadQuestions();
startTimer();