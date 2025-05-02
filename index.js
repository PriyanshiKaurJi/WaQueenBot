const chalk = require('chalk');
const figlet = require('figlet');
const express = require('express');
const mongoose = require('mongoose');
const config = require('./config.json');
const { logSuccess, logError, logInfo } = require('./utils/logger');
const { startBot } = require('./bot');
const path = require('path');

console.clear();
console.log('\n'.repeat(2));

// Terminal art display
const terminalWidth = process.stdout.columns || 80;
const line = chalk.bold.rgb(255, 165, 0)('─'.repeat(terminalWidth));

const botArt = figlet.textSync(config.botSettings.botName, { 
    font: 'Small',
    horizontalLayout: 'default',
    width: terminalWidth,
    whitespaceBreak: true
});

console.log(line);
console.log(chalk.hex('#FF69B4')(botArt));
console.log(chalk.cyan.bold(`${config.botSettings.botName} - ${config.botSettings.version || 'v2.0'}`));
console.log(chalk.magenta(`    Owner: ${config.botSettings.ownerName}`));
console.log(line);
console.log(chalk.red.bold('\n⚠️  WARNING: Do not claim this project as your own.\n'));
console.log(line);

// Database connection with retries
const connectDatabase = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            await mongoose.connect(config.database.uriMongodb, { 
                useNewUrlParser: true, 
                useUnifiedTopology: true,
                retryWrites: true,
                w: 'majority'
            });
            logSuccess('✅ MongoDB Connected');
            return true;
        } catch (error) {
            logError(`❌ MongoDB Connection Attempt ${i + 1}/${retries}: ${error.message}`);
            if (i < retries - 1) await new Promise(res => setTimeout(res, 5000));
        }
    }
    return false;
};

// Main initialization
const initialize = async () => {
    if (config.database.autoSyncWhenStart) {
        const dbConnected = await connectDatabase();
        if (!dbConnected) process.exit(1);
    }

    try {
        await startBot();
        logInfo('🔄 Bot initialization started');

        // Start express server
        const app = express();
        app.use(express.json());
        
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'status.html'));
        });

        app.get('/stats', async (req, res) => {
            try {
                const stats = await mongoose.connection.db.command({ dbStats: 1 });
                res.json({
                    status: 'online',
                    botName: config.botSettings.botName,
                    uptime: process.uptime(),
                    database: stats
                });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        app.listen(config.serverUptime.port, () => {
            logSuccess(`🌐 Server running on port ${config.serverUptime.port}`);
        });

    } catch (error) {
        logError(`❌ Failed to start bot: ${error.message}`);
        process.exit(1);
    }
};

// Handle process events
process.on('unhandledRejection', (err) => {
    logError(`Unhandled Rejection: ${err.stack || err}`);
});

process.on('uncaughtException', (err) => {
    logError(`Uncaught Exception: ${err.stack || err}`);
    process.exit(1);
});

// Start the application
initialize();