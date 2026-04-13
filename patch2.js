const fs = require('fs');
let code = fs.readFileSync('frontend/src/AudioRecorder.jsx', 'utf8');

let p = code.split('    const handleSendText = async () => {\n        const text = inputText.trim();\n        if (!text && pendingFiles.length === 0) return;\n\n        if (pendingFiles.length > 0) {\n            await handleSendWithFiles(text);\n        } else {\n            await handleSendTextOnly(text);\n        }\n    };');

code = p[0] + `    const handleSendText = async () => {
        const text = inputText.trim();
        if (!text && pendingFiles.length === 0) return;

        let sid = activeId === NEW_CHAT_ID ? 'chat_' + Date.now() : activeId;
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
    };` + p[1];

let p2 = code.split('    const handleSendWithFiles = async (userPrompt) => {\n        const files = pendingFiles;\n        setPendingFiles([]);\n\n        let sid = activeId === NEW_CHAT_ID ? \'chat_\' + Date.now() : activeId;\n        if (activeId === NEW_CHAT_ID) {\n            setActiveId(sid);\n            setSessionData(prev => ({ ...prev, [sid]: { ...(prev[NEW_CHAT_ID] || emptySession()) }, [NEW_CHAT_ID]: emptySession() }));\n        }');

code = p2[0] + `    const handleSendWithFiles = async (userPrompt, forcedSid = null) => {
        const files = pendingFiles;
        setPendingFiles([]);

        let sid = forcedSid || (activeId === NEW_CHAT_ID ? 'chat_' + Date.now() : activeId);
        if (activeId === NEW_CHAT_ID && !forcedSid) {
            setActiveId(sid);
            setSessionData(prev => ({ ...prev, [sid]: { ...(prev[NEW_CHAT_ID] || emptySession()) }, [NEW_CHAT_ID]: emptySession() }));
        }` + p2[1];

fs.writeFileSync('frontend/src/AudioRecorder.jsx', code);
console.log('Done 2');
