const moment = require('moment-timezone');
const config = require('../../config.json');

module.exports = {
    name: 'autoMessageEvent',
    event: async ({ sock }) => {
        if (!config.automaticMessages || !config.automaticMessages.enabled) {
            return;
        }

        const now = moment().tz(config.botSettings.timeZone);
        const currentTime = now.format('HH:mm');
        const ownerNumber = config.botSettings.ownerNumber; // Assuming ownerNumber is with country code but without '+'

        if (!ownerNumber) {
            console.warn("Owner number is not configured in config.json for automatic messages.");
            return;
        }

        const targetJid = `${ownerNumber}@s.whatsapp.net`; // Assuming sending to owner for now

        if (currentTime === config.automaticMessages.goodMorning.time) {
            try {
                await sock.sendText(targetJid, config.automaticMessages.goodMorning.message);
                console.log(`[Auto Message Event] Sent Good Morning message to ${ownerNumber}`);
            } catch (error) {
                console.error("Error sending good morning message:", error);
            }
        }

        if (currentTime === config.automaticMessages.goodNight.time) {
            try {
                await sock.sendText(targetJid, config.automaticMessages.goodNight.message);
                console.log(`[Auto Message Event] Sent Good Night message to ${ownerNumber}`);
            } catch (error) {
                console.error("Error sending good night message:", error);
            }
        }
    },
};