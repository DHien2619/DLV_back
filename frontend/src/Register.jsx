import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Login.css'; // Reuse the new split-pane CSS

const Register = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const defaultAvatar = "https://cdn.iconscout.com/icon/free/png-256/free-avatar-370-456322.png";
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const response = await axios.post(`${API_URL}/register`, { name, email, password, image: defaultAvatar });
            
            localStorage.setItem('user', JSON.stringify({
                id: response.data._id,
                name,
                email,
                image: defaultAvatar
            }));

            alert("Registration successful! You can now log in.");
            navigate('/login');
        } catch (error) {
            console.error("Error registering user:", error.response ? error.response.data : error.message);
            alert("Registration failed. Please try again.");
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
                        <h1>Join our<br/>network!</h1>
                        <p>Create your account &amp; gain access<br/>to advanced clinical AI tools.</p>
                        <button className="view-more-btn">Learn more</button>
                    </div>
                </div>
                
                <div className="auth-right">
                    <form className="auth-form" onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label>Full Name</label>
                            <input 
                                type="text" 
                                placeholder="Dr. John Doe" 
                                value={name} 
                                onChange={(e) => setName(e.target.value)} 
                                required 
                            />
                        </div>
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
                        <div className="input-group" style={{ marginBottom: '10px' }}>
                            <label>Password</label>
                            <input 
                                type="password" 
                                placeholder="••••••••" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                            />
                        </div>
                        
                        <button type="submit" className="login-btn" style={{ marginTop: '10px' }}>Sign up</button>
                    </form>
                    
                    <div className="auth-switch" style={{ marginTop: '20px' }}>
                        <p>Already a member?</p>
                        <button className="signup-btn" onClick={() => navigate('/login')}>Login here</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;
