import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
const toast = { success: () => {}, info: () => {}, error: () => {} };
import './AudioRecorder.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Render AI markdown-ish text ──────────────────────────────
const renderAIText = (text) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />;
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            /^\*\*[^*]+\*\*$/.test(part) ? <strong key={j}>{part.slice(2, -2)}</strong> : part
        );
        if (/^[-•]\s/.test(line.trim()))
            return <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}><span style={{ color: '#818cf8', flexShrink: 0 }}>•</span><span>{parts}</span></div>;
        if (/^\d+\./.test(line.trim()))
            return <div key={i} style={{ marginBottom: '6px' }}>{parts}</div>;
        return <div key={i} style={{ marginBottom: '4px' }}>{parts}</div>;
    });
};

// Helper tạo session rỗng
const emptySession = () => ({ messages: [], loadingCount: 0, loadingLabel: 'Đang suy nghĩ...', pendingQueue: [] });
const NEW_CHAT_ID = '__new__';

// ── Main Component ───────────────────────────────────────────
const AudioRecorder = () => {
    // ── Sidebar sessions list (metadata + messages for history)
    const [chatSessions, setChatSessions] = useState([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [contextMenu, setContextMenu] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');

    // ── Active session
    const [activeId, setActiveId] = useState(NEW_CHAT_ID);

    // ── Per-session live state (messages + loading) — keyed by session id
    // sessionData[id] = { messages, isLoading, loadingLabel, pendingQueue }
    const [sessionData, setSessionData] = useState({ [NEW_CHAT_ID]: emptySession() });
    const sessionDataRef = useRef(sessionData);
    useEffect(() => { sessionDataRef.current = sessionData; }, [sessionData]);

    // ── Mobile Responsive Sidebar & Settings
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState('general');
    const [tempUser, setTempUser] = useState({ name: '', image: '' });

    const [inputText, setInputText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingFiles, setPendingFiles] = useState([]); // danh sách file đang staged

    const fileInputRef = useRef(null);
    const avatarInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    
    // ── Grouped Sessions ──────────────────────────────────────
    const groupedChats = React.useMemo(() => {
        const groups = { today: [], yesterday: [], last7Days: [], older: [] };
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const searchLower = searchQuery.toLowerCase();

        chatSessions.forEach(session => {
            if (searchQuery && !session.label.toLowerCase().includes(searchLower)) return;

            let timestamp = 0;
            if (session.id.startsWith('chat_')) {
                timestamp = parseInt(session.id.split('_')[1], 10);
            }

            if (!timestamp) {
                groups.older.push(session);
                return;
            }

            const sessionDate = new Date(timestamp);
            const sessionDayStart = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate()).getTime();
            const diffDays = Math.round((todayStart - sessionDayStart) / (1000 * 60 * 60 * 24));

            if (diffDays === 0) groups.today.push(session);
            else if (diffDays === 1) groups.yesterday.push(session);
            else if (diffDays <= 7) groups.last7Days.push(session);
            else groups.older.push(session);
        });
        return groups;
    }, [chatSessions, searchQuery]);

    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!token) {
            window.location.replace('/login');
        }
    }, [token]);

    const user = JSON.parse(localStorage.getItem('user')) || {};
    const userId = user.id || null;
    const [username, setUsername] = useState(user.name || 'User');
    const [userImage, setUserImage] = useState(user.image || 'https://cdn.iconscout.com/icon/free/png-256/free-avatar-370-456322.png');

    useEffect(() => {
        if (theme === 'light') document.body.classList.add('light-theme');
        else document.body.classList.remove('light-theme');
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Current session live data
    const current = sessionData[activeId] || emptySession();
    const { messages, loadingCount = 0, loadingLabel } = current;
    const isLoading = loadingCount > 0;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading, activeId]);

    // ── Load saved sessions from localStorage + DB
    useEffect(() => {
        const local = JSON.parse(localStorage.getItem(`pharmaSessions_${userId || 'anonymous'}`) || '[]');
        setChatSessions(local);

        const fetchAudio = async () => {
            if (!userId) return;
            try {
                const res = await axios.post(`${API_URL}/getall/${userId}`, {}, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const audioSessions = (res.data.transcriptions || []).reverse().map((t, i) => ({
                    id: 'audio_' + (t._id || t.id || i),
                    label: `🎵 Audio ${i + 1}`,
                    messages: [
                        { role: 'user', content: '📎 File audio' },
                        { role: 'assistant', content: t.transcription }
                    ]
                }));
                setChatSessions(prev => {
                    const ids = prev.map(p => p.id);
                    return [...prev, ...audioSessions.filter(a => !ids.includes(a.id))];
                });
            } catch (e) { /* silent */ }
        };
        fetchAudio();
    }, [userId]);

    // ── Patch helper: update a specific session's live data
    const patchSession = (id, patch) => {
        setSessionData(prev => ({
            ...prev,
            [id]: { ...(prev[id] || emptySession()), ...patch }
        }));
    };

    // ── Save / update session in localStorage sidebar
    const persistSession = (id, msgs) => {
        if (msgs.length < 1) return;
        const firstUser = msgs.find(m => m.role === 'user');
        const raw = firstUser?.content || 'Cuộc trò chuyện';
        const label = '💬 ' + raw.slice(0, 28) + (raw.length > 28 ? '...' : '');
        const session = { id, label, messages: msgs };

        setChatSessions(prev => {
            const exists = prev.find(s => s.id === id);
            const finalLabel = exists ? exists.label : label;
            const session = { id, label: finalLabel, messages: msgs };

            const updated = exists
                ? prev.map(s => s.id === id ? session : s)
                : [session, ...prev].slice(0, 20);
            const localOnly = updated.filter(s => s.id.startsWith('chat_'));
            localStorage.setItem(`pharmaSessions_${userId || 'anonymous'}`, JSON.stringify(localOnly));
            return updated;
        });
    };

    // ── Send (text only OR text + staged files)
    const handleSendText = async () => {
        const text = inputText.trim();
        if (!text && pendingFiles.length === 0) return;

        let sid = activeId === NEW_CHAT_ID ? 'chat_' + Date.now() : activeId;

        // Bắt đầu một session mới và chuyển thẳng focus sang ID này, tránh lỗi người dùng gõ Enter rồi bị kẹt ở Welcome Screen
        if (activeId === NEW_CHAT_ID) {
            setActiveId(sid);
            setSessionData(prev => ({ ...prev, [sid]: { ...(prev[NEW_CHAT_ID] || emptySession()) }, [NEW_CHAT_ID]: emptySession() }));
        }

        const liveCurrent = sessionDataRef.current[sid] || emptySession();

        if ((liveCurrent.loadingCount || 0) > 0 && pendingFiles.length > 0) {
            toast.error("Vui lòng đợi AI xử lý xong trước khi upload thêm file!");
            return;
        }

        if (pendingFiles.length > 0) {
            await handleSendWithFiles(text, sid);
        } else {
            await handleSendTextOnly(text, sid);
        }
    };

    // ── Send text only
    const handleSendTextOnly = async (text, forcedSid = null) => {
        let sid = forcedSid || (activeId === NEW_CHAT_ID ? 'chat_' + Date.now() : activeId);

        const liveCurrent = sessionDataRef.current[sid] || emptySession();
        if ((liveCurrent.loadingCount || 0) > 0) {
            setSessionData(prev => {
                const temp = prev[sid] || emptySession();
                return { ...prev, [sid]: { ...temp, pendingQueue: [...(temp.pendingQueue || []), text] } };
            });
            setInputText('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            return;
        }

        const history = (sessionDataRef.current[sid]?.messages || messages)
            .filter(m => !m.isFile).map(m => ({ role: m.role, content: m.content }));
        const userMsg = { role: 'user', content: text };
        setSessionData(prev => {
            const temp = prev[sid] || emptySession();
            const newMessages = [...temp.messages, userMsg];
            persistSession(sid, newMessages);
            return { ...prev, [sid]: { ...temp, messages: newMessages, loadingCount: (temp.loadingCount || 0) + 1, loadingLabel: 'Đang suy nghĩ...' } };
        });
        setInputText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        try {
            const res = await axios.post(`${API_URL}/chat`, { message: text, history });
            const aiMsg = { role: 'assistant', content: res.data.reply };
            setSessionData(prev => {
                const temp = prev[sid] || emptySession();
                const updated = [...temp.messages, aiMsg];
                persistSession(sid, updated);
                return { ...prev, [sid]: { ...temp, messages: updated, loadingCount: Math.max(0, (temp.loadingCount || 0) - 1) } };
            });
        } catch (err) {
            const detail = err.response?.data?.error ? ` (${err.response.data.error})` : '';
            setSessionData(prev => {
                const temp = prev[sid] || emptySession();
                return { ...prev, [sid]: { ...temp, messages: [...temp.messages, { role: 'assistant', content: `❌ Lỗi kết nối tới AI.${detail}` }], loadingCount: Math.max(0, (temp.loadingCount || 0) - 1) } };
            });
        } finally {
            checkAndProcessQueue(sid);
        }
    };

    // ── Send text + multiple staged files together
    const handleSendWithFiles = async (userPrompt, forcedSid = null) => {
        const files = pendingFiles;
        setPendingFiles([]);

        let sid = forcedSid || (activeId === NEW_CHAT_ID ? 'chat_' + Date.now() : activeId);

        const fileNames = files.map(f => f.name).join(', ');
        const bubbleText = userPrompt
            ? `📎 **${fileNames}**\n${userPrompt}`
            : `📎 **${fileNames}**`;
        const userMsg = { role: 'user', content: bubbleText, isFile: true };
        setSessionData(prev => {
            const temp = prev[sid] || emptySession();
            const newMessages = [...temp.messages, userMsg];
            persistSession(sid, newMessages);
            return { ...prev, [sid]: { ...temp, messages: newMessages, loadingCount: (temp.loadingCount || 0) + 1, loadingLabel: `Đang tải ${files.length} file lên Gemini...` } };
        });
        setInputText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        try {
            // Upload tất cả file song song
            patchSession(sid, { loadingLabel: `Đang phiên dịch ${files.length} file...` });
            const uploadPromises = files.map(file => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('userId', userId);
                formData.append('customerHint', userPrompt || ''); // Gửi Hint chứa SĐT hoặc Tên Khách Hàng xuống Backend
                return axios.post(`${API_URL}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 })
                    .then(res => ({ name: file.name, transcription: res.data.transcription || (typeof res.data === 'string' ? res.data : '') }))
                    .catch((err) => {
                        const errMsg = err.response?.data?.message || err.message || 'Unknown error';
                        return { name: file.name, transcription: `[KHÔNG THỂ DỊCH: ${errMsg}]` };
                    });
            });
            const results = await Promise.all(uploadPromises);

            // Gộp transcription (đã được AI đánh giá sẵn từ backend)
            const combined = results.map((r, i) =>
                `**File ${i + 1}: ${r.name}**\n\n${r.transcription}`
            ).join('\n\n---\n\n');

            let finalReply = combined;

            if (userPrompt) {
                patchSession(sid, { loadingLabel: 'Đang trả lời câu hỏi của bạn về file...' });
                const history = (sessionData[sid]?.messages || []).filter(m => !m.isFile).map(m => ({ role: m.role, content: m.content }));
                const prompt = `Tôi vừa upload ${files.length} file đính kèm. Dưới đây là nội dung phiên dịch từng file:\n\n${combined}\n\nYêu cầu của tôi: ${userPrompt}`;
                const chatRes = await axios.post(`${API_URL}/chat`, { message: prompt, history });
                finalReply = chatRes.data.reply;
            }

            const aiMsg = { role: 'assistant', content: finalReply };
            const formMsg = { 
                role: 'assistant', 
                isCustomerForm: true, 
                transcriptionForWiki: combined, // Dùng để lưu vào wiki sau khi nhập thông tin khách
                processed: false 
            };

            setSessionData(prev => {
                const temp = prev[sid] || emptySession();
                const updated = [...temp.messages, aiMsg, formMsg];
                persistSession(sid, updated);
                return { ...prev, [sid]: { ...temp, messages: updated, loadingCount: Math.max(0, (temp.loadingCount || 0) - 1) } };
            });
            toast.success(`✅ Đã phân tích ${files.length} file!`);
        } catch (err) {
            const detail = err.response?.data?.error ? ` (${err.response.data.error})` : '';
            const origMsg = err.response?.data?.message || err.message || 'Không thể phân tích file.';
            const msg = err.code === 'ECONNABORTED' ? '⏳ Quá thời gian chờ mạng. Thử lại!' : `❌ Lỗi: ${origMsg}${detail}`;
            
            setSessionData(prev => {
                const temp = prev[sid] || emptySession();
                return { ...prev, [sid]: { ...temp, messages: [...temp.messages, { role: 'assistant', content: msg }], loadingCount: Math.max(0, (temp.loadingCount || 0) - 1) } };
            });
        } finally {
            checkAndProcessQueue(sid);
        }
    };

    const checkAndProcessQueue = (sid) => {
        setTimeout(() => {
            const latestData = sessionDataRef.current[sid];
            if (latestData && latestData.pendingQueue && latestData.pendingQueue.length > 0 && (latestData.loadingCount || 0) === 0) {
                const nextText = latestData.pendingQueue[0];
                const newQueue = latestData.pendingQueue.slice(1);
                setSessionData(prev => ({
                    ...prev,
                    [sid]: { ...prev[sid], pendingQueue: newQueue }
                }));
                handleSendTextOnly(nextText, sid);
            }
        }, 150);
    };

    // ── File change: STAGE files (multi), don't upload yet
    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        e.target.value = null;
        setPendingFiles(prev => [...prev, ...files]);
        textareaRef.current?.focus();
    };

    // ── Load past session
    const loadSession = (session) => {
        const sid = session.id;
        setActiveId(sid);
        // Seed live state nếu chưa có
        setSessionData(prev => ({
            ...prev,
            [sid]: prev[sid] || { ...emptySession(), messages: session.messages || [] }
        }));
        setContextMenu(null);
    };

    // ── New chat
    const startNewChat = () => {
        setActiveId(NEW_CHAT_ID);
        setSessionData(prev => ({ ...prev, [NEW_CHAT_ID]: emptySession() }));
        setInputText('');
        setContextMenu(null);
    };

    // ── Rename
    const startRename = (session) => {
        setRenamingId(session.id);
        setRenameValue(session.label.replace(/^[💬🎵📎]\s*/, ''));
        setContextMenu(null);
    };
    const commitRename = (id) => {
        if (!renameValue.trim()) { setRenamingId(null); return; }
        const newLabel = '💬 ' + renameValue.trim();
        setChatSessions(prev => {
            const updated = prev.map(s => s.id === id ? { ...s, label: newLabel } : s);
            localStorage.setItem(`pharmaSessions_${userId || 'anonymous'}`, JSON.stringify(updated.filter(s => s.id.startsWith('chat_'))));
            return updated;
        });
        setRenamingId(null);
        setRenameValue('');
    };

    // ── Handle Customer Form Submission
    const handlePostUploadCustomerInfo = async (sid, msgIndex, identifier, transcription) => {
        if (!identifier.trim()) {
            toast.error("Vui lòng nhập tên hoặc SĐT khách hàng!");
            return;
        }

        try {
            toast.loading("Đang đẩy dữ liệu vào Wiki...");
            await axios.post(`${API_URL}/update-customer-wiki`, { identifier, transcription });
            toast.dismiss();
            toast.success("Đã cập nhật Wiki Khách hàng!");

            // Đánh dấu form này đã xử lý xong
            setSessionData(prev => {
                const temp = prev[sid] || emptySession();
                const updatedMsgs = temp.messages.map((m, i) => 
                    i === msgIndex ? { ...m, processed: true, identifierUsed: identifier } : m
                );
                persistSession(sid, updatedMsgs);
                return { ...prev, [sid]: { ...temp, messages: updatedMsgs } };
            });
        } catch (err) {
            toast.dismiss();
            toast.error("Lỗi khi cập nhật Wiki: " + (err.response?.data?.message || err.message));
        }
    };

    const deleteSession = (id) => {
        setChatSessions(prev => {
            const updated = prev.filter(s => s.id !== id);
            localStorage.setItem(`pharmaSessions_${userId || 'anonymous'}`, JSON.stringify(updated.filter(s => s.id.startsWith('chat_'))));
            return updated;
        });
        setSessionData(prev => { const n = { ...prev }; delete n[id]; return n; });
        if (activeId === id) startNewChat();
        setContextMenu(null);
    };

    // ── Textarea
    const handleTextareaChange = (e) => {
        setInputText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }
    };

    // ── Settings Save
    const saveSettings = () => {
        setUsername(tempUser.name);
        setUserImage(tempUser.image);
        if (user) {
            const updated = { ...user, name: tempUser.name, image: tempUser.image };
            localStorage.setItem('user', JSON.stringify(updated));
        }
        setIsSettingsOpen(false);
        toast.success('Đã cập nhật thông tin!');
    };

    const handleAvatarUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setTempUser(prev => ({ ...prev, image: reader.result }));
        };
        reader.readAsDataURL(file);
    };

    // ── Spinner badge: tổng số session đang loading (bao gồm cả hiện tại)
    const backgroundLoadingCount = Object.values(sessionData)
        .filter(d => (d.loadingCount || 0) > 0).length;

    // ────────────────────────────────────────────────────────
    if (!token) {
        return <div style={{ minHeight: '100vh', background: 'var(--bg-color, #111827)' }} />;
    }

    return (
        <div className="dashboard-container">
            {isSettingsOpen ? (
                /* =======================
                   SETTINGS PAGE LAYOUT
                   ======================= */
                <>
                    <aside className={`settings-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
                        <div className="settings-sidebar-header">
                            <h2>Curator AI</h2>
                            <p>Settings Panel</p>
                        </div>
                        <nav className="settings-nav">
                            <button className={`settings-nav-item ${activeSettingsTab === 'general' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('general')}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                General
                            </button>
                            <button className={`settings-nav-item ${activeSettingsTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('notifications')}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                                Notifications
                            </button>
                            <button className={`settings-nav-item ${activeSettingsTab === 'security' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('security')}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                Security
                            </button>
                            <button className="settings-nav-item" style={{ color: '#ef4444' }} onClick={() => {
                                localStorage.removeItem('token');
                                localStorage.removeItem('user');
                                window.location.href = '/login';
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                Log out
                            </button>
                        </nav>
                        
                        <div className="settings-sidebar-bottom">
                            <button className="pharma-btn-primary full-width" onClick={() => setIsSettingsOpen(false)}>
                                ◀ Quay lại Chat
                            </button>
                        </div>
                    </aside>

                    <main className="settings-main-area">
                        <header className="settings-page-header">
                            <button className="mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                            </button>
                            <div>
                                <h1>Cài đặt</h1>
                                <p>Quản lý tùy chọn tài khoản và không gian làm việc của bạn.</p>
                            </div>
                        </header>

                        {activeSettingsTab === 'general' && (
                            <div className="settings-grid">
                                {/* BLOCK 1: Profile */}
                                <div className="settings-card">
                                    <h3>Thông tin chung</h3>
                                    <div className="profile-edit-body">
                                        <div className="profile-edit-avatar">
                                            <div className="pharma-avatar-preview large" onClick={() => avatarInputRef.current.click()} title="Đổi ảnh đại diện">
                                                <img src={tempUser.image || 'https://cdn.iconscout.com/icon/free/png-256/free-avatar-370-456322.png'} alt="Preview" />
                                                <div className="camera-badge">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                                </div>
                                            </div>
                                            <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                                        </div>

                                        <div className="profile-edit-form">
                                            <label>
                                                <span>Tên hiển thị</span>
                                                <input type="text" value={tempUser.name} onChange={e => setTempUser(prev => ({ ...prev, name: e.target.value }))} />
                                            </label>
                                            <label>
                                                <span>Username</span>
                                                <input type="text" value={tempUser.name.toLowerCase().replace(/\s/g, '.')} disabled />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="settings-card-footer">
                                        <button className="pharma-btn-cancel" onClick={() => setTempUser({ name: username, image: userImage })}>Hủy bỏ</button>
                                        <button className="pharma-btn-save" onClick={saveSettings}>Lưu thay đổi</button>
                                    </div>
                                </div>

                                {/* BLOCK 2: Appearance */}
                                <div className="settings-card span-col">
                                    <h3>Giao diện</h3>
                                    <p className="settings-desc">Tùy chỉnh màu sắc trải nghiệm của bạn.</p>
                                    <div className="theme-options">
                                        <button className={`theme-btn light ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>Sáng</button>
                                        <button className={`theme-btn dark ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>Tối</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSettingsTab === 'notifications' && (
                            <div className="settings-grid">
                                <div className="settings-card span-col">
                                    <h3>Thông báo (Notifications)</h3>
                                    <p className="settings-desc">Nhận thông báo khi có bản cập nhật AI mới hoặc tính năng y tế được bổ sung.</p>
                                    <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: theme === 'light' ? '#333':'#ececec' }}>
                                            <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px' }} />
                                            Thông báo qua Email (Mô phỏng)
                                        </label>
                                        <div style={{ marginTop: '16px' }} />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: theme === 'light' ? '#333':'#ececec' }}>
                                            <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px' }} />
                                            Thông báo trong ứng dụng (Push Notifications)
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSettingsTab === 'security' && (
                            <div className="settings-grid">
                                <div className="settings-card span-col">
                                    <h3>Bảo mật (Security)</h3>
                                    <p className="settings-desc">Dữ liệu ghi âm và đoạn chat của bạn luôn được mã hóa trong phiên. Tuy nhiên bạn có thể tăng cường bảo vệ.</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                                        <button className="pharma-btn-cancel" style={{ maxWidth: '300px' }} onClick={() => toast.info('Tính năng đang phát triển')}>
                                            Đổi mật khẩu
                                        </button>
                                        <button className="pharma-btn-cancel" style={{ maxWidth: '300px', borderColor: '#ef4444', color: '#ef4444' }} onClick={() => toast.info('Tính năng đang phát triển')}>
                                            Bật xác thực 2 bước (2FA)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </>
            ) : (
                /* =======================
                   CHAT APPLICATION LAYOUT
                   ======================= */
                <>
            {mobileSidebarOpen && (
                <div className="mobile-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
            )}

            {/* LEFT SIDEBAR */}
            <aside className={`left-sidebar ${sidebarOpen ? '' : 'collapsed'} ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-top">
                    <div className="brand" onClick={() => !sidebarOpen && setSidebarOpen(true)} style={{ cursor: !sidebarOpen ? 'pointer' : 'default' }}>
                        <span className="brand-icon">✨</span>
                        <span className="brand-text">PharmaVoice</span>
                    </div>
                    <button className="icon-btn tooltip-btn" title="Đóng sidebar" onClick={() => setSidebarOpen(false)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                    </button>
                </div>

                <button className="new-chat-btn" onClick={startNewChat}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <span>Cuộc trò chuyện mới</span>
                </button>

                        <div className="sidebar-search">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" placeholder="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            <span className="search-shortcut">⌘K</span>
                        </div>

                        <div className="chat-history-list" onClick={() => setContextMenu(null)}>
                            {chatSessions.length === 0 ? (
                                <div className="no-history">Chưa có lịch sử</div>
                            ) : (
                                <>
                                    {['today', 'yesterday', 'last7Days', 'older'].map(groupKey => {
                                        const groupSessions = groupedChats[groupKey];
                                        if (groupSessions.length === 0) return null;

                                        const groupTitle = groupKey === 'today' ? 'HÔM NAY' : groupKey === 'yesterday' ? 'HÔM QUA' : groupKey === 'last7Days' ? '7 NGÀY QUA' : 'CŨ HƠN';

                                        return (
                                            <div key={groupKey} className="history-group">
                                                <div className="sidebar-section-label">{groupTitle}</div>
                                                {groupSessions.map((s, i) => {
                                                    const isActive = activeId === s.id;
                                                    const bgLoading = (sessionData[s.id]?.loadingCount || 0) > 0 && !isActive;
                                                    return (
                                                        <div key={s.id || i}
                                                            className={`history-item ${isActive ? 'active' : ''} ${renamingId === s.id ? 'renaming' : ''}`}
                                                            onClick={() => { 
                                                                if (renamingId !== s.id) loadSession(s); 
                                                                setMobileSidebarOpen(false); 
                                                            }}>
                                                            {renamingId === s.id ? (
                                                                <input
                                                                    className="rename-input"
                                                                    value={renameValue}
                                                                    autoFocus
                                                                    onChange={e => setRenameValue(e.target.value)}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') commitRename(s.id);
                                                                        if (e.key === 'Escape') setRenamingId(null);
                                                                    }}
                                                                    onBlur={() => commitRename(s.id)}
                                                                    onClick={e => e.stopPropagation()}
                                                                />
                                                            ) : (
                                                                <span className="history-label">{s.label}</span>
                                                            )}
                                                            {bgLoading && <span className="bg-loading-dot" title="Đang xử lý..." />}
                                                            <button
                                                                className="session-menu-btn"
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    setContextMenu(contextMenu?.id === s.id ? null : { id: s.id });
                                                                }}
                                                                title="Tùy chọn">
                                                                ···
                                                            </button>
                                                            {contextMenu?.id === s.id && (
                                                                <div className="session-dropdown" onClick={e => e.stopPropagation()}>
                                                                    <button onClick={() => startRename(s)}>
                                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                                        Đổi tên
                                                                    </button>
                                                                    <button className="danger" onClick={() => deleteSession(s.id)}>
                                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                                                        Xóa
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>

                <div className="sidebar-footer">
                    <div className="user-row" onClick={() => {
                        setTempUser({ name: username, image: userImage });
                        setIsSettingsOpen(true);
                        setMobileSidebarOpen(false);
                    }}>
                        <img src={userImage} alt="avatar" className="user-avatar-small" />
                        {sidebarOpen && (
                            <>
                                <span className="user-name">{username}</span>
                                <div className="settings-icon-wrapper" title="Cài đặt">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="3"></circle>
                                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                    </svg>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </aside>

            {/* MAIN CHAT */}
            <main className="chat-area" onClick={() => setContextMenu(null)}>
                <div className="chat-topbar">
                    <button className="mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                    <div className="model-label">
                        PharmaVoice AI <span>Gemini 3.1 Pro ▾</span>
                    </div>
                    {backgroundLoadingCount > 0 && (
                        <div className="bg-loading-bar">
                            <span className="bg-loading-dot-spin" />
                            {backgroundLoadingCount} tác vụ đang xử lý
                        </div>
                    )}
                </div>

                <div className="chat-messages">
                    {messages.length === 0 && (
                        <div className="empty-state">
                            {/* Bỏ giao diện chat rỗng theo yêu cầu */}
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`message-row ${msg.role === 'user' ? 'user-row-msg' : 'ai-row-msg'}`}>
                            {msg.role === 'user' ? (
                                <div className="msg-bubble-user">
                                    {renderAIText(msg.content)}
                                </div>
                            ) : msg.isCustomerForm ? (
                                <div className="customer-form-card">
                                    <div className="form-header">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                        <h4>Lưu hồ sơ khách hàng</h4>
                                    </div>
                                    
                                    {msg.processed ? (
                                        <div className="form-success-state">
                                            ✅ Đã lưu vào Wiki cho: **{msg.identifierUsed}**
                                        </div>
                                    ) : (
                                        <>
                                            <p className="form-desc">AI đã phân tích xong. Vui lòng xác nhận danh tính khách hàng để lưu vào Wiki.</p>
                                            <div className="form-body">
                                                <input 
                                                    type="text" 
                                                    placeholder="Tên hoặc SĐT khách hàng..." 
                                                    id={`cust-input-${i}`}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const val = e.target.value;
                                                            handlePostUploadCustomerInfo(activeId, i, val, msg.transcriptionForWiki);
                                                        }
                                                    }}
                                                />
                                                <button onClick={() => {
                                                    const val = document.getElementById(`cust-input-${i}`).value;
                                                    handlePostUploadCustomerInfo(activeId, i, val, msg.transcriptionForWiki);
                                                }}>
                                                    Lưu Wiki
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="msg-ai-content">
                                    <div className="ai-text-body">{renderAIText(msg.content)}</div>
                                </div>
                            )}
                        </div>
                    ))}

                    {isLoading && (
                        <div className="message-row ai-row-msg">
                            <div className="msg-ai-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
                                <div className="loading-dots"><span /><span /><span /></div>
                                <div className="loading-label">{loadingLabel || 'Đang suy nghĩ...'}</div>
                            </div>
                        </div>
                    )}

                    {(current.pendingQueue || []).map((pmsg, pIdx) => (
                        <div key={`pending-${pIdx}`} className="message-row user-row-msg">
                            <div className="msg-bubble-user" style={{ opacity: 0.6, fontStyle: 'italic' }}>
                                ⏳ Đang chờ: {pmsg}
                            </div>
                        </div>
                    ))}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="chat-input-wrapper">
                    {/* File preview chips */}
                    {pendingFiles.length > 0 && (
                        <div className="file-preview-chips">
                            {pendingFiles.map((file, idx) => (
                                <div key={idx} className="file-preview-chip">
                                    <div className="file-chip-icon">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round">
                                            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                                        </svg>
                                    </div>
                                    <div className="file-chip-info">
                                        <span className="file-chip-name">{file.name}</span>
                                        <span className="file-chip-type">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                                    </div>
                                    <button className="file-chip-remove"
                                        onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                                        title="Xóa">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <line x1="18" y1="6" x2="6" y2="18"/>
                                            <line x1="6" y1="6" x2="18" y2="18"/>
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="input-box">
                        <button className="attach-btn" onClick={() => fileInputRef.current?.click()}
                            title="Upload file âm thanh">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="12" y1="4" x2="12" y2="20" />
                                <line x1="4" y1="12" x2="20" y2="12" />
                            </svg>
                        </button>
                        <input type="file" ref={fileInputRef} accept="audio/*,video/webm,image/*,application/pdf,text/plain,.doc,.docx" multiple onChange={handleFileChange} />

                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={inputText}
                            onChange={handleTextareaChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Hỏi PharmaVoice AI bất cứ điều gì..."
                        />

                        <button className="send-btn" onClick={handleSendText}
                            disabled={(!inputText.trim() && pendingFiles.length === 0)} title="Gửi (Enter)">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5" />
                                <polyline points="5 12 12 5 19 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="input-footer">
                        PharmaVoice AI có thể mắc lỗi. Xác minh thông tin y tế quan trọng với chuyên gia.
                    </div>
                </div>
            </main>

                </>
            )}
        </div>
    );
};

export default AudioRecorder;
