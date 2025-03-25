const { logInfo } = require('../../utils/logger');

module.exports = {
    name: 'groupJoinEvent',
    event: async ({ sock, m, sender }) => {
        if (m.action === 'add' && m.participants) {
            const groupJid = m.key.remoteJid;
            const groupName = await sock.getName(groupJid);
            const botNumber = await sock.decodeJid(sock.user.id);

            m.participants.forEach(async participant => {
                const userName = await sock.getName(participant);
                const participantUser = participant.split('@')[0];

                if (participant === botNumber) {
                    // Bot joined the group
                    const botName = global.botName || 'This bot';
                    const prefix = global.prefix || '.';
                    const thanksMessage = `👋 Hello everyone! I'm ${botName}, a simple WhatsApp bot. Thanks for adding me to *${groupName}*!\n\n` +
                        `My prefix is: \`${prefix}\`. Type \`${prefix}help\` to see my commands.\n\n` +
                        `I'm here to assist and make this group more interactive. Let's have fun! 😊`;
                    await sock.sendMessage(groupJid, { text: thanksMessage });
                    logInfo(`[Group Join Event] Bot joined group "${groupName}" (${groupJid})`);
                } else {
                    // User joined the group - send welcome message
                    const welcomeMessage = `🎉 Welcome to *${groupName}*, @${participantUser}! 👋\n\n` +
                        `We're glad to have you here. Introduce yourself and enjoy the group! 😊`;
                    await sock.sendMessage(groupJid, { text: welcomeMessage, mentions: [participant] });
                    logInfo(`[Group Join Event] User "${userName}" (${participant}) joined group "${groupName}" (${groupJid})`);
                }
            });
        }
    },
};