import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './AudioRecorder.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Render markdown-ish AI text nicely ──────────────────────
const renderAIText = (text) => {
    // Bold: **text** 
    // Code blocks: `code`
    // Line breaks
    const lines = text.split('\n');
    return lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />;

        // Bold headers like **Title:**
        const boldReplaced = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
            if (/^\*\*[^*]+\*\*$/.test(part)) {
                return <strong key={j}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });

        // Bullet points
        if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
            return (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: '#818cf8', flexShrink: 0 }}>•</span>
                    <span>{boldReplaced}</span>
                </div>
            );
        }

        // Numbered lines
        if (/^\d+\./.test(line.trim())) {
            return <div key={i} style={{ marginBottom: '6px' }}>{boldReplaced}</div>;
        }

        return <div key={i} style={{ marginBottom: '4px' }}>{boldReplaced}</div>;
    });
};

// ── Main Component ──────────────────────────────────────────
const AudioRecorder = () => {
    const [messages, setMessages] = useState([]); // {role:'user'|'assistant', content, isFile?}
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [chatSessions, setChatSessions] = useState([]); // recent history items from DB
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user')) || {};
    const userId = user.id || null;
    const username = user.name || 'User';
    const userImage = user.image || 'https://cdn.iconscout.com/icon/free/png-256/free-avatar-370-456322.png';

    // Scroll to bottom on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Load past sessions from DB
    useEffect(() => {
        const fetchHistory = async () => {
            if (!userId) return;
            try {
                const res = await axios.post(`${API_URL}/getall/${userId}`, {}, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const past = (res.data.transcriptions || []).reverse().map(t => ({
                    id: t._id,
                    label: `Phiên ${new Date(t.created_at || Date.now()).toLocaleDateString('vi-VN')}`,
                    transcription: t.transcription
                }));
                setChatSessions(past);
            } catch (e) { /* silent */ }
        };
        fetchHistory();
    }, [userId]);

    // Build history array for /chat (exclude file messages from AI context building)  
    const buildHistory = () => {
        return messages
            .filter(m => !m.isLoading)
            .map(m => ({ role: m.role, content: m.content }));
    };

    // ── Send text message ─────────────────────────────────
    const handleSendText = async () => {
        const text = inputText.trim();
        if (!text || isLoading) return;

        const userMsg = { role: 'user', content: text };
        const history = buildHistory();
        setMessages(prev => [...prev, userMsg]);
        setInputText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setIsLoading(true);

        try {
            const res = await axios.post(`${API_URL}/chat`, {
                message: text,
                history
            });
            setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '❌ Lỗi kết nối AI. Vui lòng thử lại.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Upload audio file ─────────────────────────────────
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = null;

        const userMsg = { role: 'user', content: `📎 Đã tải lên file: **${file.name}**\n_Đang phiên dịch và phân tích..._`, isFile: true };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        const formData = new FormData();
        formData.append('audio', file);
        formData.append('userId', userId);

        try {
            const uploadRes = await axios.post(`${API_URL}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const transcription = uploadRes.data.transcription || '';
            // Now send to /chat so user can ask follow-up questions
            const history = buildHistory();
            const contextMessage = `Tôi vừa upload file âm thanh "${file.name}". Đây là nội dung phiên dịch tự động:\n\n---\n${transcription}\n---\n\nHãy phân tích và tóm tắt nội dung cuộc hội thoại này.`;
            const chatRes = await axios.post(`${API_URL}/chat`, {
                message: contextMessage,
                history
            });

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: chatRes.data.reply,
                transcription // store for re-use
            }]);

            toast.success('✅ Phân tích xong!');
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Lỗi: ${err.response?.data?.message || 'Không thể phân tích file. Kiểm tra kết nối Render backend.'}`
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Microphone recording ──────────────────────────────
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                if (!blob.size) return;

                // Treat as file upload
                const fakeFile = new File([blob], 'recording.wav', { type: 'audio/wav' });
                const dt = new DataTransfer();
                dt.items.add(fakeFile);
                // Trigger synthetic upload
                const userMsg = { role: 'user', content: '🎙️ Đã ghi âm và gửi để phân tích...', isFile: true };
                setMessages(prev => [...prev, userMsg]);
                setIsLoading(true);

                const formData = new FormData();
                formData.append('audio', blob, 'recording.wav');
                formData.append('userId', userId);

                try {
                    const uploadRes = await axios.post(`${API_URL}/upload`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    const transcription = uploadRes.data.transcription || '';
                    const history = buildHistory();
                    const chatRes = await axios.post(`${API_URL}/chat`, {
                        message: `Đây là nội dung ghi âm vừa được phiên dịch:\n\n---\n${transcription}\n---\n\nHãy phân tích và tóm tắt cuộc hội thoại.`,
                        history
                    });
                    setMessages(prev => [...prev, { role: 'assistant', content: chatRes.data.reply }]);
                    toast.success('✅ Phân tích xong!');
                } catch (err) {
                    setMessages(prev => [...prev, { role: 'assistant', content: '❌ Lỗi phân tích ghi âm.' }]);
                } finally {
                    setIsLoading(false);
                }
            };

            mediaRecorderRef.current.start();
            setRecording(true);
            toast.info('🎙️ Đang ghi âm...');
        } catch {
            toast.error('Không thể truy cập Microphone!');
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    };

    // ── Load a past session ───────────────────────────────
    const loadSession = (session) => {
        setMessages([
            { role: 'user', content: `📂 Xem lại phiên phân tích`, isFile: true },
            { role: 'assistant', content: session.transcription }
        ]);
    };

    const startNewChat = () => {
        setMessages([]);
        setInputText('');
    };

    // ── Textarea auto-resize ──────────────────────────────
    const handleTextareaChange = (e) => {
        setInputText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
        }
    };

    // ─────────────────────────────────────────────────────
    return (
        <div className="dashboard-container">
            <ToastContainer position="top-right" autoClose={3000} theme="dark" />

            {/* ===== LEFT SIDEBAR ===== */}
            <aside className={`left-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
                <div className="sidebar-top">
                    <div className="brand">
                        <span className="brand-icon">✨</span>
                        {sidebarOpen && 'PharmaVoice'}
                    </div>
                    <button className="icon-btn" onClick={() => setSidebarOpen(o => !o)} title="Thu gọn sidebar">
                        {sidebarOpen ? '◀' : '▶'}
                    </button>
                </div>

                {sidebarOpen && (
                    <>
                        <button className="new-chat-btn" onClick={startNewChat}>
                            ✏️&nbsp;&nbsp;New chat
                        </button>

                        <div className="sidebar-section-label">Lịch sử</div>
                        <div className="chat-history-list">
                            {chatSessions.map((s, i) => (
                                <div key={s.id || i} className="history-item" onClick={() => loadSession(s)}>
                                    🎵 {s.label}
                                </div>
                            ))}
                            {chatSessions.length === 0 && (
                                <div style={{ padding: '8px 12px', color: '#555', fontSize: '13px' }}>
                                    Chưa có lịch sử
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="sidebar-footer">
                    <div className="user-row">
                        <img src={userImage} alt="avatar" className="user-avatar-small" />
                        {sidebarOpen && <span className="user-name">{username}</span>}
                    </div>
                </div>
            </aside>

            {/* ===== MAIN CHAT ===== */}
            <main className="chat-area">
                <div className="chat-topbar">
                    <div className="model-label">
                        PharmaVoice AI <span>Gemini 2.0 Flash ▾</span>
                    </div>
                </div>

                <div className="chat-messages">
                    {/* Empty State */}
                    {messages.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">✨</div>
                            <h2>PharmaVoice AI</h2>
                            <p>Hỏi bất kỳ điều gì về y tế, dược học, hoặc upload file ghi âm để phân tích cuộc tư vấn.</p>
                            <div className="suggestion-pills">
                                {[
                                    '💊 Tác dụng phụ của Paracetamol là gì?',
                                    '🩺 Upload file ghi âm để phân tích',
                                    '📋 Hướng dẫn tư vấn bệnh nhân tiểu đường',
                                    '🎙️ Ghi âm cuộc tư vấn mới'
                                ].map((s, i) => (
                                    <button
                                        key={i}
                                        className="suggestion-pill"
                                        onClick={() => {
                                            if (s.includes('Upload') || s.includes('Ghi âm')) {
                                                if (s.includes('Ghi âm')) startRecording();
                                                else fileInputRef.current.click();
                                            } else {
                                                setInputText(s.replace(/^[^\s]+\s/, ''));
                                                textareaRef.current?.focus();
                                            }
                                        }}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Message list */}
                    {messages.map((msg, i) => (
                        <div key={i} className={`message-row ${msg.role === 'user' ? 'user-row-msg' : 'ai-row-msg'}`}>
                            {msg.role === 'user' ? (
                                <div className="msg-bubble-user">
                                    {renderAIText(msg.content)}
                                </div>
                            ) : (
                                <div className="msg-ai-content">
                                    <div className="ai-avatar-icon">✨</div>
                                    <div className="ai-text-body">
                                        {renderAIText(msg.content)}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Loading indicator */}
                    {isLoading && (
                        <div className="message-row ai-row-msg">
                            <div className="msg-ai-content">
                                <div className="ai-avatar-icon">✨</div>
                                <div className="loading-dots">
                                    <span /><span /><span />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="chat-input-wrapper">
                    <div className="input-box">
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            placeholder="Hỏi PharmaVoice AI bất cứ điều gì..."
                            value={inputText}
                            onChange={handleTextareaChange}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                        />
                        <div className="input-actions">
                            {/* Upload file */}
                            <button className="action-btn" onClick={() => fileInputRef.current.click()} title="Upload file âm thanh" disabled={isLoading}>
                                <span>📎</span>
                            </button>
                            <input type="file" ref={fileInputRef} accept="audio/*,video/webm" onChange={handleFileChange} />

                            {/* Microphone */}
                            <button
                                className={`action-btn ${recording ? 'record-active' : ''}`}
                                onClick={recording ? stopRecording : startRecording}
                                title={recording ? 'Dừng ghi âm' : 'Ghi âm trực tiếp'}
                                disabled={isLoading && !recording}
                            >
                                <span>{recording ? '⏹️' : '🎙️'}</span>
                            </button>

                            {/* Send */}
                            <button
                                className="send-btn"
                                onClick={handleSendText}
                                disabled={!inputText.trim() || isLoading}
                                title="Gửi (Enter)"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="input-footer">
                        PharmaVoice AI có thể mắc lỗi. Xác minh thông tin y tế quan trọng với chuyên gia.
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AudioRecorder;
