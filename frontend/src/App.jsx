import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import './App.css';
import AudioRecorder from './AudioRecorder';
import Dashboard from './Dashboard';
const App = () => {
    const [token, setToken] = useState(null);

    React.useEffect(() => {
        // Bypass login
        localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Test Admin', role: 'admin' }));
        localStorage.setItem('token', 'fake-token');
    }, []);

    return (
        <Router>
            <div className="app">
               
                <Routes>
                    <Route path="/" element={<Dashboard onBack={() => window.location.href='/AudioRecorder'} />} />
                    <Route path="/login" element={<Dashboard onBack={() => window.location.href='/AudioRecorder'} />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/AudioRecorder" element={<AudioRecorder />} />
                    <Route path="/dashboard" element={<Dashboard onBack={() => window.history.back()} />} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;
