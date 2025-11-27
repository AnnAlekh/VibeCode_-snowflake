// Chat management module
import { interviewState } from './state.js';

let isProcessingMessage = false;

export function getIsProcessingMessage() {
    return isProcessingMessage;
}

export function setIsProcessingMessage(value) {
    isProcessingMessage = value;
}

export function showTypingIndicator() {
    hideTypingIndicator(); // Remove old one first if exists
    
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) {
        console.warn('Chat messages container not found');
        return;
    }
    
    const indicatorDiv = document.createElement('div');
    indicatorDiv.id = 'typing-indicator';
    indicatorDiv.className = 'message typing-indicator';
    
    indicatorDiv.innerHTML = `
        <div class="message-bubble typing-bubble">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(indicatorDiv);
    
    // Force styles immediately
    indicatorDiv.style.display = 'flex';
    indicatorDiv.style.flexDirection = 'column';
    indicatorDiv.style.opacity = '1';
    indicatorDiv.style.visibility = 'visible';
    indicatorDiv.style.marginBottom = '20px';
    indicatorDiv.style.alignItems = 'flex-start';
    
    // Ensure display via requestAnimationFrame
    requestAnimationFrame(() => {
        if (indicatorDiv && indicatorDiv.parentNode) {
            indicatorDiv.style.display = 'flex';
            indicatorDiv.style.opacity = '1';
            indicatorDiv.style.visibility = 'visible';
            scrollChatToBottom();
        }
    });
    
    // Additional scroll after small delay
    setTimeout(() => scrollChatToBottom(), 100);
    
    console.log('Typing indicator shown');
}

export function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
        console.log('Typing indicator hidden');
    }
}

export function addChatMessage(role, content, generationTime = null) {
    // Hide indicator when adding message
    hideTypingIndicator();
    
    const rawContent = content || '';
    let cleanContent = rawContent;

    // Remove hidden "reasoning" from model if marked with <think> tags
    if (role === 'assistant' || role === 'system') {
        cleanContent = cleanContent
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<think>[\s\S]*$/gi, '')
            .replace(/<\/redacted_reasoning>/gi, '');
    }
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const time = new Date().toLocaleTimeString();
    const timestamp = Date.now();
    
    // Format time with generation time
    let timeHtml = `<div class="message-time">${time}`;
    if (generationTime !== null && role === 'assistant') {
        const seconds = (generationTime / 1000).toFixed(1);
        timeHtml += ` <span class="generation-time">(генерация: ${seconds}с)</span>`;
    }
    timeHtml += '</div>';
    
    messageDiv.innerHTML = `
        <div class="message-bubble">${cleanContent}</div>
        ${timeHtml}
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollChatToBottom();

    // Save to history
    interviewState.chatHistory.push({ 
        role, 
        content: cleanContent, 
        rawContent,
        time,
        timestamp,
        generationTime: generationTime || null
    });
}

export function scrollChatToBottom() {
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
}

export function isChatAtBottom() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return true;
    const threshold = 100; // pixels from bottom
    return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
}

export function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent line break
        if (!isProcessingMessage) {
            // This will be handled by the interview flow module
            return true;
        }
    }
    return false;
}

