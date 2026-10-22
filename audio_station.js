// audio_station.js - Read-Aloud, AI Quiz & Author Persona Simulator
import { showToast, playAudioChime } from './ui.js';
import { ai } from './ai_service.js';

const PASSAGES = {
    'excerpt-1': {
        title: 'Principles of Scientific Inquiry & Logic',
        author: 'Aristotle & Karl Popper',
        subtitle: 'Academic Philosophy • Introductory Series',
        text: 'Scientific inquiry begins with keen observation and curiosity about the natural world. Through systematic experimentation and careful reasoning, we formulate hypotheses to test our understanding. Knowledge expands progressively as ideas are challenged, refined, and verified by reproducible evidence.'
    },
    'excerpt-2': {
        title: 'Physics of the Universe: Gravity & Relativity',
        author: 'Albert Einstein',
        subtitle: 'Albert Einstein Foundation • Modern Physics Series',
        text: 'Space and time are not independent entities, but are woven together into a flexible fabric known as spacetime. Massive objects like stars and planets curve the spacetime around them. This curvature directs the motion of objects, which we perceive as the force of gravity. Light itself bends as it passes through gravitational fields.'
    },
    'excerpt-3': {
        title: 'Shakespeare: The Tempest (Act 1)',
        author: 'William Shakespeare',
        subtitle: 'William Shakespeare • Classic Literature Collection',
        text: 'Our revels now are ended. These our actors, as I foretold you, were all spirits and are melted into air, into thin air. And, like the baseless fabric of this vision, the cloud-capp’d towers, the gorgeous palaces, the solemn temples, the great globe itself, yea, all which it inherit, shall dissolve.'
    },
    'excerpt-4': {
        title: 'Computer Science: Turing Machines & Logic',
        author: 'Alan Turing',
        subtitle: 'Alan Turing • Foundations of Computing',
        text: 'A Turing machine is a mathematical model of computation describing an abstract machine that manipulates symbols on a strip of tape according to a table of rules. Despite the model’s simplicity, it is capable of implementing any computer algorithm. It forms the mathematical foundation of modern computer science.'
    }
};

let currentPassageKey = 'excerpt-1';
let currentSentences = [];
let activeSentenceIndex = 0;
let isSpeaking = false;
let isPaused = false;
let voices = [];

// AI Quiz State
let activeQuiz = null;

// AI Author Chat State
let activeAuthorChatHistory = [];
let currentAuthorName = 'Author';

document.addEventListener('DOMContentLoaded', () => {
    initVoices();
    loadPassage(currentPassageKey);
    setupEventListeners();
    setupAIQuiz();
    setupAuthorChat();
});

function initVoices() {
    const voiceSelect = document.getElementById('audio-voice-select');
    if (!voiceSelect) return;

    function populateVoiceList() {
        if (!('speechSynthesis' in window)) {
            voiceSelect.innerHTML = '<option value="">Speech synthesis not supported in this browser</option>';
            return;
        }

        voices = window.speechSynthesis.getVoices();
        const englishVoices = voices.filter(v => v.lang.startsWith('en') || v.lang.startsWith('en-US') || v.lang.startsWith('en-GB'));
        const displayVoices = englishVoices.length > 0 ? englishVoices : voices;

        voiceSelect.innerHTML = displayVoices.map((v, i) => `
            <option value="${i}">${v.name} (${v.lang}) ${v.default ? ' — Default' : ''}</option>
        `).join('');
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }
}

function loadPassage(key) {
    currentPassageKey = key;
    const readerTitle = document.getElementById('reader-title');
    const readerSubtitle = document.getElementById('reader-subtitle');
    const container = document.getElementById('reader-passage-container');
    const statsText = document.getElementById('reader-stats-text');

    stopSpeech();

    let textContent = '';
    if (key === 'custom') {
        textContent = document.getElementById('custom-text-input').value.trim() || 'Please paste or type text in the box on the left, then click Read Aloud.';
        readerTitle.innerText = 'Custom Student Notes / Material';
        readerSubtitle.innerText = 'User-Pasted Document';
        currentAuthorName = 'Author';
    } else {
        const item = PASSAGES[key];
        readerTitle.innerText = item.title;
        readerSubtitle.innerText = item.subtitle;
        textContent = item.text;
        currentAuthorName = item.author || 'Author';
    }

    // Split into sentences for karaoke highlighting
    currentSentences = textContent.match(/[^.!?]+[.!?]+/g) || [textContent];
    activeSentenceIndex = 0;

    container.innerHTML = currentSentences.map((sent, idx) => `
        <span class="passage-sentence" id="sentence-${idx}" style="cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: background 0.2s;">
            ${sent.trim()} 
        </span>
    `).join(' ');

    const wordsCount = textContent.split(/\s+/).length;
    const estMinutes = Math.max(1, Math.ceil(wordsCount / 130));
    statsText.innerText = `${wordsCount} words • ~${estMinutes} min listening time`;

    // Click on sentence to start reading from that sentence
    container.querySelectorAll('.passage-sentence').forEach((el, idx) => {
        el.addEventListener('click', () => {
            activeSentenceIndex = idx;
            speakSentence(activeSentenceIndex);
        });
    });
}

function speakSentence(index) {
    if (index >= currentSentences.length) {
        stopSpeech();
        showToast('Finished reading passage', 'info');
        return;
    }

    window.speechSynthesis.cancel();

    // Highlight sentence in UI
    document.querySelectorAll('.passage-sentence').forEach((el, i) => {
        if (i === index) {
            el.className = 'passage-sentence highlight-spoken';
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            el.className = 'passage-sentence';
        }
    });

    const textToSpeak = currentSentences[index].trim();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    const voiceIndex = document.getElementById('audio-voice-select').value;
    if (voices[voiceIndex]) utterance.voice = voices[voiceIndex];

    utterance.rate = parseFloat(document.getElementById('audio-rate').value) || 1.0;
    utterance.pitch = parseFloat(document.getElementById('audio-pitch').value) || 1.0;

    utterance.onend = () => {
        if (isSpeaking && !isPaused) {
            activeSentenceIndex++;
            speakSentence(activeSentenceIndex);
        }
    };

    utterance.onerror = (e) => {
        console.error('Speech error', e);
        stopSpeech();
    };

    isSpeaking = true;
    isPaused = false;
    document.getElementById('audio-speaking-indicator').style.display = 'flex';
    window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
    isSpeaking = false;
    isPaused = false;
    window.speechSynthesis.cancel();
    document.querySelectorAll('.passage-sentence').forEach(el => el.className = 'passage-sentence');
    document.getElementById('audio-speaking-indicator').style.display = 'none';
}

function setupEventListeners() {
    // Book Select Dropdown
    document.getElementById('audio-book-select')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const customGroup = document.getElementById('custom-text-group');
        if (val === 'custom') {
            customGroup.style.display = 'block';
        } else {
            customGroup.style.display = 'none';
        }
        loadPassage(val);
    });

    document.getElementById('custom-text-input')?.addEventListener('input', () => {
        if (currentPassageKey === 'custom') loadPassage('custom');
    });

    // Speed Rate Slider
    document.getElementById('audio-rate')?.addEventListener('input', (e) => {
        document.getElementById('rate-value-text').innerText = `${parseFloat(e.target.value).toFixed(1)}x`;
        if (isSpeaking) speakSentence(activeSentenceIndex);
    });

    // Pitch Slider
    document.getElementById('audio-pitch')?.addEventListener('input', (e) => {
        document.getElementById('pitch-value-text').innerText = parseFloat(e.target.value).toFixed(1);
    });

    // Play / Pause / Stop
    document.getElementById('btn-play-audio')?.addEventListener('click', () => {
        if (isPaused) {
            window.speechSynthesis.resume();
            isPaused = false;
            isSpeaking = true;
            document.getElementById('audio-speaking-indicator').style.display = 'flex';
        } else {
            activeSentenceIndex = 0;
            speakSentence(0);
        }
    });

    document.getElementById('btn-pause-audio')?.addEventListener('click', () => {
        if (isSpeaking && !isPaused) {
            window.speechSynthesis.pause();
            isPaused = true;
            document.getElementById('audio-speaking-indicator').style.display = 'none';
            showToast('Playback paused', 'info');
        }
    });

    document.getElementById('btn-stop-audio')?.addEventListener('click', stopSpeech);

    // Text Size Toggles
    const container = document.getElementById('reader-passage-container');
    document.querySelectorAll('.font-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.font-size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            container.className = `text-size-${btn.dataset.size}`;
        });
    });
}

// ==========================================
// AI COMPREHENSION QUIZ & BADGES
// ==========================================
function setupAIQuiz() {
    const modal = document.getElementById('modal-ai-quiz');
    const btnOpen = document.getElementById('btn-open-quiz');
    const btnClose = document.getElementById('btn-close-quiz');
    const btnCancel = document.getElementById('btn-cancel-quiz');
    const btnSubmit = document.getElementById('btn-submit-quiz');
    const btnDone = document.getElementById('btn-done-quiz');

    const loadingView = document.getElementById('quiz-loading');
    const questionsView = document.getElementById('quiz-questions-view');
    const resultView = document.getElementById('quiz-result-view');

    if (!btnOpen || !modal) return;

    btnOpen.addEventListener('click', async () => {
        modal.style.display = 'flex';
        loadingView.style.display = 'block';
        questionsView.style.display = 'none';
        resultView.style.display = 'none';

        const title = document.getElementById('reader-title')?.innerText || 'Current Passage';
        const passageText = currentSentences.join(' ');

        try {
            activeQuiz = await ai.generateQuiz(title, passageText);
            loadingView.style.display = 'none';
            questionsView.style.display = 'block';
            renderQuizCards(activeQuiz);
        } catch (err) {
            console.error('Quiz generation error:', err);
            showToast('Failed to generate quiz. Please retry.', 'error');
            modal.style.display = 'none';
        }
    });

    function closeModal() {
        modal.style.display = 'none';
    }

    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);
    btnDone?.addEventListener('click', closeModal);

    btnSubmit?.addEventListener('click', () => {
        if (!activeQuiz || !activeQuiz.questions) return;

        let score = 0;
        let feedbackHtml = '';

        activeQuiz.questions.forEach((q, idx) => {
            const selected = document.querySelector(`input[name="quiz-q-${idx}"]:checked`);
            const selectedVal = selected ? parseInt(selected.value, 10) : -1;
            const isCorrect = selectedVal === q.answerIndex;

            if (isCorrect) score++;

            feedbackHtml += `
                <div style="margin-bottom: 0.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                    <p style="font-weight: 600; margin: 0 0 0.25rem 0;">Q${idx + 1}: ${q.question}</p>
                    <p style="margin: 0; font-size: 0.8rem; color: ${isCorrect ? 'var(--color-success)' : 'var(--color-danger)'};">
                        ${isCorrect ? '✓ Correct!' : `✗ Incorrect (Correct: ${q.options[q.answerIndex]})`}
                    </p>
                    ${q.explanation ? `<p style="margin: 0.2rem 0 0 0; font-size: 0.75rem; color: var(--text-muted);">${q.explanation}</p>` : ''}
                </div>
            `;
        });

        questionsView.style.display = 'none';
        resultView.style.display = 'block';

        const scoreText = document.getElementById('quiz-result-score');
        const badgeIcon = document.getElementById('badge-icon-container');
        const resultTitle = document.getElementById('quiz-result-title');
        const detailsContainer = document.getElementById('quiz-feedback-details');

        scoreText.innerText = `You scored ${score} out of ${activeQuiz.questions.length}`;
        detailsContainer.innerHTML = feedbackHtml;

        if (score === activeQuiz.questions.length) {
            badgeIcon.innerText = '🏆';
            resultTitle.innerText = 'Scholar Mastery Badge Unlocked!';
            playAudioChime();
        } else if (score >= Math.ceil(activeQuiz.questions.length / 2)) {
            badgeIcon.innerText = '🥈';
            resultTitle.innerText = 'Diligent Reader Badge Earned!';
            playAudioChime();
        } else {
            badgeIcon.innerText = '🥉';
            resultTitle.innerText = 'Reading Explorer Badge - Good Try!';
        }

        // Save badge to localStorage reading progress
        try {
            const badges = JSON.parse(localStorage.getItem('library_reading_badges') || '[]');
            badges.push({
                title: activeQuiz.title,
                score: `${score}/${activeQuiz.questions.length}`,
                date: new Date().toISOString()
            });
            localStorage.setItem('library_reading_badges', JSON.stringify(badges));
        } catch (e) {
            console.error('Save badge error:', e);
        }
    });
}

function renderQuizCards(quiz) {
    const titleEl = document.getElementById('quiz-book-title');
    const container = document.getElementById('quiz-cards-container');
    if (titleEl) titleEl.innerText = `Topic: ${quiz.title}`;
    if (!container) return;

    container.innerHTML = quiz.questions.map((q, qIdx) => `
        <div style="background: var(--bg-surface-secondary); padding: 1rem 1.25rem; border-radius: 8px; border: 1px solid var(--border-color);">
            <p style="font-weight: 700; font-size: 0.95rem; margin: 0 0 0.75rem 0;">${qIdx + 1}. ${q.question}</p>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${q.options.map((opt, optIdx) => `
                    <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.85rem; padding: 0.35rem 0.5rem; border-radius: 4px; border: 1px solid transparent; transition: background 0.15s;">
                        <input type="radio" name="quiz-q-${qIdx}" value="${optIdx}" style="accent-color: var(--color-primary);">
                        <span>${opt}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// ==========================================
// CHAT WITH AUTHOR PERSONA
// ==========================================
function setupAuthorChat() {
    const modal = document.getElementById('modal-author-chat');
    const btnOpen = document.getElementById('btn-open-author-chat');
    const btnClose = document.getElementById('btn-close-author-chat');
    const messagesContainer = document.getElementById('author-chat-messages');
    const input = document.getElementById('author-chat-input');
    const btnSend = document.getElementById('btn-send-author-chat');
    const authorNameEl = document.getElementById('author-modal-name');

    if (!btnOpen || !modal) return;

    btnOpen.addEventListener('click', () => {
        modal.style.display = 'flex';
        activeAuthorChatHistory = [];
        authorNameEl.innerText = `Chat with ${currentAuthorName}`;
        messagesContainer.innerHTML = '';

        // Initial welcome message from author
        appendAuthorMessage(
            `Greetings, esteemed patron! I am **${currentAuthorName}**. What inquiries or thoughts do you have regarding my work or ideas? Ask freely!`
        );
        input.focus();
    });

    btnClose?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    async function handleSend() {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';

        // Render user message
        appendUserMessage(text);
        activeAuthorChatHistory.push({ role: 'user', content: text });

        // Show typing indicator
        const typingId = 'typing-' + Date.now();
        messagesContainer.innerHTML += `
            <div id="${typingId}" style="display: flex; gap: 0.5rem; align-items: center; color: var(--text-muted); font-size: 0.8rem; font-style: italic;">
                <span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> ${currentAuthorName} is contemplating...
            </div>
        `;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const title = document.getElementById('reader-title')?.innerText || 'Current Work';
            const res = await ai.chatWithAuthor(currentAuthorName, title, activeAuthorChatHistory, text);
            
            document.getElementById(typingId)?.remove();
            appendAuthorMessage(res.reply);
            activeAuthorChatHistory.push({ role: 'assistant', content: res.reply });
            
            // Speak response via Web Speech synthesis
            ai.speak(res.reply);
        } catch (err) {
            console.error('Author chat error:', err);
            document.getElementById(typingId)?.remove();
            appendAuthorMessage('My apologies, the passage of centuries clouds my connection at this moment. Please ask again.');
        }
    }

    btnSend?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    function appendUserMessage(msg) {
        messagesContainer.innerHTML += `
            <div style="align-self: flex-end; max-width: 80%; background: var(--color-primary); color: white; padding: 0.65rem 0.9rem; border-radius: 12px 12px 2px 12px; font-size: 0.85rem; line-height: 1.4;">
                ${msg}
            </div>
        `;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function appendAuthorMessage(msg) {
        messagesContainer.innerHTML += `
            <div style="align-self: flex-start; max-width: 80%; background: var(--bg-surface-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.65rem 0.9rem; border-radius: 12px 12px 12px 2px; font-size: 0.85rem; line-height: 1.4;">
                <div style="font-size: 0.72rem; font-weight: 700; color: #9333ea; margin-bottom: 0.25rem;">${currentAuthorName}</div>
                <div>${msg}</div>
            </div>
        `;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}
