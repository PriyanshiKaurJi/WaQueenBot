module.exports = {
    name: 'group-leave',
    event: async ({ sock, m, sender, getString, groupName, config }) => {
        if (!config.botSettings.enableGroupGoodbye || !m.isGroup || m.action !== 'remove') return;

        const groupGoodbyeMessage = config.botSettings.groupLeaveMessage || getString('goodbye_group'); // Fallback to language file if config is not set

        const leavingUser = m.participants[0];
        const userMention = `<@${leavingUser.split('@')[0]}>`;

        let goodbyeText = groupGoodbyeMessage
            .replace('@user', userMention)
            .replace('@group', groupName);

        await sock.sendMessage(m.key.remoteJid, { text: goodbyeText, mentions: [leavingUser] });
    }
};