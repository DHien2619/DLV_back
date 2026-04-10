// models/userSchema.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed password
    image: { type: String }, // URL of the uploaded image
    role: { type: String, enum: ['user', 'admin'], default: 'user' }, // User role
});

const User = mongoose.model('User', userSchema);

module.exports = User;
