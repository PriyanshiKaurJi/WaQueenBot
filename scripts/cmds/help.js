const config = require('../../config.json');

module.exports = {
    name: 'help',
    description: 'Displays available commands or information about a specific command.',
    permission: 0,
    cooldowns: 1,
    dmUser: true,
    author: config.botSettings.ownerName || 'Bot Owner',
    run: async ({ sock, m, args }) => {
        const prefix = global.prefix;
        const botName = global.botName;
        const commands = global.commands;
        const githubRepo = config.botSettings.githubRepo || 'No Repo Link Provided';
        const ownerName = config.botSettings.ownerName || 'Bot Owner';

        if (!args[0]) {
            // Show list of all commands
            let helpText = `👑 *${botName} - Help Menu* 👑\n\n`;
            helpText += `Prefix: \`${prefix}\`\n\n`;
            helpText += `Available Commands:\n`;
            commands.forEach((cmd) => {
                helpText += `\`${prefix}${cmd.name}\` - ${cmd.description}\n`;
            });
            helpText += `\nType \`${prefix}help <command>\` for more info on a specific command.\n`;
            helpText += `\n🤖 Bot created by: ${ownerName}`;
            if (githubRepo && githubRepo !== 'No Repo Link Provided') {
                helpText += `\n🔗 GitHub: ${githubRepo}`;
            }

            await sock.sendMessage(m.key.remoteJid, { text: helpText }, { quoted: m });
        } else {
            // Show info for a specific command
            const cmdName = args[0].toLowerCase();
            const command = commands.get(cmdName);

            if (!command) {
                await sock.sendMessage(m.key.remoteJid, { text: `Command \`${cmdName}\` not found. Type \`${prefix}help\` to see all commands.` }, { quoted: m });
                return;
            }

            let cmdInfoText = `ℹ️ *Command: ${prefix}${command.name}* ℹ️\n\n`;
            cmdInfoText += `\`Name:\` ${command.name}\n`;
            cmdInfoText += `\`Description:\` ${command.description}\n`;
            cmdInfoText += `\`Author:\` ${command.author}\n`;
            cmdInfoText += `\`Permission Level:\` ${command.permission} (0=Everyone, 3=Admin, 4=Owner)\n`;
            cmdInfoText += `\`Cooldown:\` ${command.cooldowns} seconds\n`;

            await sock.sendMessage(m.key.remoteJid, { text: cmdInfoText }, { quoted: m });
        }
    },
};