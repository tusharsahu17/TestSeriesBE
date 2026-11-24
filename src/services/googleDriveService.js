require('dotenv').config();
const { google } = require("googleapis");
const { Readable } = require("stream");

function getDriveClient() {
  // Option A: OAuth2 Refresh Token (uses personal 5TB Google account storage)
  if (process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const clientId = process.env.GOOGLE_CLIENT_ID.trim().replace(/^['"]|['"]$/g, '');
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET.trim().replace(/^['"]|['"]$/g, '');
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN.trim().replace(/^[=\s"'"]+|[=\s"'"]+$/g, '');

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    return google.drive({ version: "v3", auth: oauth2Client });
  }

  // Option B: Service Account (uses Google Workspace Shared Drive)
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.trim();
  let rawKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    throw new Error(
      "Missing Google Drive credentials. Please provide either Service Account (GOOGLE_DRIVE_CLIENT_EMAIL & GOOGLE_DRIVE_PRIVATE_KEY) or OAuth2 (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, & GOOGLE_REFRESH_TOKEN)."
    );
  }

  // Clean trailing quotes, commas from copy-pasting JSON, and normalize newlines
  let privateKey = rawKey.trim();
  if (privateKey.endsWith('",')) privateKey = privateKey.slice(0, -2);
  if (privateKey.endsWith('"')) privateKey = privateKey.slice(0, -1);
  if (privateKey.startsWith('"')) privateKey = privateKey.slice(1);
  privateKey = privateKey.replace(/\\n/g, "\n").trim();

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      "Invalid GOOGLE_DRIVE_PRIVATE_KEY format. It must be the full RSA private key from your service account JSON (starting with '-----BEGIN PRIVATE KEY-----')."
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

/**
 * Upload a file buffer to Google Drive
 */
async function uploadToGoogleDrive(
  fileBuffer,
  originalName,
  mimeType = "application/pdf"
) {
  const drive = getDriveClient();

  const fileMetadata = {
    name: `${Date.now()}-${originalName}`,
    parents: process.env.GOOGLE_DRIVE_FOLDER_ID
      ? [process.env.GOOGLE_DRIVE_FOLDER_ID]
      : [],
  };

  const media = {
    mimeType,
    body: bufferToStream(fileBuffer),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id, name, webViewLink, webContentLink",
    supportsAllDrives: true,
  });

  const fileId = response.data.id;

  // Make the file publicly viewable so students can view/download
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
      supportsAllDrives: true,
    });
  } catch (permError) {
    console.warn("Warning setting public permission on Google Drive file:", permError.message);
  }

  return {
    fileId,
    fileName: response.data.name,
    // Google Drive web view preview link
    webViewLink:
      response.data.webViewLink ||
      `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
    // Direct download URL
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}

/**
 * Delete a file from Google Drive
 */
async function deleteFromGoogleDrive(fileId) {
  if (!fileId) return;
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (error) {
    console.error(
      `Error deleting file ${fileId} from Google Drive:`,
      error.message
    );
  }
}

/**
 * Get readable stream for a file stored in Google Drive
 */
async function getFileStreamFromGoogleDrive(fileId) {
  if (!fileId) throw new Error("Google Drive fileId is required");
  const drive = getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
  return response.data;
}

/**
 * Get file metadata from Google Drive
 */
async function getFileMetadataFromGoogleDrive(fileId) {
  if (!fileId) return null;
  try {
    const drive = getDriveClient();
    const response = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size",
      supportsAllDrives: true,
    });
    return response.data;
  } catch (err) {
    console.warn(`Could not fetch metadata for Google Drive file ${fileId}:`, err.message);
    return null;
  }
}

module.exports = {
  uploadToGoogleDrive,
  deleteFromGoogleDrive,
  getFileStreamFromGoogleDrive,
  getFileMetadataFromGoogleDrive,
};
