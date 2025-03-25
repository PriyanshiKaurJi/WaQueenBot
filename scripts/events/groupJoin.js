const { logInfo, logError } = require('../../utils/logger');

module.exports = {
    name: 'groupJoinEvent',
    event: async ({ sock, m, sender, getString, groupName, config }) => {
        if (!config.botSettings.enableGroupWelcome || !m.isGroup || m.action !== 'add' || !m.participants) return;

        const groupJid = m.key.remoteJid;
        const botNumber = await sock.decodeJid(sock.user.id);
        const botName = global.botName || 'This bot';
        const prefix = global.prefix || '.';

        m.participants.forEach(async participant => {
            if (participant === botNumber) {
                const thanksMessage = getString('welcome_bot_group', { botName: botName, groupName: groupName, prefix: prefix }) || `👋 Hello everyone! I'm ${botName}, a simple WhatsApp bot. Thanks for adding me to *${groupName}*!\n\nMy prefix is: \`${prefix}\`. Type \`${prefix}help\` to see my commands.\n\nI'm here to assist and make this group more interactive. Let's have fun! 😊`;
                try {
                    await sock.sendMessage(groupJid, { text: thanksMessage });
                    logInfo(`[Group Join Event] Bot joined group "${groupName}" (${groupJid})`);
                } catch (error) {
                    logError(`[Group Join Event] Error sending bot join message to group "${groupName}" (${groupJid}): ${error.message}`);
                }

            } else {
                try {
                    const userName = await sock.getName(participant);
                    const participantUser = participant.split('@')[0];
                    const welcomeMessage = getString('welcome_user_group', { userName: userName, groupName: groupName }) || `🎉 Welcome to *${groupName}*, @${participantUser}! 👋\n\nWe're glad to have you here. Introduce yourself and enjoy the group! 😊`;

                    try {
                        await sock.sendMessage(groupJid, { text: welcomeMessage, mentions: [participant] });
                        logInfo(`[Group Join Event] User "${userName}" (${participant}) joined group "${groupName}" (${groupJid})`);
                    } catch (error) {
                        logError(`[Group Join Event] Error sending welcome message to user "${userName}" (${participant}) in group "${groupName}" (${groupJid}): ${error.message}`);
                    }
                } catch (nameError) {
                    logError(`[Group Join Event] Error fetching username for participant ${participant}: ${nameError.message}`);
                    const genericWelcomeMessage = getString('welcome_generic_group', { groupName: groupName }) || `🎉 Welcome to *${groupName}*! 👋\n\nWe're glad to have you here. Introduce yourself and enjoy the group! 😊`;
                    try {
                        await sock.sendMessage(groupJid, { text: genericWelcomeMessage });
                    } catch (sendError) {
                        logError(`[Group Join Event] Error sending generic welcome message to group "${groupName}" (${groupJid}): ${sendError.message}`);
                    }
                }
            }
        });
    },
};