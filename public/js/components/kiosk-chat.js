(() => {
    function init({ getCart }) {
        const dialog = document.getElementById('drink-chat');
        const launcher = document.getElementById('chat-open');
        const form = document.getElementById('chat-form');
        const input = document.getElementById('chat-input');
        const send = document.getElementById('chat-send');
        const messages = document.getElementById('chat-messages');
        const status = document.getElementById('chat-status');
        let history = [];
        let pending = null;

        function setMessageText(message, text) {
            if (message.dataset.role === 'assistant') {
                message.innerHTML = ChatMarkdown.render(text);
            } else {
                message.textContent = text;
            }
        }

        function addMessage(role, text) {
            const message = document.createElement('div');
            message.className = 'chat-message';
            message.dataset.role = role;
            message.setAttribute('aria-label', role === 'user' ? 'You' : 'Drink assistant');
            setMessageText(message, text);
            messages.append(message);
            messages.scrollTop = messages.scrollHeight;
            return message;
        }

        function setBusy(busy) {
            send.disabled = busy;
            messages.setAttribute('aria-busy', String(busy));
            messages.setAttribute('aria-live', busy ? 'off' : 'polite');
            messages.querySelectorAll('.chat-prompts button').forEach(button => { button.disabled = busy; });
        }

        function reset() {
            pending?.abort();
            pending = null;
            history = [];
            input.value = '';
            status.textContent = '';
            messages.replaceChildren();
            setBusy(false);
            addMessage('assistant', 'Hi! I can help you choose a drink, explain ingredients, or walk you through ordering. What sounds good?');
            const prompts = document.createElement('div');
            prompts.className = 'chat-prompts';
            ['Help me choose a drink', 'I have a food allergy', 'How do I place my order?'].forEach(text => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = text;
                button.addEventListener('click', () => {
                    input.value = text;
                    form.requestSubmit();
                });
                prompts.append(button);
            });
            messages.append(prompts);
        }

        launcher.addEventListener('click', () => {
            dialog.showModal();
            launcher.setAttribute('aria-expanded', 'true');
            input.focus();
        });
        document.getElementById('chat-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => {
            launcher.setAttribute('aria-expanded', 'false');
            launcher.focus();
        });
        document.getElementById('chat-reset').addEventListener('click', () => { reset(); input.focus(); });
        document.getElementById('new-order-btn').addEventListener('click', reset);
        window.addEventListener('pagehide', () => pending?.abort());
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                form.requestSubmit();
            }
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const question = input.value.trim();
            if (pending || !question || question.length > 1000) return;
            const controller = new AbortController();
            pending = controller;
            // Retain complete pairs so every request starts and ends with a user message.
            const requestHistory = [...history.slice(-12), { role: 'user', content: question }];
            addMessage('user', question);
            const answer = addMessage('assistant', '');
            input.value = '';
            setBusy(true);
            status.textContent = 'Looking at the menu…';
            let reply = '';
            let completed = false;
            const timeout = setTimeout(() => controller.abort(), 55000);
            try {
                const response = await fetch('/api/kiosk/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: requestHistory, cart: getCart() }),
                    signal: controller.signal
                });
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.error || 'The assistant is unavailable. Please try again.');
                }
                if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
                    throw new Error('The assistant could not connect. Please try again.');
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                    const { value, done } = await reader.read();
                    buffer += decoder.decode(value, { stream: !done });
                    let end;
                    while ((end = buffer.indexOf('\n\n')) !== -1) {
                        const frame = buffer.slice(0, end);
                        buffer = buffer.slice(end + 2);
                        const eventName = frame.split('\n').find(line => line.startsWith('event: '))?.slice(7);
                        const dataLine = frame.split('\n').find(line => line.startsWith('data: '));
                        if (!dataLine) continue;
                        const data = JSON.parse(dataLine.slice(6));
                        if (eventName === 'delta') {
                            reply += data.text;
                            setMessageText(answer, reply);
                            messages.scrollTop = messages.scrollHeight;
                            status.textContent = 'Assistant is replying…';
                        } else if (eventName === 'error') {
                            throw new Error(data.error);
                        } else if (eventName === 'done') {
                            completed = true;
                        }
                    }
                    if (done) break;
                }
                if (!completed || !reply.trim()) throw new Error('The reply was interrupted. Please try your question again.');
                history = [...requestHistory, { role: 'assistant', content: reply }];
                status.textContent = 'Reply ready.';
            } catch (error) {
                if (pending !== controller) return;
                controller.abort();
                setMessageText(answer, reply ? `${reply}\n\nThis reply was interrupted. Please ask again.`
                    : error.name === 'AbortError' ? 'The assistant took too long. Please try again.' : error.message);
                status.textContent = 'Your question was not completed. You can try again.';
                if (!input.value) input.value = question;
            } finally {
                clearTimeout(timeout);
                if (pending === controller) {
                    pending = null;
                    setBusy(false);
                    if (dialog.open) input.focus();
                }
            }
        });

        reset();
    }
    window.KioskChat = { init };
})();
