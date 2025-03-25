const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('../config.json');

const timeZone = config.botSettings.timeZone || 'UTC';

const logInfo = (message) => {
    console.log(chalk.blue(`[${moment().tz(timeZone).format('YYYY-MM-DD HH:mm:ss')}] [INFO] ${message}`));
};

const logSuccess = (message) => {
    console.log(chalk.green(`[${moment().tz(timeZone).format('YYYY-MM-DD HH:mm:ss')}] [SUCCESS] ${message}`));
};

const logError = (message) => {
    console.log(chalk.red(`[${moment().tz(timeZone).format('YYYY-MM-DD HH:mm:ss')}] [ERROR] ${message}`));
};

const logMessageDetails = ({ ownerId, sender, groupName, message, reactions, timezone }) => {
    const formattedTime = moment().tz(timezone || 'UTC').format('YYYY-MM-DD HH:mm:ss');
    let logMessage = chalk.yellow(`[${formattedTime}]`) + ` ${chalk.cyanBright(`From: ${sender.split('@')[0]}`)} `;
    if (groupName) {
        logMessage += chalk.magentaBright(`in ${groupName} `);
    }
    logMessage += `"${chalk.white(message)}"`;
    if (reactions) {
        logMessage += ` ${chalk.gray(`(Reacted with ${reactions.emoji} by ${reactions.user?.split('@')[0]})`)}`;
    }
    console.log(logMessage);
};


module.exports = { logInfo, logSuccess, logError, logMessageDetails };