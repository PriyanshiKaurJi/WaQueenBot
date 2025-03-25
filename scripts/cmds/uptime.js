const os = require('os');
const { execSync } = require('child_process');
const moment = require('moment-timezone');

module.exports = {
    name: 'uptime',
    description: 'Shows bot uptime and system information',
    permission: 0,
    cooldowns: 5,
    dmUser: true,
    author: 'Priyanshi Kaur',
    run: async ({ sock, m }) => {
        try {
            const uptime = os.uptime();
            const botUptime = process.uptime();

            const formatUptime = (seconds) => {
                const d = Math.floor(seconds / 86400);
                const h = Math.floor((seconds % 86400) / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const s = Math.floor(seconds % 60);
                return `${d}d ${h}h ${m}m ${s}s`;
            };

            const osType = os.type();
            const osArch = os.arch();
            const cpuModel = os.cpus()[0].model;
            const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
            const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
            const nodeVersion = process.version;
            const currentTime = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');

            let cpuLoad = 'N/A';
            try {
                if (os.platform() === 'linux') {
                    cpuLoad = execSync('uptime').toString().split('load average: ')[1].trim();
                }
            } catch (err) {
                console.error('Error fetching CPU load:', err.message);
            }

            const message = `📊 *Bot Uptime & System Info*

⏳ Bot Uptime: ${formatUptime(botUptime)}
🖥 System Uptime: ${formatUptime(uptime)}
🌐 OS Type: ${osType} (${osArch})
🚀 CPU Model: ${cpuModel}
💾 RAM Usage: ${(totalMem - freeMem).toFixed(2)} GB / ${totalMem} GB
⚡ CPU Load: ${cpuLoad}
🛠 Node.js Version: ${nodeVersion}
⏰ Current Time (IST): ${currentTime}`;

            await sock.sendMessage(m.key.remoteJid, { text: message });
        } catch (error) {
            console.error('Error fetching system info:', error.message);
            await sock.sendMessage(m.key.remoteJid, { text: 'An error occurred while fetching uptime details.' });
        }
    },
};