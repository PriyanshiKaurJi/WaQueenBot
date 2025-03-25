const moment = require('moment-timezone');
const config = require('../../config.json');
const { logInfo, logError } = require('../../utils/logger');

module.exports = {
    name: 'autoMessageEvent',
    event: async ({ sock }) => {
        if (!config.automaticMessages || !config.automaticMessages.enabled) {
            return;
        }

        const now = moment().tz(config.botSettings.timeZone);
        const currentTime = now.format('HH:mm');
        const ownerNumber = config.botSettings.ownerNumber;

        if (!ownerNumber) {
            logError("Owner number is not configured in config.json for automatic messages.");
            return;
        }

        const targetJid = `${ownerNumber}@s.whatsapp.net`;

        const sendMessage = async (timeOfDay, message) => {
            if (currentTime === config.automaticMessages[timeOfDay].time) {
                try {
                    await sock.sendText(targetJid, message);
                    logInfo(`[Auto Message Event] Sent ${timeOfDay} message to ${ownerNumber}`);
                } catch (error) {
                    logError(`[Auto Message Event] Error sending ${timeOfDay} message to ${ownerNumber}: ${error.message}`);
                }
            }
        };

        await sendMessage('goodMorning', config.automaticMessages.goodMorning.message);
        await sendMessage('goodAfternoon', config.automaticMessages.goodAfternoon.message);
        await sendMessage('goodEvening', config.automaticMessages.goodEvening.message);
        await sendMessage('goodNight', config.automaticMessages.goodNight.message);
    },
};