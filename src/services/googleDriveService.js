require('dotenv').config();
const { google } = require("googleapis");
const { Readable } = require("stream");

function getDriveClient() {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

  if (!clientEmail) {
    throw new Error(
      "Missing GOOGLE_DRIVE_CLIENT_EMAIL. Please set it in your .env or Vercel Environment Variables."
    );
  }

  if (!privateKey) {
    throw new Error(
      "Missing GOOGLE_DRIVE_PRIVATE_KEY. Please set it in your .env or Vercel Environment Variables."
    );
  }

  // Handle escaped newlines if passed as single-line string
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      "Invalid GOOGLE_DRIVE_PRIVATE_KEY format. It must be the full RSA private key from your service account JSON (starting with '-----BEGIN PRIVATE KEY-----'), not the private_key_id."
    );
  }

  const auth = new google.auth.JWT(
    clientEmail,
    null,
    privateKey,
    ["https://www.googleapis.com/auth/drive"]
  );

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
    await drive.files.delete({ fileId });
  } catch (error) {
    console.error(
      `Error deleting file ${fileId} from Google Drive:`,
      error.message
    );
  }
}

module.exports = {
  uploadToGoogleDrive,
  deleteFromGoogleDrive,
};
