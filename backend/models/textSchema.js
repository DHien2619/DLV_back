const mongoose = require('mongoose');

const transcriptionSchema = new mongoose.Schema({
    audioURL: {
        type: String,
        required: true
    },
    transcription: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'pending'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model
        required: true
    }
});

module.exports = mongoose.model('Transcription', transcriptionSchema);
