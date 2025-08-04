// Utility: wait for DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Chat functionality
  const chatMessages = document.getElementById('chat-messages');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');

  /**
   * Determine a canned response based on user input.
   * This function looks for simple keywords and returns a relevant reply.
   * It serves purely for demonstration — a real ChatGPT integration would
   * call the OpenAI API to generate dynamic answers.
   * @param {string} input
   * @returns {string}
   */
  function getResponse(input) {
    const normalized = input.toLowerCase();
    if (/\bhello\b|\bhi\b|\bhey\b/.test(normalized)) {
      return "Hello! I'm ChatGPT — a sophisticated AI that can help you with a wide range of questions.";
    }
    if (/\bhelp\b|\bassist\b/.test(normalized)) {
      return "I can assist with writing, learning, coding, planning and more. What do you want to explore?";
    }
    if (/\bcode\b|\bprogram\b/.test(normalized)) {
      return "Need help with code? I can generate snippets, explain algorithms, and debug errors.";
    }
    if (/\bstory\b|\bwrite\b|\bnarrative\b/.test(normalized)) {
      return "Let me spin a tale! With a prompt, I can craft engaging stories or creative text.";
    }
    if (/\bplan\b|\bitinerary\b|\brecommend\b/.test(normalized)) {
      return "From travel itineraries to meal plans, I can offer personalized recommendations tailored to your needs.";
    }
    return "That's an interesting thought! Imagine what we could do with a live API connection.";
  }

  /**
   * Append a message to the chat window.
   * @param {string} text - The message text
   * @param {string} sender - "user" or "bot"
   */
  function appendMessage(text, sender) {
    const messageEl = document.createElement('div');
    messageEl.classList.add('message', sender);
    const bubble = document.createElement('div');
    bubble.classList.add('text');
    bubble.textContent = text;
    messageEl.appendChild(bubble);
    chatMessages.appendChild(messageEl);
    // scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /**
   * Handle sending a user message.
   */
  function sendMessage() {
    const input = userInput.value.trim();
    if (!input) return;
    appendMessage(input, 'user');
    userInput.value = '';
    // simulate latency
    setTimeout(() => {
      const reply = getResponse(input);
      appendMessage(reply, 'bot');
    }, 500);
  }

  // Event listeners
  sendBtn.addEventListener('click', sendMessage);
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  // Footer year
  const yearSpan = document.getElementById('year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
});