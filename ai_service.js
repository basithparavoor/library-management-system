// ai_service.js - Unified AI Engine for TGI Library
// Powers Snap-to-Catalog, ISBN Auto-Enrichment, Dewey Decimal Classification,
// Thaiba Voice Assistant, Author Personas, and Comprehension Quizzes.

import { SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY } from './config.js';
import { supabase } from './supabaseClient.js';

class AIService {
    constructor() {
        this.geminiApiKey = GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '';
        this.assistantName = "Thaiba";
    }

    setGeminiKey(key) {
        this.geminiApiKey = key ? key.trim() : '';
        if (this.geminiApiKey) {
            localStorage.setItem('gemini_api_key', this.geminiApiKey);
        } else {
            localStorage.removeItem('gemini_api_key');
        }
    }

    getGeminiKey() {
        return this.geminiApiKey || GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '';
    }

    // --- 1. ISBN AUTO-ENRICHMENT (OpenLibrary + Google Books) ---
    async fetchBookMetadataByISBN(isbn) {
        if (!isbn) return null;
        const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
        if (cleanIsbn.length < 9) return null;

        let result = {
            isbn: cleanIsbn,
            title: '',
            author: '',
            publisher: '',
            publishYear: '',
            description: '',
            pageCount: 0,
            coverUrl: '',
            category: 'General',
            deweyDecimal: ''
        };

        // Try Google Books API first
        try {
            const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`);
            if (gRes.ok) {
                const gData = await gRes.json();
                if (gData.items && gData.items.length > 0) {
                    const info = gData.items[0].volumeInfo;
                    result.title = info.title || '';
                    if (info.subtitle) result.title += `: ${info.subtitle}`;
                    result.author = (info.authors && info.authors.length > 0) ? info.authors.join(', ') : '';
                    result.publisher = info.publisher || '';
                    result.publishYear = info.publishedDate ? info.publishedDate.substring(0, 4) : '';
                    result.description = info.description || '';
                    result.pageCount = info.pageCount || 0;
                    if (info.imageLinks) {
                        result.coverUrl = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || '';
                    }
                    if (info.categories && info.categories.length > 0) {
                        result.category = info.categories[0];
                    }
                }
            }
        } catch (e) {
            console.warn("Google Books lookup warning:", e);
        }

        // Try OpenLibrary as secondary source or fallback
        try {
            const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&jscmd=data&format=json`);
            if (olRes.ok) {
                const olData = await olRes.json();
                const key = `ISBN:${cleanIsbn}`;
                if (olData[key]) {
                    const b = olData[key];
                    if (!result.title) result.title = b.title || '';
                    if (!result.author && b.authors) result.author = b.authors.map(a => a.name).join(', ');
                    if (!result.publisher && b.publishers) result.publisher = b.publishers.map(p => p.name).join(', ');
                    if (!result.publishYear && b.publish_date) result.publishYear = b.publish_date;
                    if (!result.coverUrl && b.cover) result.coverUrl = b.cover.large || b.cover.medium || b.cover.small || '';
                    if (b.classifications && b.classifications.dewey_decimal_class) {
                        result.deweyDecimal = b.classifications.dewey_decimal_class[0];
                    }
                }
            }
        } catch (e) {
            console.warn("OpenLibrary lookup warning:", e);
        }

        // Auto-assign Dewey Decimal if missing
        if (!result.deweyDecimal && (result.title || result.category)) {
            result.deweyDecimal = this.estimateDeweyDecimal(result.title, result.category);
        }

        return (result.title || result.author) ? result : null;
    }

    // --- 2. DEWEY DECIMAL CLASSIFICATION ENGINE ---
    estimateDeweyDecimal(title = '', category = '') {
        const text = `${title} ${category}`.toLowerCase();

        // 000 - Computer Science, Information & General Works
        if (/computer|algorithm|programming|software|coding|python|java|data science|artificial intelligence|web|network/i.test(text)) return '005.13 (Computer Science & Software)';
        if (/encyclopedia|library|information|journalism/i.test(text)) return '030 (General Reference & Information)';

        // 100 - Philosophy & Psychology
        if (/psychology|mind|behavior|mental|brain|habit|therapy/i.test(text)) return '150 (Psychology)';
        if (/philosophy|ethics|logic|morality|existential/i.test(text)) return '100 (Philosophy & Ethics)';

        // 200 - Religion
        if (/religion|theology|bible|quran|hinduism|buddhism|islam|christianity|spirituality|faith/i.test(text)) return '200 (Religion & Spirituality)';

        // 300 - Social Sciences
        if (/economy|economic|finance|business|money|stock|market|trade/i.test(text)) return '330 (Economics & Finance)';
        if (/law|legal|court|constitution|justice|rights/i.test(text)) return '340 (Law & Governance)';
        if (/education|teaching|pedagogy|school|curriculum/i.test(text)) return '370 (Education)';
        if (/politics|government|policy|diplomacy|international relations/i.test(text)) return '320 (Political Science)';
        if (/sociology|society|culture|anthropology/i.test(text)) return '300 (Social Sciences)';

        // 400 - Language
        if (/grammar|linguistics|dictionary|english|language|vocabulary|french|spanish|arabic|hindi/i.test(text)) return '400 (Language & Linguistics)';

        // 500 - Pure Science
        if (/physics|quantum|relativity|mechanics|thermodynamics/i.test(text)) return '530 (Physics)';
        if (/chemistry|organic|inorganic|chemical|molecule/i.test(text)) return '540 (Chemistry)';
        if (/biology|genetics|evolution|botany|zoology|ecology/i.test(text)) return '570 (Biology & Life Sciences)';
        if (/math|mathematics|algebra|calculus|geometry|statistics/i.test(text)) return '510 (Mathematics)';
        if (/astronomy|space|planet|cosmos|astrophysics/i.test(text)) return '520 (Astronomy & Space)';

        // 600 - Technology & Applied Sciences
        if (/medicine|medical|anatomy|health|disease|nursing|pharmacology/i.test(text)) return '610 (Medicine & Health)';
        if (/engineering|mechanical|electrical|civil|robotics/i.test(text)) return '620 (Engineering)';
        if (/management|leadership|marketing|accounting/i.test(text)) return '658 (Management & Business Ops)';
        if (/agriculture|farming|food|nutrition|cooking/i.test(text)) return '630 (Agriculture & Applied Tech)';

        // 700 - Arts & Recreation
        if (/art|painting|drawing|sculpture|photography/i.test(text)) return '700 (Arts)';
        if (/music|instrument|song|orchestra/i.test(text)) return '780 (Music)';
        if (/sport|cricket|football|athletics|games|fitness/i.test(text)) return '790 (Sports & Recreation)';

        // 800 - Literature
        if (/novel|fiction|story|stories|poetry|drama|play|theatre|essay/i.test(text)) return '823 (Literature & Fiction)';

        // 900 - History & Geography
        if (/history|war|empire|dynasty|revolution|civilization/i.test(text)) return '900 (History)';
        if (/geography|atlas|map|travel|exploration/i.test(text)) return '910 (Geography & Travel)';
        if (/biography|autobiography|memoir|life of/i.test(text)) return '920 (Biography & Memoirs)';

        return '000 (General Catalogue)';
    }

    // --- 3. SNAP-TO-CATALOG (Universal Multilingual & All-Font AI Computer Vision OCR) ---
    async snapToCatalogOCR(imageBase64) {
        const apiKey = this.getGeminiKey();
        
        // Clean base64 header if present
        let pureBase64 = imageBase64;
        let mimeType = 'image/jpeg';
        if (imageBase64.includes(';base64,')) {
            const parts = imageBase64.split(';base64,');
            mimeType = parts[0].replace('data:', '');
            pureBase64 = parts[1];
        }

        if (apiKey) {
            try {
                const prompt = `You are a master polyglot library cataloger and vision OCR specialist capable of recognizing any language, script, and font style in the world.
Carefully examine this photo of a book (which may be a front cover, spine, title page, copyright page, or back cover).

UNIVERSAL SCRIPT & FONT CAPABILITIES:
1. All Scripts & Languages: Arabic, Urdu, Persian (Nastaliq, Thuluth, Kufic), Hindi, Sanskrit, Marathi (Devanagari), Tamil, Telugu, Kannada, Malayalam, Bengali, Japanese (Kanji/Kana), Chinese (Traditional/Simplified), Korean (Hangul), Russian/Ukrainian (Cyrillic), Greek, Latin/Roman European languages (English, French, German, Spanish, etc.), Hebrew, and Southeast Asian scripts.
2. All Font Styles: Stylized display fonts, ornate calligraphy, gothic/blackletter, serifs, sans-serifs, brush script, handwritten cursive, embossed gold/silver foil lettering, all-caps, and vertical spine text.

EXTRACTION INSTRUCTIONS:
- "title": Extract the exact book title in its original native script. If subtitles are present, include them separated by a colon.
- "translated_title": If the book title is in a non-English script, provide the standard English translated title or romanized transliteration; otherwise leave empty string "".
- "author": Full author(s) or editor(s) name in original script and/or romanized script.
- "publisher": Publishing house, institution, or university press name if visible, else "".
- "isbn": Search for any 10-digit or 13-digit ISBN number (even if near the barcode, on copyright imprint, or on the spine). Return digits only (with standard hyphens if present), else "".
- "edition": Edition number, publication year, or volume (e.g. "3rd Edition", "2023", "Vol. 1"), else "".
- "category": Accurate library subject classification (e.g. Computer Science, Quantum Physics, World Literature, Islamic Studies, Classical Philosophy, History, Medicine).
- "dewey_decimal": Accurate 3-digit Dewey Decimal Classification call number with label (e.g. "005.13 (Computer Programming)", "297 (Islamic Religion)", "891.43 (Hindi Literature)").
- "language": Detected language of the book (e.g. "Arabic", "English", "Hindi", "Tamil", "French", "German", "Japanese").
- "description": 1-2 sentence overview of the subject matter based on the cover context.

Return ONLY a valid, raw JSON object (NO markdown backticks, NO markdown fences, NO commentary outside the JSON) matching the keys above.`;

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: pureBase64
                                    }
                                }
                            ]
                        }]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                    
                    // Robust JSON extraction between outermost braces
                    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            const parsed = JSON.parse(jsonMatch[0]);
                            if (parsed && (parsed.title || parsed.author || parsed.isbn)) {
                                return parsed;
                            }
                        } catch (pe) {
                            console.warn("Direct JSON parse failed, sanitizing:", pe);
                            const sanitized = jsonMatch[0]
                                .replace(/,\s*([\]}])/g, '$1')
                                .replace(/[\u0000-\u001F]+/g, ' ');
                            return JSON.parse(sanitized);
                        }
                    }
                } else {
                    const errBody = await response.text();
                    console.error("Gemini Vision HTTP error:", response.status, errBody);
                }
            } catch (err) {
                console.error("Gemini Vision OCR Error:", err);
            }
        }

        // Return null if no key or unable to extract, allowing caller to handle fallback smoothly
        return null;
    }

    // --- 4. THAIBA AI VOICE ASSISTANT ENGINE ---
    async askThaiba(query, currentContext = {}) {
        const cleanQuery = query.trim();
        const lower = cleanQuery.toLowerCase();

        // 1. Check local intent for book finding / shelf mapping
        if (lower.includes('where is') || lower.includes('find') || lower.includes('search') || lower.includes('look for') || lower.includes('book on') || lower.includes('books on')) {
            const searchTerm = cleanQuery
                .replace(/(where is|find me|find|search for|look for|books on|book on|do you have|where can i find)/gi, '')
                .trim();

            if (searchTerm.length >= 2) {
                try {
                    const { data: copies } = await supabase
                        .from('book_copies')
                        .select(`
                            id, barcode, status,
                            books(title, author, isbn, category_id, categories(name)),
                            shelves(id, name, wing_name),
                            racks(id, name, row_level)
                        `)
                        .or(`barcode.ilike.%${searchTerm}%`)
                        .limit(5);

                    let matchedCopy = null;
                    if (copies && copies.length > 0) {
                        matchedCopy = copies[0];
                    } else {
                        // Search by book title directly
                        const { data: books } = await supabase
                            .from('books')
                            .select(`
                                id, title, author,
                                book_copies(id, barcode, status, shelves(name, wing_name), racks(name, row_level))
                            `)
                            .ilike('title', `%${searchTerm}%`)
                            .limit(1);

                        if (books && books.length > 0 && books[0].book_copies && books[0].book_copies.length > 0) {
                            matchedCopy = {
                                ...books[0].book_copies[0],
                                books: books[0]
                            };
                        }
                    }

                    if (matchedCopy && matchedCopy.books) {
                        const title = matchedCopy.books.title;
                        const shelf = matchedCopy.shelves?.name || 'General Shelf';
                        const rack = matchedCopy.racks?.name || 'Rack 1';
                        const tier = matchedCopy.racks?.row_level || 'Tier 1';
                        const isAvail = matchedCopy.status === 'AVAILABLE';

                        return {
                            type: 'BOOK_LOCATION',
                            spokenText: `I found "${title}". It is located on ${shelf}, ${rack}, on ${tier}. It is currently ${isAvail ? 'available for checkout' : matchedCopy.status}.`,
                            book: matchedCopy.books,
                            copy: matchedCopy,
                            location: { shelf, rack, tier, status: matchedCopy.status }
                        };
                    }
                } catch (e) {
                    console.error("Thaiba search error:", e);
                }
            }
        }

        // 2. Library Policies & FAQs
        if (lower.includes('borrow') || lower.includes('limit') || lower.includes('how many')) {
            return {
                type: 'POLICY',
                spokenText: `Standard members can borrow up to 3 books simultaneously for a duration of 14 days. Faculty and honors students may check out up to 5 books.`
            };
        }

        if (lower.includes('return') || lower.includes('drop box')) {
            return {
                type: 'RETURN_HELP',
                spokenText: `To return a book, tap "Smart Drop Box Return" on this kiosk, scan your book's barcode sticker, and slide it into the return slot.`
            };
        }

        if (lower.includes('fine') || lower.includes('overdue') || lower.includes('late')) {
            return {
                type: 'POLICY',
                spokenText: `Overdue books accrue a late charge of 2 rupees per day after the 14-day loan period expires.`
            };
        }

        // 3. Generative LLM Response using Gemini (if key configured)
        const apiKey = this.getGeminiKey();
        if (apiKey) {
            try {
                const systemPrompt = `You are Thaiba, the friendly, intelligent, and cultured AI Library Assistant at TGI Library.
Answer patron questions concisely in 1-2 spoken sentences. Be warm, academic, and direct. Patron asks: "${cleanQuery}"`;

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: systemPrompt }] }]
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (answer) {
                        return { type: 'LLM_CONVERSATION', spokenText: answer };
                    }
                }
            } catch (err) {}
        }

        // Default Friendly Fallback
        return {
            type: 'GENERAL',
            spokenText: `Hello! I am Thaiba, your library voice assistant. You can ask me to locate books, check borrowing limits, or navigate shelves.`
        };
    }

    // --- 5. COMPREHENSION QUIZ GENERATOR ---
    async generateQuiz(bookTitle, passageText = '') {
        const apiKey = this.getGeminiKey();
        if (apiKey && (bookTitle || passageText)) {
            try {
                const prompt = `Create a 3-question reading comprehension quiz based on this book or passage:
Title: "${bookTitle}"
Text: "${passageText.substring(0, 1500)}"

Return ONLY a valid JSON array of 3 objects with keys:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Brief reason why this is correct."
  }
]`;

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });

                if (res.ok) {
                    const data = await res.json();
                    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
                    return JSON.parse(cleaned);
                }
            } catch (err) {
                console.error("Quiz generator error:", err);
            }
        }

        // Smart dynamic template fallback
        return [
            {
                question: `What is the central focus or primary theme explored in "${bookTitle}"?`,
                options: [
                    "Analyzing underlying core concepts and practical implications",
                    "A fictional adventure unrelated to the subject",
                    "A historical chronicle of ancient warfare",
                    "Mathematical equations without commentary"
                ],
                correctIndex: 0,
                explanation: `The work fundamentally unpacks the core conceptual principles of ${bookTitle}.`
            },
            {
                question: "Which habit helps students retain critical insights while studying this text?",
                options: [
                    "Active note-taking, reflection, and spaced review",
                    "Reading once very quickly without pauses",
                    "Memorizing words without understanding context",
                    "Ignoring chapter summaries and index references"
                ],
                correctIndex: 0,
                explanation: "Active reflection and synthesis produce maximum cognitive retention."
            },
            {
                question: "How can the key lessons from this reading be most effectively applied?",
                options: [
                    "By solving practical problems and discussing with peers",
                    "By keeping thoughts isolated without experimentation",
                    "Only during examination periods",
                    "Never outside of classroom assignments"
                ],
                correctIndex: 0,
                explanation: "Peer discussion and practical problem solving solidify academic understanding."
            }
        ];
    }

    // --- 6. CHAT WITH THE AUTHOR PERSONA ---
    async chatWithAuthor(authorName, bookTitle, conversationHistory = [], userMessage = '') {
        const apiKey = this.getGeminiKey();
        if (apiKey) {
            try {
                const systemPrompt = `You are ${authorName}, author of "${bookTitle}".
You are having an engaging intellectual conversation with a library student.
Speak in character using the author's authentic tone, vocabulary, philosophical worldview, and historical context.
Do not break character. Keep your reply concise (2-4 sentences).`;

                const contents = [
                    { role: 'user', parts: [{ text: systemPrompt }] },
                    { role: 'model', parts: [{ text: `Greetings. I am ${authorName}. Let us discuss "${bookTitle}" and whatever curiosity stirs your mind.` }] }
                ];

                conversationHistory.forEach(msg => {
                    contents.push({
                        role: msg.sender === 'user' ? 'user' : 'model',
                        parts: [{ text: msg.text }]
                    });
                });

                contents.push({ role: 'user', parts: [{ text: userMessage }] });

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents })
                });

                if (res.ok) {
                    const data = await res.json();
                    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                }
            } catch (e) {
                console.error("Author chat error:", e);
            }
        }

        // Persona heuristic simulation
        return `As ${authorName}, I must commend your curiosity regarding "${bookTitle}". In my investigations, I discovered that true mastery requires both rigorous patience and daring questions. What particular passage challenged your thinking most?`;
    }

    // --- 7. BROWSER SPEECH SYNTHESIS & RECOGNITION (TTS & STT) ---
    speak(text, onEnd) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.05;

        // Try picking a natural voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Female')));
        if (preferred) utterance.voice = preferred;

        if (onEnd) utterance.onend = onEnd;
        window.speechSynthesis.speak(utterance);
    }

    stopSpeaking() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }

    listenVoice(onResult, onError) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            if (onError) onError(new Error("Voice recognition not supported on this browser. Use Chrome or Edge."));
            return null;
        }

        const recognizer = new SpeechRec();
        recognizer.lang = 'en-US';
        recognizer.interimResults = false;
        recognizer.maxAlternatives = 1;

        recognizer.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (onResult) onResult(transcript);
        };

        recognizer.onerror = (err) => {
            if (onError) onError(err);
        };

        recognizer.start();
        return recognizer;
    }
}

export const ai = new AIService();
window.aiService = ai;
