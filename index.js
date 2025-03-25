const chalk = require('chalk');
const figlet = require('figlet');
const express = require('express');
const mongoose = require('mongoose');
const config = require('./config.json');

console.clear();
console.log('\n'.repeat(2));

const terminalWidth = process.stdout.columns || 80;
const line = chalk.bold.rgb(255, 165, 0)('─'.repeat(terminalWidth));

const spectraText = figlet.textSync('QUEENBOT', { font: 'Small', horizontalLayout: 'default', verticalLayout: 'default', width: terminalWidth, whitespaceBreak: true });

console.log(line);
console.log(chalk.blueBright(spectraText));
console.log(chalk.cyan.bold('QueenBot - A Simple WhatsApp Chat Bot'));
console.log(chalk.magenta('    Owner And Founder Priyanshi Kaur ✔️'));
console.log(line);
console.log(chalk.red.bold('\n⚠️  WARNING: Do not attempt to claim this project as your own.\n'));
console.log(line);

const connectDatabase = async () => {
    try {
        await mongoose.connect(config.database.uriMongodb, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log(chalk.green.bold('✅ Connected to MongoDB.'));
    } catch (error) {
        console.error(chalk.red.bold('❌ MongoDB Connection Error:'), error.message);
        process.exit(1);
    }
};

if (config.database.autoSyncWhenStart) {
    connectDatabase();
}

require('./bot.js');

const app = express();
const PORT = process.env.PORT || config.serverUptime.port;

app.get('/', (req, res) => {
    res.send('QueenBot is Running!');
});

app.listen(PORT, () => {
    console.log(chalk.green.bold(`Server is running on port ${PORT}`));
});