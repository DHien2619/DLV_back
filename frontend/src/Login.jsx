import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';
import { useNavigate } from 'react-router-dom';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const response = await axios.post(`${API_URL}/login`, { email, password });
            const token = response.data.token;
            const user = response.data.user;

            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            
            navigate('/AudioRecorder');

        } catch (error) {
            console.error("Error logging in:", error.response ? error.response.data : error.message);
            alert("Login failed. Please check your credentials.");
        }
    };

    return (
        <div className="auth-wrapper">
            <div className="auth-container">
                <div className="auth-left">
                    <div className="auth-logo">
                        <span className="logo-icon"></span>
                        PharmaVoice AI
                    </div>
                    <div className="auth-left-text">
                        <h1>Hello,<br/>welcome!</h1>
                        <p>Clinical Audio Processing Platform.<br/>Empowering healthcare transcription.</p>
                        <button className="view-more-btn">View more</button>
                    </div>
                </div>
                
                <div className="auth-right">
                    <form className="auth-form" onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label>Email address</label>
                            <input 
                                type="email" 
                                placeholder="name@mail.com" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                required 
                            />
                        </div>
                        <div className="input-group">
                            <label>Password</label>
                            <input 
                                type="password" 
                                placeholder="••••••••" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                            />
                        </div>
                        
                        <div className="auth-options">
                            <label className="remember-me">
                                <input type="checkbox" /> Remember me
                            </label>
                            <a href="#" className="forgot-password">Forgot password?</a>
                        </div>
                        
                        <button type="submit" className="login-btn">Login</button>
                    </form>
                    
                    <div className="auth-switch">
                        <p>Not a member yet?</p>
                        <button className="signup-btn" onClick={() => navigate('/register')}>Sign up</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
