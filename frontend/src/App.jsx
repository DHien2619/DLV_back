import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Login from './Login'; // Ensure this path is correct
import Register from './Register'; // Ensure this path is correct
import './App.css'; // Add any necessary CSS
import AudioRecorder from './AudioRecorder';
const App = () => {
    const [token, setToken] = useState(null);

    return (
        <Router>
            <div className="app">
               
                <Routes>
                    <Route path="/" element={<Login setToken={setToken} />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/AudioRecorder" element={<AudioRecorder />} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;
