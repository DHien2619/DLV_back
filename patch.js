const fs = require('fs');
let code = fs.readFileSync('frontend/src/AudioRecorder.jsx', 'utf8');

code = code.replace(
    "const emptySession = () => ({ messages: [], loadingCount: 0, loadingLabel: 'Đang suy nghĩ...' });",
    "const emptySession = () => ({ messages: [], loadingCount: 0, loadingLabel: 'Đang suy nghĩ...', pendingQueue: [] });"
);

code = code.replace(
    "    const [sessionData, setSessionData] = useState({ [NEW_CHAT_ID]: emptySession() });",
    "    const [sessionData, setSessionData] = useState({ [NEW_CHAT_ID]: emptySession() });\n    const sessionDataRef = useRef(sessionData);\n    useEffect(() => { sessionDataRef.current = sessionData; }, [sessionData]);"
);

code = code.replace(
    "const handleSendTextOnly = async (text) => {\n        let sid = activeId === NEW_CHAT_ID ? 'chat_' + Date.now() : activeId;",
    "const handleSendTextOnly = async (text, forcedSid = null) => {\n        let sid = forcedSid || (activeId === NEW_CHAT_ID ? 'chat_' + Date.now() : activeId);"
);

code = code.replace(
    "if (activeId === NEW_CHAT_ID) {\n            setActiveId(sid);",
    "if (activeId === NEW_CHAT_ID && !forcedSid) {\n            setActiveId(sid);"
);

code = code.replace(
    "        const history = (sessionData[sid]?.messages || messages)\n            .filter(m => !m.isFile).map(m => ({ role: m.role, content: m.content }));\n        const userMsg = { role: 'user', content: text };\n        setSessionData(prev => {",
    `        const liveCurrent = sessionDataRef.current[sid] || emptySession();
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
        setSessionData(prev => {`
);

let parts = code.split('        } catch (err) {\n            const detail = err.response?.data?.error ? ` (${err.response.data.error})` : \'\';\n            setSessionData(prev => {\n                const temp = prev[sid] || emptySession();\n                return { ...prev, [sid]: { ...temp, messages: [...temp.messages, { role: \'assistant\', content: `❌ Lỗi kết nối tới AI.${detail}` }], loadingCount: Math.max(0, (temp.loadingCount || 0) - 1) } };\n            });\n        }\n    };\n\n    // ── Send text + multiple staged files together');

code = parts[0] + '        } catch (err) {\n            const detail = err.response?.data?.error ? ` (${err.response.data.error})` : \'\';\n            setSessionData(prev => {\n                const temp = prev[sid] || emptySession();\n                return { ...prev, [sid]: { ...temp, messages: [...temp.messages, { role: \'assistant\', content: `❌ Lỗi kết nối tới AI.${detail}` }], loadingCount: Math.max(0, (temp.loadingCount || 0) - 1) } };\n            });\n        } finally {\n            checkAndProcessQueue(sid);\n        }\n    };\n\n    // ── Send text + multiple staged files together' + parts[1];


let p2 = code.split("            });\n        }\n    };\n\n    // ── File change: STAGE files (multi), don't upload yet");
code = p2[0] + `            });
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

    // ── File change: STAGE files (multi), don't upload yet` + p2[1];

let p3 = code.split("                        <div className=\"chat-input-area\">");
code = p3[0] + `                        {(current.pendingQueue || []).map((pmsg, pIdx) => (
                            <div key={\`pending-\${pIdx}\`} className="message-wrapper">
                                <div className="chat-message pending-message" style={{opacity: 0.6}}>
                                    <div className="message-avatar user-avatar">
                                        <img src={userImage} alt="" onError={(e) => e.target.src = 'https://cdn.iconscout.com/icon/free/png-256/free-avatar-370-456322.png'} />
                                    </div>
                                    <div className="message-bubble pending-bubble" style={{background: 'var(--card-bg)'}}>
                                        <span className="pending-icon">⏳</span> <i>Pending message...</i>
                                        <hr style={{opacity: 0.2, margin: '8px 0'}}/>
                                        <span style={{opacity: 0.7}}>{pmsg}</span>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="chat-input-area">` + p3[1];


fs.writeFileSync('frontend/src/AudioRecorder.jsx', code);
console.log("Done");
