const { default: makeWASocket, DisconnectReason, makeInMemoryStore, jidDecode, proto, getContentType, useMultiFileAuthState, downloadContentFromMessage } = require("@whiskeysockets/baileys");
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const readline = require("readline");
const PhoneNumber = require('awesome-phonenumber');
const gradient = require('gradient-string');
const config = require('./config.json');
const { logInfo, logSuccess, logError } = require('./utils/logger');

// Set logging level from config
const loggerLevel = config.logLevel || 'silent';
const logger = pino({ level: loggerLevel });
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(text, resolve);
    });
};

async function startBotz() {
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const ptz = makeWASocket({
        logger: logger, 
        printQRInTerminal: true,
        auth: state,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    if (!ptz.authState.creds.registered) {
        let phoneNumber;
        if (config.botSettings.botNum) {
            phoneNumber = config.botSettings.botNum;
            logInfo('Using Bot Number from config.json:', phoneNumber);
        } else {
            phoneNumber = await question('Enter Phone Number :\n');
        }
        setTimeout(async () => {
            let code = await ptz.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log('Pairing Code:', code);
        }, 500);
    }

    store.bind(ptz.ev);

    ptz.ev.on('messages.upsert', async chatUpdate => {
        try {
            mek = chatUpdate.messages[0];
            if (!mek.message) return;
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
            if (mek.key && mek.key.remoteJid === 'status@broadcast') return;
            if (!ptz.public && !mek.key.fromMe && chatUpdate.type === 'notify') return;
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;
            m = smsg(ptz, mek, store);
            require("./handler")(ptz, m, chatUpdate, store);
        } catch (err) {
            logError('Error processing message:', err); // Use logger function for errors
        }
    });

    ptz.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && decode.user + '@' + decode.server || jid;
        } else return jid;
    };

    ptz.getName = (jid, withoutContact = false) => {
        id = ptz.decodeJid(jid);
        withoutContact = ptz.withoutContact || withoutContact;
        let v;
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {};
            if (!(v.name || v.subject)) v = ptz.groupMetadata(id) || {};
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'));
        });
        else v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === ptz.decodeJid(ptz.user.id) ? ptz.user : (store.contacts[id] || {});
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international');
    };

    ptz.public = true;

    ptz.serializeM = (m) => smsg(ptz, m, store);

    ptz.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'connecting') { logInfo('Connecting to WhatsApp...'); } // Log connecting state
        if (connection === 'open') {
            logSuccess("\n========== Bot Connected ==========\n"); // Log success connection
        }
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            logInfo(`Connection closed due to reason: ${reason || 'Unknown'}`); // Log disconnect reason
            if (reason === DisconnectReason.badSession || reason === DisconnectReason.connectionClosed || reason === DisconnectReason.connectionLost || reason === DisconnectReason.connectionReplaced || reason === DisconnectReason.restartRequired || reason === DisconnectReason.timedOut) {
                logInfo('Attempting to reconnect...'); // Log reconnection attempt
                startBotz();
            } else if (reason === DisconnectReason.loggedOut) {
                logError('Logged out. Please re-scan the QR code.'); // Log logged out state
            } else {
                ptz.end(`Unknown DisconnectReason: ${reason}|${connection}`);
            }
        }
    });

    ptz.ev.on('creds.update', saveCreds);

    ptz.sendText = (jid, text, quoted = '', options) => ptz.sendMessage(jid, { text: text, ...options }, { quoted });

    ptz.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || '';
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
        const stream = await downloadContentFromMessage(message, messageType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    };

    ptz.react = (jid, emoji, key) => {
        return ptz.sendMessage(jid, { react: { text: emoji, key: key } });
    };

    return ptz;


}

startBotz();

function smsg(ptz, m, store) {
    if (!m) return m;
    let M = proto.WebMessageInfo;
    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');
        m.sender = ptz.decodeJid(m.fromMe && ptz.user.id || m.participant || m.key.participant || m.chat || '');
        if (m.isGroup) m.participant = ptz.decodeJid(m.key.participant) || '';
    }
    if (m.message) {
        m.mtype = getContentType(m.message);
        m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : m.message[m.mtype]);
        m.body = m.message.conversation || m.msg.caption || m.msg.text || (m.mtype == 'listResponseMessage') && m.msg.singleSelectReply.selectedRowId || (m.mtype == 'buttonsResponseMessage') && m.msg.selectedButtonId || (m.mtype == 'viewOnceMessage') && m.msg.caption || m.text;
    }
    if (m.msg.url) m.download = () => ptz.downloadMediaMessage(m.msg);
    m.text = m.msg.text || m.msg.caption || m.message.conversation || m.msg.contentText || m.msg.selectedDisplayText || m.msg.title || '';
    m.reply = (text, chatId = m.chat, options = {}) => Buffer.isBuffer(text) ? ptz.sendMedia(chatId, text, 'file', '', m, { ...options }) : ptz.sendText(chatId, text, m, { ...options });
    m.copy = () => exports.smsg(conn, M.fromObject(M.toObject(m)));
    m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => ptz.copyNForward(jid, m, forceForward, options);
    return m;
}

let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    logInfo(`🔄 Updated ${__filename}`); // Use logger function for updates
    delete require.cache[file];
    require(file);
});