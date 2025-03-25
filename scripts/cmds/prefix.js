module.exports = {
    name: 'prefix',
    description: 'Shows the current bot prefix',
    permission: 0,
    cooldowns: 5,
    dmUser: true,
    author: 'Priyanshi Kaur',
    run: async ({ sock, m }) => {
        await sock.sendMessage(m.key.remoteJid, { text: `My prefix is: \`${global.prefix}\`` }, { quoted: m });
    },
};