const imgTypeDict = { 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml' }
const officeTypeDict = { "pdf": "application/pdf", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
const videoTypeDict = { 'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'mkv': 'video/x-matroska' }
function getContentTypeByFileName(/** @type {string} */ fileName) {
    const fileExtendName = fileName.split('.').pop()?.toLowerCase();
    if (imgTypeDict[fileExtendName]) {
        return imgTypeDict[fileExtendName];
    } else if (officeTypeDict[fileExtendName]) {
        return officeTypeDict[fileExtendName];
    } else if (videoTypeDict[fileExtendName]) {
        return videoTypeDict[fileExtendName];
    } else {
        return 'application/octet-stream';
    }
}

module.exports = exports = {
    getContentTypeByFileName
}