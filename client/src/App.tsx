import React, {useState, useRef, useEffect} from 'react';
import {v4 as uuidv4} from 'uuid';
import './main.css';

interface MessageProps {
    messageId: string;
    speaker: 'user' | 'system';
    text: string;
    timestamp: string;
}

interface ChatHistory {
    chatId: string;
    userId: string;
    messages: MessageProps[];
}

const App: React.FC = () => {
    const [input, setInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [messages, setMessages] = useState<MessageProps[]>([]);
    const [previousChats, setPreviousChats] = useState<ChatHistory[]>([]);

    const chatId = useRef(uuidv4()); // Generate a unique chat ID
    const userId = useRef(uuidv4()); // Generate a unique user ID (this should be the same userId for fetching previous chats)

    // Fetch previous chat histories based on userId when the component mounts
    useEffect(() => {
        const checkUserIdParam = new URLSearchParams(window.location.search).get('userId');

        if (checkUserIdParam) {
            userId.current = checkUserIdParam;
        }

        const fetchPreviousChats = async () => {
            const response = await fetch(`http://localhost:8080/api/search-chats?userId=${userId.current}`);
            if (response.ok) {
                const chatHistories = await response.json();
                setPreviousChats(chatHistories);
            } else {
                console.log('No previous chats found');
            }
        };

        fetchPreviousChats();
    }, []);

    // Load selected previous chat into the current messages state and update chatId
    const loadPreviousChat = (chatIdToLoad: string, chatMessages: MessageProps[]) => {
        chatId.current = chatIdToLoad; // Set the current chatId to the selected chat's ID
        setMessages(chatMessages);
    };

    // Start a new chat with a new chat ID
    const startNewChat = () => {
        chatId.current = uuidv4(); // Generate a new unique chat ID
        setMessages([]); // Clear previous messages
    };

    const handleSubmit = async () => {
        if (!input) return;

        const userMessage: MessageProps = {
            messageId: uuidv4(),
            speaker: 'user',
            text: input,
            timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMessage]); // Update messages with user input

        setIsLoading(true);
        let totalResponse = '';

        const systemMessageId = uuidv4();
        const initialSystemMessage: MessageProps = {
            messageId: systemMessageId,
            speaker: 'system',
            text: '',
            timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, initialSystemMessage]); // Include initial system message

        const eventSource = new EventSource(`http://localhost:8080/api/message?message=${input}`);

        eventSource.onopen = () => {
            console.log('Connection to server opened.');
        };

        eventSource.onmessage = (event) => {
            if (event.data === '[DONE]') {
                eventSource.close();
                setIsLoading(false);

                // When done, finalize the system message with complete response
                setMessages((prev) => {
                    const updatedMessages = prev.map((msg) =>
                        msg.messageId === systemMessageId
                            ? {...msg, text: totalResponse}
                            : msg
                    );

                    // Save the updated messages to the API after the last message is set
                    saveConversation(updatedMessages);
                    return updatedMessages;
                });
            } else {
                totalResponse += event.data;

                // Update the system message in real-time as data is streamed
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.messageId === systemMessageId
                            ? {...msg, text: totalResponse}
                            : msg
                    )
                );
            }
        };

        eventSource.onerror = (error) => {
            console.error('Streaming error:', error);
            eventSource.close();
            setIsLoading(false);
        };

        // Clear input field after submission
        setInput('');
    };

    // Function to save the conversation using an API call
    const saveConversation = async (updatedMessages: MessageProps[]) => {
        const data = {
            chatId: chatId.current, // Use the current chatId
            userId: userId.current,
            messages: updatedMessages, // Pass the updated messages to the API
        };

        try {
            const response = await fetch('http://localhost:8080/api/save-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error('Failed to save conversation');
            }

            console.log('Conversation saved successfully');
        } catch (error) {
            console.error('Error saving conversation:', error);
        }
    };

    return (
        <main>
            <section className="chat-container">
                <h1 className="chat-container__title">Chat with OpenAI API</h1>

                <div className="previous-chats-container">
                    <h2 className="previous-chats-title">Previous Chats:</h2>
                    <div className="previous-chats-list-container">
                        <ul className="previous-chats-list">
                            {previousChats.map((chatHistory, index) => (
                                <li key={chatHistory.chatId} className="previous-chat-item">
                                    <button
                                        className="previous-chat-button"
                                        onClick={() => loadPreviousChat(chatHistory.chatId, chatHistory.messages)}
                                    >
                                        Load Chat {index + 1}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <button className="start-new-chat-button" onClick={startNewChat}>
                            Start New Chat
                        </button>
                    </div>
                </div>

                <div className="chat-container__response-container">
                    <h2 className="chat-container__response-title">Chat:</h2>
                    <div className="chat-container__response">
                        {messages.length ? (
                            messages.map((message: MessageProps) => (
                                <div
                                    key={message.messageId}
                                    className={`chat-container__message chat-container__message--${message.speaker}`}
                                >
                                    <p className="chat-container__message-text">{message.text}</p>
                                </div>
                            ))
                        ) : (
                            <p>Waiting </p>
                        )}
                    </div>
                </div>
                <div className="chat-container__chat">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Enter your message"
                        className="chat-container__input"
                    />

                    <button
                        className="chat-container__button"
                        onClick={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? '...' : '⬆️'}
                    </button>
                </div>
            </section>
        </main>
    );
};

export default App;
