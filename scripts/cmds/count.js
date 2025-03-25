module.exports = {
    name: 'count',
    description: 'Shows your message count',
    permission: 0,
    cooldowns: 5,
    dmUser: true,
    author: 'Priyanshi Kaur',
    run: async ({ sock, m, sender, UserStats }) => {
        try {
            const userStats = await UserStats.findOne({ userId: sender });
            const messageCount = userStats ? userStats.messageCount : 0;

            const message = `📊 *Your Message Stats*

👤 User: ${sender.split('@')[0]}
✉️ Total Messages Sent: ${messageCount}`;

            await sock.sendMessage(m.key.remoteJid, { text: message }, { quoted: m });
        } catch (error) {
            console.error('Error fetching user stats:', error.message);
            await sock.sendMessage(m.key.remoteJid, { text: 'Error fetching your message count.' }, { quoted: m });
        }
    },
};