import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';
import { Link, useNavigate } from 'react-router-dom';

const Register = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();
    const handleSubmit = async (e) => {
        e.preventDefault();
    
        console.log("Submitting registration with:", { name, email, password });
    
        try {
            // Clear local storage before registration
            localStorage.clear();
    
            // Define a default avatar for the pharmaceutical/professional theme
            const defaultAvatar = "https://cdn.iconscout.com/icon/free/png-256/free-avatar-370-456322.png";

            // Send registration request
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const response = await axios.post(`${API_URL}/register`, { name, email, password, image: defaultAvatar });
            console.log(response)
            // Store the user object in local storage
            localStorage.setItem('user', JSON.stringify({
                name,
                email,
                image: response.data.user.image ,// Save the image URL received from the server
                id: response.data.user.id,
                role: response.data.user.role
            }));
      localStorage.setItem('token', JSON.stringify(
      response.data.token

      ));
            alert("User registered successfully!");
    
            // Redirect to the AudioRecorder route after successful registration
            navigate('/AudioRecorder');
    
        } catch (error) {
            console.error("Error registering user:", error.response ? error.response.data : error.message);
            alert("Registration failed. Please try again.");
        }
    };
    

    return (
        <div className="auth-wrapper">
            <div className="auth-container">
                <div className="auth-header">
                    <h2>PharmaVoice AI</h2>
                    <p>Clinical Audio Processing Platform</p>
                </div>
                <form className="auth-form" onSubmit={handleSubmit}>
                <input 
                    type="text" 
                    placeholder="Name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    required 
                />
                <input 
                    type="email" 
                    placeholder="Email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                />
                <input 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                />
                <button type="submit" className="auth-button">Create Professional Account</button>
            </form>
            <div className="auth-footer">
                <p>Already have an account? <Link to="/">Login here</Link></p>
            </div>
            </div>
        </div>
    );
};

export default Register;
