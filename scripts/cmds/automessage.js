const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'automessage',
    aliases: ['amsg', 'automsg'],
    description: 'Configure automatic messages (good morning, good night).',
    permission: 1, // Owner only command for configuration
    run: async ({ sock, m, args }) => {
        const configPath = path.resolve(__dirname, '../../config.json');
        const config = require(configPath);

        if (!config.automaticMessages) {
            config.automaticMessages = {
                goodMorning: { time: "07:00", message: "Good Morning! Have a great day!" },
                goodNight: { time: "22:00", message: "Good Night! Sweet dreams!" },
                enabled: false
            };
        }

        const action = args[0]?.toLowerCase();
        const type = args[1]?.toLowerCase();
        const value = args.slice(2).join(" ");

        if (!action) {
            let currentConfig = `Current Automatic Message Config:\n`;
            currentConfig += `Status: ${config.automaticMessages.enabled ? 'Enabled' : 'Disabled'}\n`;
            currentConfig += `Good Morning Time: ${config.automaticMessages.goodMorning.time}\n`;
            currentConfig += `Good Morning Message: ${config.automaticMessages.goodMorning.message}\n`;
            currentConfig += `Good Night Time: ${config.automaticMessages.goodNight.time}\n`;
            currentConfig += `Good Night Message: ${config.automaticMessages.goodNight.message}\n`;
            return m.reply(currentConfig);
        }

        if (action === 'enable') {
            config.automaticMessages.enabled = true;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            return m.reply('Automatic messages enabled.');
        }

        if (action === 'disable') {
            config.automaticMessages.enabled = false;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            return m.reply('Automatic messages disabled.');
        }

        if (action === 'set') {
            if (!type || !value) {
                return m.reply(`Usage: ${global.prefix}automessage set <time|morning|night> <value>\n` +
                    `  - time <HH:mm> (24hr format, e.g., 07:00, 22:30)\n` +
                    `  - morning <message>\n` +
                    `  - night <message>`);
            }

            if (type === 'time') {
                const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                if (!timeRegex.test(value)) {
                    return m.reply('Invalid time format. Use HH:mm (24hr format, e.g., 07:00)');
                }
                config.automaticMessages.goodMorning.time = value;
                config.automaticMessages.goodNight.time = value; // For simplicity, sets both to same time for now
                fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
                return m.reply(`Good morning and good night message time set to ${value}.`);
            } else if (type === 'morning') {
                config.automaticMessages.goodMorning.message = value;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
                return m.reply(`Good morning message set to: ${value}`);
            } else if (type === 'night') {
                config.automaticMessages.goodNight.message = value;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
                return m.reply(`Good night message set to: ${value}`);
            } else {
                return m.reply(`Invalid type. Use 'time', 'morning', or 'night'.`);
            }
        }

        return m.reply(`Usage: ${global.prefix}automessage <enable|disable|set|status>\n` +
            `       ${global.prefix}automessage set <time|morning|night> <value>`);
    },
};