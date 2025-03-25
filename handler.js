const fs = require("fs");
const path = require("path");
const config = require("./config.json");
const mongoose = require("mongoose");
const { getPermissionLevel } = require("./utils/permission");
const { logInfo, logSuccess, logError, logMessageDetails } = require("./utils/logger");
const UserStats = require("./models/UserStats");

global.owner = config.botSettings.ownerNumber ? [config.botSettings.ownerNumber] : [];
global.prefix = config.botSettings.prefix || "!";
global.botName = config.botSettings.botName || "Bot";
global.commands = new Map();
global.events = new Map();
global.cc = {};
const cooldowns = new Map();

const commandsFolder = config.commandDirectory || path.resolve(__dirname, "./scripts/cmds"); // Use config for command dir
const eventsFolder = config.eventDirectory || path.resolve(__dirname, "./scripts/events");   // Use config for event dir

const loadCommands = () => {
    global.commands.clear(); // Clear existing commands before reloading
    const commandFiles = fs.readdirSync(commandsFolder).filter(file => file.endsWith(".js"));
    commandFiles.forEach(file => {
        try {
            const command = require(path.join(commandsFolder, file));
            if (command.name && typeof command.run === "function") {
                global.commands.set(command.name, command);
                logSuccess(`✅ Loaded command: ${command.name}`);
            } else {
                logError(`❌ Invalid command format in ${file}. Skipping.`);
            }
        } catch (error) {
            logError(`❌ Error loading command ${file}: ${error.message}`);
        }
    });
    logInfo(`Loaded ${global.commands.size} commands.`);
};

const loadEvents = () => {
    global.events.clear(); // Clear existing events before reloading
    const eventFiles = fs.readdirSync(eventsFolder).filter(file => file.endsWith(".js"));
    eventFiles.forEach(file => {
        try {
            const event = require(path.join(eventsFolder, file));
            if (event.name && typeof event.event === "function") {
                global.events.set(event.name, event);
                logSuccess(`✅ Loaded event: ${event.name}`);
            } else {
                logError(`❌ Invalid event format in ${file}. Skipping.`);
            }
        } catch (error) {
            logError(`❌ Error loading event ${file}: ${error.message}`);
        }
    });
    logInfo(`Loaded ${global.events.size} events.`);
};

const connectDatabase = async () => {
    try {
        await mongoose.connect(config.database.uriMongodb, { useNewUrlParser: true, useUnifiedTopology: true });
        logSuccess('✅ MongoDB Connected.');
    } catch (error) {
        logError('❌ MongoDB Connection Error:', error.message);
    }
};

if (config.database.autoSyncWhenStart) {
    connectDatabase();
}

module.exports = async (sock, m) => {
    try {
        const body = (m.mtype === "conversation" && m.message.conversation) || (m.mtype === "imageMessage" && m.message.imageMessage.caption) || (m.mtype === "documentMessage" && m.message.documentMessage.caption) || (m.mtype === "videoMessage" && m.message.videoMessage.caption) || (m.mtype === "extendedTextMessage" && m.message.extendedTextMessage.text) || (m.mtype === "buttonsResponseMessage" && m.message.buttonsResponseMessage.selectedButtonId) || (m.mtype === "templateButtonReplyMessage" && m.message.templateButtonReplyMessage.selectedId) || "";

        const sender = m.key.fromMe ? sock.user.id.split(":")[0] + "@s.whatsapp.net" : m.key.participant || m.key.remoteJid;
        const botNumber = await sock.decodeJid(sock.user.id);
        const isGroup = m.key.remoteJid.endsWith("@g.us");
        const isCmd = body.startsWith(global.prefix);
        const command = isCmd ? body.slice(global.prefix.length).trim().split(" ").shift().toLowerCase() : "";
        const args = body.trim().split(/\s+/).slice(1);

        let groupMetadata = null;
        let groupName = "";
        if (isGroup) {
            try {
                groupMetadata = await sock.groupMetadata(m.key.remoteJid);
                groupName = groupMetadata.subject || "Unknown Group";
            } catch (err) {
                logError(`⚠️ Failed to fetch group metadata: ${err.message}`, err); // Include error object in log
            }
        }

        logMessageDetails({
            ownerId: global.owner,
            sender: sender,
            groupName: groupName,
            message: body,
            reactions: m.message.reaction ? { user: m.message.reaction.userJid, emoji: m.message.reaction.emoji } : null,
            timezone: config.botSettings.timeZone,
        });

        if (body.trim().toLowerCase() === "prefix") {
            const prefixCmd = global.commands.get("prefix");
            if (prefixCmd) {
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.info, m.key);
                return await prefixCmd.run({ sock, m });
            }
        }

        if (isCmd && global.commands.has(command)) {
            const cmd = global.commands.get(command);
            const permissionLevel = getPermissionLevel(sender.replace(/[^0-9]/g, ""), groupMetadata);

            if (cmd.permission > permissionLevel) {
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.error, m.key);
                return await sock.sendMessage(
                    m.key.remoteJid,
                    { text: `❌ You don't have permission to use "${cmd.name}".` },
                    { quoted: m }
                );
            }

            const now = Date.now();
            if (!cooldowns.has(command)) cooldowns.set(command, new Map());
            const timestamps = cooldowns.get(command);
            const cooldownAmount = (cmd.cooldowns || 5) * 1000;

            if (timestamps.has(sender)) {
                const expirationTime = timestamps.get(sender) + cooldownAmount;
                if (now < expirationTime) {
                    const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                    await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.wait, m.key);
                    return await sock.sendMessage(
                        m.key.remoteJid,
                        { text: `⏳ You're using "${command}" too fast. Wait ${timeLeft}s.` },
                        { quoted: m }
                    );
                }
            }

            timestamps.set(sender, now);
            setTimeout(() => timestamps.delete(sender), cooldownAmount);

            logSuccess(`✅ ${sender} executed: ${command}`);
            try {
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.success, m.key);
                await cmd.run({ sock, m, args, sender, botNumber, UserStats });
            } catch (commandError) {
                logError(`❌ Command "${command}" execution failed: ${commandError.message}`, commandError); // Log command execution errors
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.error, m.key);
                await sock.sendMessage(m.key.remoteJid, { text: `❌ Command "${command}" failed to execute. Please check the logs.` }, { quoted: m });
            }


            try {
                await UserStats.updateOne(
                    { userId: sender },
                    { $inc: { messageCount: 1 } },
                    { upsert: true }
                );
            } catch (dbError) {
                logError("❌ Error updating user stats in MongoDB:", dbError.message);
            }

        } else if (isCmd && command === 'cmd') {
            if (!global.owner.includes(sender.split('@')[0])) {
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.error, m.key);
                return await sock.sendMessage(m.key.remoteJid, { text: '❌ Owner command!' }, { quoted: m });
            }
            await handleCmdCommand(sock, m, args);


        }
        else if (isCmd) {
            await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.notFound, m.key);
            await sock.sendMessage(
                m.key.remoteJid,
                { text: `❌ Command "${command}" not found.` },
                { quoted: m }
            );
        } else {
            try {
                await UserStats.updateOne(
                    { userId: sender },
                    { $inc: { messageCount: 1 } },
                    { upsert: true }
                );
            } catch (dbError) {
                logError("❌ Error updating user stats in MongoDB:", dbError.message);
            }
        }


        global.events.forEach(event => {
            try {
                event.event({ sock, m, sender });
            } catch (eventError) {
                logError(`❌ Event "${event.name}" execution failed: ${eventError.message}`, eventError); // Log event execution errors
            }
        });

    } catch (err) {
        logError(`❌ Error in message handler: ${err.message}`, err); // Catch general errors in handler
    }


};

async function handleCmdCommand(sock, m, args) {
    if (args.length < 2) {
        return await sock.sendMessage(m.key.remoteJid, { text: `❌ Usage: ${global.prefix}cmd install <filename.js> <code> | ${global.prefix}cmd delete <cmdName> | ${global.prefix}cmd show <cmdName>` }, { quoted: m });
    }

    const action = args[0].toLowerCase();
    const cmdName = args[1].toLowerCase();
    const cmdFile = path.join(commandsFolder, `${cmdName}.js`);

    switch (action) {
        case 'install':
            const cmdCode = args.slice(2).join(' ');
            if (!cmdCode) {
                return await sock.sendMessage(m.key.remoteJid, { text: '❌ Please provide command code to install.' }, { quoted: m });
            }
            if (!cmdName.endsWith('.js')) {
                return await sock.sendMessage(m.key.remoteJid, { text: '❌ Filename must end with ".js".' }, { quoted: m });
            }
            if (global.commands.has(cmdName.slice(0, -3))) {
                return await sock.sendMessage(m.key.remoteJid, { text: `❌ Command "${cmdName.slice(0, -3)}" already exists.` }, { quoted: m });
            }

            try {
                fs.writeFileSync(cmdFile, cmdCode);
                delete require.cache[require.resolve(cmdFile)];
                const command = require(cmdFile);
                if (command.name && typeof command.run === "function") {
                    global.commands.set(command.name, command);
                    loadCommands(); // Reload commands after install
                    await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.success, m.key);
                    await sock.sendMessage(m.key.remoteJid, { text: `✅ Command "${command.name}" installed and loaded.` }, { quoted: m });
                    logSuccess(`✅ Command "${command.name}" installed.`);
                } else {
                    fs.unlinkSync(cmdFile);
                    await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.error, m.key);
                    await sock.sendMessage(m.key.remoteJid, { text: `❌ Invalid command format in "${cmdName}". Installation failed.` }, { quoted: m });
                    logError(`❌ Invalid command format in "${cmdName}". Installation failed.`);
                }

            } catch (err) {
                fs.unlinkSync(cmdFile);
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.error, m.key);
                await sock.sendMessage(m.key.remoteJid, { text: `❌ Error installing command "${cmdName}": ${err.message}` }, { quoted: m });
                logError(`❌ Error installing command "${cmdName}": ${err.message}`);
            }
            break;

        case 'delete':
            if (!global.commands.has(cmdName)) {
                return await sock.sendMessage(m.key.remoteJid, { text: `❌ Command "${cmdName}" not found.` }, { quoted: m });
            }
            try {
                fs.unlinkSync(cmdFile);
                global.commands.delete(cmdName);
                loadCommands(); // Reload commands after delete
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.success, m.key);
                await sock.sendMessage(m.key.remoteJid, { text: `✅ Command "${cmdName}" deleted and unloaded.` }, { quoted: m });
                logSuccess(`✅ Command "${cmdName}" deleted.`);
            } catch (err) {
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.error, m.key);
                await sock.sendMessage(m.key.remoteJid, { text: `❌ Error deleting command "${cmdName}": ${err.message}` }, { quoted: m });
                logError(`❌ Error deleting command "${cmdName}": ${err.message}`);
            }
            break;

        case 'show':
            if (!global.commands.has(cmdName)) {
                return await sock.sendMessage(m.key.remoteJid, { text: `❌ Command "${cmdName}" not found.` }, { quoted: m });
            }
            try {
                const cmdCode = fs.readFileSync(cmdFile, 'utf8');
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.info, m.key);
                await sock.sendMessage(m.key.remoteJid, { text: `\`\`\`${cmdCode}\`\`\`` }, { quoted: m });
            } catch (err) {
                await sock.react(m.key.remoteJid, config.botSettings.defaultReactions.error, m.key);
                await sock.sendMessage(m.key.remoteJid, { text: `❌ Error showing command "${cmdName}": ${err.message}` }, { quoted: m });
                logError(`❌ Error showing command "${cmdName}": ${err.message}`);
            }
            break;

        default:
            await sock.sendMessage(m.key.remoteJid, { text: `❌ Invalid action. Use install, delete, or show.` }, { quoted: m });
    }
}


fs.watchFile(__filename, () => {
    fs.unwatchFile(__filename);
    logInfo(`🔄 Updated ${__filename}`);
    delete require.cache[__filename];
    require(__filename);
});

loadCommands();
loadEvents();