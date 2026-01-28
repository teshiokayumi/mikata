// --- Constants & Config ---
let messages = [];
const STORAGE_KEYS = {
  USER_INPUT: 'SENSEI_MINUTES_PENDING_INPUT',
  MESSAGES: 'SENSEI_MINUTES_MESSAGES'
};

// --- UI Elements ---
const chatHistory = document.getElementById('chatHistory');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const generateBtn = document.getElementById('generateBtn');
const clearBtn = document.getElementById('clearBtn');
const resultArea = document.getElementById('resultArea');
const loader = document.getElementById('loader');
const copyBtn = document.getElementById('copyBtn');

// API Key & Model Modal Elements
const apiKeyBtn = document.getElementById('apiKeyBtn');
const apiModal = document.getElementById('apiModal');
const closeModal = document.getElementById('closeModal');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');
const customModelInput = document.getElementById('customModelInput');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  const savedKey = localStorage.getItem('GEMINI_API_KEY');
  if (savedKey) apiKeyInput.value = savedKey;

  const savedModel = localStorage.getItem('GEMINI_SELECTED_MODEL');
  if (savedModel) {
    if (['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'].includes(savedModel)) {
      modelSelect.value = savedModel;
    } else {
      modelSelect.value = 'custom';
      customModelInput.value = savedModel;
      customModelInput.classList.remove('hidden');
    }
  }

  // Restore pending input
  const pendingInput = localStorage.getItem(STORAGE_KEYS.USER_INPUT);
  if (pendingInput) {
    userInput.value = pendingInput;
    // Trigger auto-resize
    userInput.style.height = 'auto';
    userInput.style.height = (userInput.scrollHeight) + 'px';
  }

  // Restore message history
  const savedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
  if (savedMessages) {
    messages = JSON.parse(savedMessages);
    // Don't clear existing AI welcome message, just append
    messages.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'message user';
      msgDiv.innerText = msg;
      chatHistory.appendChild(msgDiv);
    });
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }
});

// Model select toggle
modelSelect.addEventListener('change', () => {
  if (modelSelect.value === 'custom') {
    customModelInput.classList.remove('hidden');
  } else {
    customModelInput.classList.add('hidden');
  }
});

// --- API Key Management ---
apiKeyBtn.addEventListener('click', () => {
  apiModal.style.display = 'flex';
  apiModal.classList.remove('hidden');
});

closeModal.addEventListener('click', () => {
  apiModal.style.display = 'none';
  apiModal.classList.add('hidden');
});

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  let model = modelSelect.value;
  if (model === 'custom') {
    model = customModelInput.value.trim();
    if (!model) {
      alert('モデル名を入力してください');
      return;
    }
  }

  if (key) {
    localStorage.setItem('GEMINI_API_KEY', key);
    localStorage.setItem('GEMINI_SELECTED_MODEL', model);
    alert('設定を保存しました');
    apiModal.style.display = 'none';
    apiModal.classList.add('hidden');
  } else {
    alert('APIキーを入力してください');
  }
});

// --- Chat Logic ---
function addMessage(text, role) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  msgDiv.innerText = text;
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  if (role === 'user') {
    messages.push(text);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
  }
}

sendBtn.addEventListener('click', () => {
  const text = userInput.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  userInput.value = '';
  localStorage.removeItem(STORAGE_KEYS.USER_INPUT);
  userInput.style.height = 'auto';
});

// Handle auto-resize textarea & auto-save
userInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
  localStorage.setItem(STORAGE_KEYS.USER_INPUT, this.value);
});

clearBtn.addEventListener('click', () => {
  if (confirm('入力をリセットしてもよろしいですか？')) {
    messages = [];
    localStorage.removeItem(STORAGE_KEYS.USER_INPUT);
    localStorage.removeItem(STORAGE_KEYS.MESSAGES);
    userInput.value = '';
    userInput.style.height = 'auto';
    chatHistory.innerHTML = `
            <div class="message ai">
                リセットしました。新しい会議のメモを入力してください。
            </div>
        `;
    resultArea.innerHTML = `
            <div style="color: var(--text-muted); text-align: center; margin-top: 4rem;">
                <i data-lucide="arrow-left" style="width: 48px; height: 48px; opacity: 0.2;"></i>
                <p style="margin-top: 1rem;">左側でメモを入力して「生成」ボタンを押してください</p>
            </div>
        `;
    lucide.createIcons();
  }
});

// --- AI Generation Logic ---
generateBtn.addEventListener('click', async () => {
  const apiKey = localStorage.getItem('GEMINI_API_KEY');
  if (!apiKey) {
    alert('先にAPIキーを設定してください');
    apiModal.classList.remove('hidden');
    return;
  }

  if (messages.length === 0 && userInput.value.trim() === '') {
    alert('メモを入力してください');
    return;
  }

  // Capture pending input
  if (userInput.value.trim() !== '') {
    addMessage(userInput.value.trim(), 'user');
    userInput.value = '';
    localStorage.removeItem(STORAGE_KEYS.USER_INPUT);
  }

  loader.style.display = 'flex';

  try {
    const responseData = await callGeminiAPI(apiKey, messages.join('\n\n'));
    renderResult(responseData);
  } catch (error) {
    console.error(error);
    alert('生成中にエラーが発生しました: ' + error.message);
  } finally {
    loader.style.display = 'none';
  }
});

async function callGeminiAPI(apiKey, promptContent) {
  const systemPrompt = `
あなたは日本の教職員向けの極めて優秀な秘書です。
提供される会議の断片的なメモ、発言録、または音声文字起こしから、以下のJSON形式で構造化された議事録を生成してください。

【制約事項】
1. 言語は日本語。
2. 専門用語（分掌、学習指導、校務分掌など）を適切に扱う。
3. ToDoは「誰が」「何を」「いつまでに」を明確にする。担当者が不明な場合は「未定」または「全体」とする。

【出力JSONフォーマット】
{
  "summary": {
    "background": "...",
    "decisions": "...",
    "pending": "..."
  },
  "todos": [
    { "task": "...", "assignee": "...", "dept": "..." }
  ],
  "next_agenda": [ "..." ]
}

入力テキスト：
${promptContent}
    `;

  const model = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    const status = response.status;
    const msg = err.error?.message || '';

    if (status === 429 || msg.includes("Quota")) {
      throw new Error("【利用制限エラー】現在、AIの利用回数が上限に達しています。数分待ってから再度お試しください。");
    } else if (status === 400 && msg.includes("API key")) {
      throw new Error("【APIキーエラー】APIキーが正しくないか、無効です。設定を確認してください。");
    } else {
      throw new Error(`予期せぬエラーが発生しました(${status})。ネット接続や設定を確認してください。`);
    }
  }

  const data = await response.json();
  const resultText = data.candidates[0].content.parts[0].text;
  return JSON.parse(resultText);
}

function renderResult(data) {
  let html = `
        <div class="result-section">
            <div class="section-head"><i data-lucide="file-text"></i> 議事要約</div>
            <div class="summary-card">
                <p><strong>【背景・経緯】</strong><br>${data.summary.background}</p>
                <p style="margin-top:1rem;"><strong>【決定事項】</strong><br>${data.summary.decisions}</p>
                <p style="margin-top:1rem;"><strong>【継続検討事項】</strong><br>${data.summary.pending}</p>
            </div>
        </div>

        <div class="result-section">
            <div class="section-head"><i data-lucide="check-square"></i> 分掌別・担当者別ToDo</div>
            <div class="todo-list">
    `;

  data.todos.forEach(todo => {
    html += `
            <div class="todo-item">
                <span class="todo-tag">${todo.dept} / ${todo.assignee}</span>
                <span>${todo.task}</span>
            </div>
        `;
  });

  html += `
            </div>
        </div>

        <div class="result-section">
            <div class="section-head"><i data-lucide="calendar"></i> 次回アジェンダ案</div>
            <div class="agenda-container">
    `;

  data.next_agenda.forEach(item => {
    html += `
            <div class="agenda-item">${item}</div>
        `;
  });

  html += `
            </div>
        </div>
    `;

  resultArea.innerHTML = html;
  lucide.createIcons();

  // Store raw data for copying
  resultArea.dataset.raw = JSON.stringify(data);
}

// --- Copy Logic ---
copyBtn.addEventListener('click', () => {
  const raw = resultArea.dataset.raw;
  if (!raw) return;

  const data = JSON.parse(raw);

  let text = `【議事録要約】\n`;
  text += `■背景・経緯：\n${data.summary.background}\n\n`;
  text += `■決定事項：\n${data.summary.decisions}\n\n`;
  text += `■継続検討：\n${data.summary.pending}\n\n`;
  text += `【ToDoリスト】\n`;
  data.todos.forEach(t => {
    text += `・[${t.dept}/${t.assignee}] ${t.task}\n`;
  });
  text += `\n【次回アジェンダ案】\n`;
  data.next_agenda.forEach(a => {
    text += `・${a}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i data-lucide="check"></i> コピー完了';
    lucide.createIcons();
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      lucide.createIcons();
    }, 2000);
  });
});
