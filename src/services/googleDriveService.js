const { google } = require("googleapis");
const { Readable } = require("stream");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

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
  mimeType = "application/pdf",
) {
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
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return {
    fileId,
    fileName: response.data.name,
    // webViewLink: Preview in Google Drive viewer
    webViewLink: response.data.webViewLink,
    // Direct download / content link
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}

/**
 * Delete a file from Google Drive
 */
async function deleteFromGoogleDrive(fileId) {
  if (!fileId) return;
  try {
    await drive.files.delete({ fileId });
  } catch (error) {
    console.error(
      `Error deleting file ${fileId} from Google Drive:`,
      error.message,
    );
  }
}

module.exports = {
  uploadToGoogleDrive,
  deleteFromGoogleDrive,
};
