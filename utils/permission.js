const config = require('../config.json');

const ownerNumber = config.botSettings.ownerNumber;

function getPermissionLevel(senderNumber, groupMetadata) {
    if (ownerNumber && ownerNumber.includes(senderNumber)) {
        return 4;
    }
    if (groupMetadata) {
        const adminNumbers = groupMetadata.participants
            .filter(participant => participant.admin === 'superadmin' || participant.admin === 'admin')
            .map(participant => participant.id.split('@')[0]);
        if (adminNumbers.includes(senderNumber)) {
            return 3;
        }
    }
    return 0;
}

module.exports = { getPermissionLevel };