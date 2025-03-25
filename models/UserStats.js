const mongoose = require('mongoose');

const UserStatsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
    },
    messageCount: {
        type: Number,
        default: 0,
    },
    // Add more fields as needed (e.g., commands used, etc.)
});

module.exports = mongoose.model('UserStats', UserStatsSchema);