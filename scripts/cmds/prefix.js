module.exports = {
    name: 'prefix',
    description: 'Shows the bot prefix.',
    cooldown: 5,
    permission: 0,
    run: async ({ sock, m, getString }) => {
        const prefix = global.prefix;
        const message = getString('prefix_info', { prefix: prefix });
        await sock.sendMessage(m.key.remoteJid, { text: message }, { quoted: m });
    }
};