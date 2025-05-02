const { 
    default: makeWASocket, 
    DisconnectReason, 
    makeInMemoryStore, 
    jidDecode, 
    proto, 
    getContentType, 
    useMultiFileAuthState, 
    downloadContentFromMessage 
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const readline = require("readline");
const PhoneNumber = require('awesome-phonenumber');
const gradient = require('gradient-string');
const { logInfo, logSuccess, logError } = require('./utils/logger');
const config = require('./config.json');
const moment = require('moment-timezone');

// Initialize store
const store = makeInMemoryStore({ 
    logger: pino().child({ level: 'silent', stream: 'store' }) 
});
store.readFromFile('./baileys_store.json');

// Save store to file periodically
setInterval(() => {
    store.writeToFile('./baileys_store.json');
}, 10_000);

// Helper functions
const question = (text) => {
    const rl = readline.createInterface({ 
        input: process.stdin, 
        output: process.stdout 
    });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
};

const validatePhoneNumber = (number) => {
    if (!number) return false;
    const cleaned = number.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
};

const formatPhoneNumber = (number) => {
    return number.replace(/\D/g, '');
};

async function startBot() {
    // Initialize connection
    const { state, saveCreds } = await useMultiFileAuthState(
        path.join(__dirname, config.botSettings.sessionName || "session")
    );

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: true,
        auth: state,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10_000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        getMessage: async (key) => {
            return store.loadMessage(key.remoteJid, key.id) || {};
        }
    });

    store.bind(sock.ev);

    // Handle authentication
    if (!sock.authState.creds.registered) {
        let phoneNumber = config.botSettings.botNumber;
        
        if (phoneNumber && !validatePhoneNumber(phoneNumber)) {
            logError(`Invalid botNumber in config.json: ${phoneNumber}`);
            phoneNumber = null;
        }

        if (!phoneNumber) {
            while (true) {
                phoneNumber = await question('Enter Phone Number (with country code, e.g. 911234567890):\n');
                if (validatePhoneNumber(phoneNumber)) break;
                logError('Invalid phone number format. Please include country code (e.g. 911234567890)');
            }
        }

        try {
            const cleanedNumber = formatPhoneNumber(phoneNumber);
            logInfo(`Attempting to pair with number: ${cleanedNumber}`);
            
            let code = await sock.requestPairingCode(cleanedNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            
            logSuccess(`Pairing Code: ${code}`);
            logInfo('Enter this code in your WhatsApp linked devices section');
        } catch (error) {
            logError(`Pairing failed: ${error.message}`);
            process.exit(1);
        }
    }

    // Automatic messages scheduler
    const scheduleDailyMessage = (time, message) => {
        const now = moment().tz(config.botSettings.timeZone);
        const [hours, minutes] = time.split(':').map(Number);
        let target = moment.tz(config.botSettings.timeZone)
                          .set({ hours, minutes, seconds: 0 });
        
        if (now.isAfter(target)) {
            target.add(1, 'day');
        }

        const delay = target.diff(now);
        
        setTimeout(async () => {
            if (sock.user) {
                try {
                    await sock.sendMessage(sock.user.id, { text: message });
                    logSuccess(`Sent scheduled message: ${message}`);
                } catch (err) {
                    logError(`Failed to send scheduled message: ${err.message}`);
                }
                scheduleDailyMessage(time, message); // Reschedule
            }
        }, delay);
    };

    if (config.automaticMessages.enabled) {
        const { goodMorning, goodAfternoon, goodEvening, goodNight } = config.automaticMessages;
        scheduleDailyMessage(goodMorning.time, goodMorning.message);
        scheduleDailyMessage(goodAfternoon.time, goodAfternoon.message);
        scheduleDailyMessage(goodEvening.time, goodEvening.message);
        scheduleDailyMessage(goodNight.time, goodNight.message);
    }

    // Message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message) return;
            
            // Process message
            const processedMsg = processMessage(sock, m, store);
            if (!processedMsg) return;
            
            // Pass to handler
            require("./handler")(sock, processedMsg);
        } catch (err) {
            logError('Error processing message:', err);
        }
    });

    // Group participants update handler
    if (config.botSettings.enableGroupWelcome || config.botSettings.enableGroupGoodbye) {
        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            try {
                const groupMetadata = await sock.groupMetadata(id);
                const groupName = groupMetadata.subject || "Group";
                
                for (const participant of participants) {
                    if (action === 'add' && config.botSettings.enableGroupWelcome) {
                        const welcomeMsg = config.botSettings.groupJoinMessage
                            .replace(/@user/g, `@${participant.split('@')[0]}`)
                            .replace(/@group/g, groupName);
                        await sock.sendMessage(id, { 
                            text: welcomeMsg, 
                            mentions: [participant] 
                        });
                    } 
                    else if (action === 'remove' && config.botSettings.enableGroupGoodbye) {
                        const goodbyeMsg = config.botSettings.groupLeaveMessage
                            .replace(/@user/g, `@${participant.split('@')[0]}`)
                            .replace(/@group/g, groupName);
                        await sock.sendMessage(id, { 
                            text: goodbyeMsg, 
                            mentions: [participant] 
                        });
                    }
                }
            } catch (err) {
                logError('Error handling group update:', err);
            }
        });
    }

    // Connection events
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            logInfo(`Connection closed: ${reason || 'Unknown reason'}`);
            
            // Reconnect logic
            if ([
                DisconnectReason.badSession,
                DisconnectReason.connectionClosed,
                DisconnectReason.connectionLost,
                DisconnectReason.connectionReplaced,
                DisconnectReason.restartRequired,
                DisconnectReason.timedOut
            ].includes(reason)) {
                logInfo('Reconnecting...');
                setTimeout(startBot, 5_000);
            } else if (reason === DisconnectReason.loggedOut) {
                logError('Logged out. Please delete session and restart.');
                process.exit(1);
            }
        } 
        else if (connection === 'open') {
            console.log(gradient.rainbow("\n========== BOT CONNECTED ==========\n"));
            logSuccess(`${config.botSettings.botName} is now online!`);
            logInfo(`Owner: ${config.botSettings.ownerName}`);
            logInfo(`Prefix: ${config.botSettings.prefix}`);
            logInfo(`Timezone: ${config.botSettings.timeZone}`);
        }
    });

    // Credentials update
    sock.ev.on('creds.update', saveCreds);

    // Utility methods
    sock.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            const decoded = jidDecode(jid) || {};
            return decoded.user && decoded.server && 
                  `${decoded.user}@${decoded.server}` || jid;
        }
        return jid;
    };

    sock.getName = async (jid, withoutContact = false) => {
        const id = sock.decodeJid(jid);
        withoutContact = sock.withoutContact || withoutContact;
        
        let contact;
        if (id.endsWith("@g.us")) {
            contact = store.contacts[id] || {};
            if (!(contact.name || contact.subject)) {
                try {
                    contact = await sock.groupMetadata(id) || {};
                } catch (err) {
                    logError(`Failed to get group metadata: ${err.message}`);
                    return PhoneNumber('+' + id.replace('@s.whatsapp.net', ''))
                           .getNumber('international');
                }
            }
            return contact.name || contact.subject || 
                   PhoneNumber('+' + id.replace('@s.whatsapp.net', ''))
                   .getNumber('international');
        } 
        else {
            contact = id === '0@s.whatsapp.net' ? 
                     { id, name: 'WhatsApp' } : 
                     id === sock.decodeJid(sock.user.id) ? 
                     sock.user : 
                     (store.contacts[id] || {});
            return (withoutContact ? '' : contact.name) || 
                   contact.subject || 
                   contact.verifiedName || 
                   PhoneNumber('+' + jid.replace('@s.whatsapp.net', ''))
                   .getNumber('international');
        }
    };

    sock.sendText = (jid, text, quoted = '', options) => {
        return sock.sendMessage(jid, { text: text, ...options }, { quoted });
    };

    sock.downloadMediaMessage = async (message) => {
        const mime = (message.msg || message).mimetype || '';
        const messageType = message.mtype ? 
                          message.mtype.replace(/Message/gi, '') : 
                          mime.split('/')[0];
        const stream = await downloadContentFromMessage(message, messageType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    };

    sock.react = (jid, emoji, key) => {
        return sock.sendMessage(jid, { react: { text: emoji, key: key } });
    };

    return sock;
}

function processMessage(sock, m, store) {
    if (!m) return null;
    const M = proto.WebMessageInfo;
    
    // Process message key
    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');
        m.sender = sock.decodeJid(m.fromMe && sock.user.id || 
                                 m.participant || 
                                 m.key.participant || 
                                 m.chat || '');
        if (m.isGroup) m.participant = sock.decodeJid(m.key.participant) || '';
    }
    
    // Process message content
    if (m.message) {
        m.mtype = getContentType(m.message);
        m.msg = (m.mtype == 'viewOnceMessage') ? 
               m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : 
               m.message[m.mtype];
        
        m.body = m.message.conversation || 
                m.msg.caption || 
                m.msg.text || 
                (m.mtype == 'listResponseMessage' && m.msg.singleSelectReply.selectedRowId) || 
                (m.mtype == 'buttonsResponseMessage' && m.msg.selectedButtonId) || 
                (m.mtype == 'viewOnceMessage' && m.msg.caption) || 
                '';
    }
    
    // Add utility methods
    if (m.msg?.url) {
        m.download = () => sock.downloadMediaMessage(m.msg);
    }
    
    m.text = m.msg?.text || 
            m.msg?.caption || 
            m.message?.conversation || 
            m.msg?.contentText || 
            m.msg?.selectedDisplayText || 
            m.msg?.title || 
            '';
            
    m.reply = (text, chatId = m.chat, options = {}) => {
        return Buffer.isBuffer(text) ? 
              sock.sendMessage(chatId, { 
                  [options.type || 'image']: text 
              }, { quoted: m }) : 
              sock.sendText(chatId, text, m, options);
    };
    
    m.copy = () => processMessage(sock, M.fromObject(M.toObject(m)), store);
    m.copyNForward = (jid, forceForward = false, options = {}) => {
        return sock.copyNForward(jid, m, forceForward, options);
    };
    
    return m;
}

// File watcher for hot reload
const botFile = path.resolve(__dirname, 'bot.js');
fs.watchFile(botFile, { persistent: false }, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        fs.unwatchFile(botFile);
        logInfo(`Reloading ${botFile}...`);
        delete require.cache[require.resolve(botFile)];
        require(botFile);
    }
});

// Start the bot
startBot().catch(err => {
    logError('Failed to start bot:', err);
    process.exit(1);
});

module.exports = { startBot };