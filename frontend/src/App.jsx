import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import './App.css';
import AudioRecorder from './AudioRecorder';
import Dashboard from './Dashboard';
const App = () => {
    const [token, setToken] = useState(null);

    return (
        <Router>
            <div className="app">
               
                <Routes>
                    <Route path="/" element={<Login setToken={setToken} />} />
                    <Route path="/login" element={<Login setToken={setToken} />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/AudioRecorder" element={<AudioRecorder />} />
                    <Route path="/dashboard" element={<Dashboard onBack={() => window.history.back()} />} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;
