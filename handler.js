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

const commandsFolder = path.resolve(__dirname, "./scripts/cmds");
const eventsFolder = path.resolve(__dirname, "./scripts/events");

const loadCommands = () => {
    const commandFiles = fs.readdirSync(commandsFolder).filter(file => file.endsWith(".js"));
    commandFiles.forEach(file => {
        const command = require(path.join(commandsFolder, file));
        if (command.name && typeof command.run === "function") {
            global.commands.set(command.name, command);
            logSuccess(`✅ Loaded command: ${command.name}`);
        }
    });
};

const loadEvents = () => {
    const eventFiles = fs.readdirSync(eventsFolder).filter(file => file.endsWith(".js"));
    eventFiles.forEach(file => {
        const event = require(path.join(eventsFolder, file));
        if (event.name && typeof event.event === "function") {
            global.events.set(event.name, event);
            logSuccess(`✅ Loaded event: ${event.name}`);
        }
    });
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
                logError(`⚠️ Failed to fetch group metadata: ${err.message}`);
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
                await sock.react(m.key.remoteJid, "ℹ️", m.key);
                return await prefixCmd.run({ sock, m });
            }
        }

        if (isCmd && global.commands.has(command)) {
            const cmd = global.commands.get(command);
            const permissionLevel = getPermissionLevel(sender.replace(/[^0-9]/g, ""), groupMetadata);

            if (cmd.permission > permissionLevel) {
                await sock.react(m.key.remoteJid, "❌", m.key);
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
                    await sock.react(m.key.remoteJid, "⏳", m.key);
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
            await sock.react(m.key.remoteJid, "✅", m.key);
            await cmd.run({ sock, m, args, sender, botNumber, UserStats });

            // Increment message count in MongoDB
            try {
                await UserStats.updateOne(
                    { userId: sender },
                    { $inc: { messageCount: 1 } },
                    { upsert: true }
                );
            } catch (dbError) {
                logError("❌ Error updating user stats in MongoDB:", dbError.message);
            }

        } else if (isCmd) {
            await sock.react(m.key.remoteJid, "❓", m.key);
            await sock.sendMessage(
                m.key.remoteJid,
                { text: `❌ Command "${command}" not found.` },
                { quoted: m }
            );
        } else {
            // Increment message count for non-command messages as well if needed
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
            event.event({ sock, m, sender });
        });

    } catch (err) {
        logError(`❌ Error: ${err.message}`);
    }
};

fs.watchFile(__filename, () => {
    fs.unwatchFile(__filename);
    logInfo(`🔄 Updated ${__filename}`);
    delete require.cache[__filename];
    require(__filename);
});

loadCommands();
loadEvents();