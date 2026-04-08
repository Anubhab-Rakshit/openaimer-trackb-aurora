const EMOTION_ICONS = {
  anxiety: "😟", sadness: "😔", anger: "😤", fear: "😨",
  loneliness: "🌧️", shame: "😶", guilt: "😓", grief: "💔",
  frustration: "😤", hopelessness: "😶‍🌫️", overwhelm: "🌊",
  joy: "✨", unknown: "💭",
};

function getEmotionIcon(emotion) {
  return EMOTION_ICONS[emotion?.toLowerCase()] ?? "💭";
}

let ws = null;
let isWaiting = false;
let currentUserId = null;
let currentUserName = "there";

function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/chat`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "init", userId: currentUserId, userName: currentUserName }));
    setStatus(true);
  };
  ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
  ws.onclose = () => {
    setStatus(false);
    setTimeout(connectWS, 3000);
  };
  ws.onerror = (e) => console.error("[WS] Error", e);
}

function handleServerMessage(data) {
  switch (data.type) {
      case "ready":
          setStatus(true);
          setCogLoad("OPTIMAL");
          break;
      case "status":
          if (data.message === "thinking") {
              showTypingIndicator();
              setCogLoad("ACTIVE");
          }
          break;
      case "response":
          removeTypingIndicator();
          appendMessage("ai", data.message, data.isCrisis);
          if (data.emotion) updateSignalPanel(data.emotion, data.routerOutput);
          if (data.isCrisis) showCrisisBanner();
          setCogLoad("OPTIMAL");
          setWaiting(false);
          break;
      case "error":
          removeTypingIndicator();
          appendMessage("ai", "I'm having trouble connecting to my core processes right now.");
          setCogLoad("FAULT");
          setWaiting(false);
          break;
  }
}

// UI Modifiers
function setStatus(online) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  if (online) { dot.classList.add("green"); text.textContent = "Live"; } 
  else { dot.classList.remove("green"); text.textContent = "Reconnecting..."; }
}

function setCogLoad(state) {
  const el = document.getElementById("cog-status");
  const mainOrb = document.getElementById("main-orb");
  
  if (state === "ACTIVE") {
      el.textContent = "PROCESSING..."; el.style.color = "#f5a623";
      mainOrb.style.animationDuration = "1s";
  } else if (state === "FAULT") {
      el.textContent = "FAULT DETECTED"; el.style.color = "#ed6b6b";
      mainOrb.style.filter = "grayscale(100%)";
  } else {
      el.textContent = "OPTIMAL STATUS"; el.style.color = "#9d6bfa";
      mainOrb.style.animationDuration = "4s";
      mainOrb.style.filter = "none";
  }
}

function setWaiting(val) {
  isWaiting = val;
  const btn = document.getElementById("send-btn");
  const inp = document.getElementById("message-input");
  if (btn) btn.disabled = val;
  if (inp) inp.disabled = val;
}

function showTypingIndicator() {
  removeTypingIndicator();
  const messages = document.getElementById("messages");
  
  const wrapper = document.createElement("div");
  wrapper.className = "message ai";
  wrapper.id = "typing-wrapper";
  
  wrapper.innerHTML = `
    <div class="msg-info">OpenAimer</div>
    <div class="bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    </div>`;
    
  messages.appendChild(wrapper);
  scrollToBottom();
}

function removeTypingIndicator() {
  document.getElementById("typing-wrapper")?.remove();
}

function appendMessage(role, content, isCrisis = false) {
  const messages = document.getElementById("messages");
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  if (isCrisis) wrapper.classList.add("crisis");

  const name = role === "ai" ? "OpenAimer" : currentUserName;
  wrapper.innerHTML = `
    <div class="msg-info">${name}</div>
    <div class="bubble">${content}</div>
  `;
  
  messages.appendChild(wrapper);
  scrollToBottom();
}

function scrollToBottom() {
  const chatArea = document.getElementById("chat-area");
  if (chatArea) requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; });
}

function updateSignalPanel(emotion, routerOutput) {
  document.getElementById("emotion-empty").classList.add("hidden");
  document.getElementById("emotion-panel").classList.remove("hidden");

  document.getElementById("sig-emotion").textContent = `${getEmotionIcon(emotion?.primary)} ${emotion?.primary ?? "Unknown"}`;
  document.getElementById("sig-need").textContent = routerOutput?.implicit_need ?? "—";
  
  const vol = (routerOutput?.volatility_score ?? 0.3) * 100;
  const bar = document.getElementById("sig-bar");
  bar.style.width = `${vol}%`;
  bar.style.background = vol > 65 ? "linear-gradient(90deg, #ed6b6b, #f87171)" : "linear-gradient(90deg, #6e56cf, #9d6bfa)";
  
  document.getElementById("sig-mask").textContent = routerOutput?.sarcasm_detected ? "Yes ⚠️" : "No";
}

function showCrisisBanner() {
  document.getElementById("crisis-banner").classList.remove("hidden");
}

function sendMessage() {
  const input = document.getElementById("message-input");
  const text = input.value.trim();
  if (!text || isWaiting || !ws || ws.readyState !== WebSocket.OPEN) return;

  document.getElementById("emotion-empty").classList.add("hidden");
  
  appendMessage("user", text);
  input.value = "";
  input.style.height = "auto";
  setWaiting(true);
  ws.send(JSON.stringify({ type: "chat", message: text }));
}

// Binds
document.getElementById("start-btn").addEventListener("click", () => {
  const name = document.getElementById("name-input").value.trim() || "You";
  currentUserName = name;
  currentUserId = `user_${Date.now()}`;
  
  document.getElementById("setup-modal").style.display = "none";
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("user-display").textContent = name;
  document.getElementById("user-chip").querySelector(".user-avatar").textContent = name.charAt(0).toUpperCase();

  connectWS();
});

document.getElementById("name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("start-btn").click();
});

document.getElementById("send-btn").addEventListener("click", sendMessage);

const minp = document.getElementById("message-input");
minp.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
minp.addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
});
