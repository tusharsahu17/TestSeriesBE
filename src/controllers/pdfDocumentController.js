const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const pdfCategoryModel = require("../models/pdfCategoryModel");
const pdfDocumentModel = require("../models/pdfDocumentModel");
const {
  uploadToGoogleDrive,
  deleteFromGoogleDrive,
  getFileStreamFromGoogleDrive,
  getFileMetadataFromGoogleDrive,
} = require("../services/googleDriveService");

/**
 * Helper to delete a file from disk safely
 */
function safeUnlink(filePath) {
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error(`Failed to delete file at ${filePath}:`, err.message);
  }
}

/**
 * Format relative URL to include protocol and host if available
 */
function getFullUrl(req, fileUrl) {
  if (!fileUrl) return null;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
  return `${protocol}://${host}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

/**
 * Upload single or multiple PDFs with a category name or categoryId
 */
const uploadPdfHandler = async (req, res) => {
  const uploadedFiles = req.files || (req.file ? [req.file] : []);

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({
      success: false,
      error:
        'Please upload at least one PDF file (supported fields: "file", "pdf", or "files")',
    });
  }

  try {
    const categoryName =
      req.body.categoryName || req.body.category_name || req.body.category;
    const categoryId = req.body.categoryId || req.body.category_id;
    const categoryDescription =
      req.body.categoryDescription || req.body.category_description;

    let targetCategory = null;

    if (categoryName && categoryName.trim()) {
      // Find existing category by name or create a new one automatically
      targetCategory = await pdfCategoryModel.findOrCreateCategory(
        categoryName,
        categoryDescription,
      );
    } else if (categoryId) {
      // Look up by categoryId
      targetCategory = await pdfCategoryModel.getCategoryById(
        categoryId,
        false,
      );
      if (!targetCategory) {
        // Clean up uploaded files since validation failed
        for (const file of uploadedFiles) {
          safeUnlink(file.path);
        }
        return res.status(404).json({
          success: false,
          error: `Category with ID ${categoryId} not found`,
        });
      }
    } else {
      // Neither categoryName nor categoryId provided
      for (const file of uploadedFiles) {
        safeUnlink(file.path);
      }
      return res.status(400).json({
        success: false,
        error:
          'A category name ("categoryName") or category ID ("categoryId") is required',
      });
    }

    const createdPdfs = [];

    // Process each uploaded file
    // In uploadPdfHandler loop:
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      // Upload buffer directly to Google Drive
      const driveResult = await uploadToGoogleDrive(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      const pdfData = {
        category_id: targetCategory.id,
        title: req.body.title || path.parse(file.originalname).name,
        description: req.body.description || null,
        file_name: driveResult.fileName,
        original_name: file.originalname,
        file_path: driveResult.fileId, // store Google Drive fileId
        file_url: driveResult.webViewLink, // Google Drive view link
        file_size: file.size,
        mime_type: file.mimetype || "application/pdf",
      };
      const created = await pdfDocumentModel.createPdf(pdfData);
      createdPdfs.push(created);
    }

    if (createdPdfs.length === 1) {
      return res.status(201).json({
        success: true,
        message: "PDF uploaded and categorized successfully",
        data: createdPdfs[0],
      });
    }

    return res.status(201).json({
      success: true,
      message: `${createdPdfs.length} PDFs uploaded and categorized successfully`,
      category: {
        id: targetCategory.id,
        name: targetCategory.name,
      },
      count: createdPdfs.length,
      data: createdPdfs,
    });
  } catch (error) {
    // Clean up uploaded files in case of DB error
    for (const file of uploadedFiles) {
      safeUnlink(file.path);
    }
    return res.status(500).json({
      success: false,
      error: "Failed to upload PDF",
      details: error.message,
    });
  }
};

/**
 * Get all PDFs with filtering, search, and pagination
 */
const getAllPdfsHandler = async (req, res) => {
  try {
    const { categoryId, categoryName, search, sortBy, order, page, limit } =
      req.query;

    const result = await pdfDocumentModel.getAllPdfs({
      categoryId,
      categoryName,
      search,
      sortBy,
      order,
      page,
      limit,
    });

    // Attach fullUrl to response
    if (result.data) {
      result.data = result.data.map((pdf) => ({
        ...pdf,
        fullUrl: getFullUrl(req, pdf.fileUrl),
        viewFullUrl: getFullUrl(req, pdf.viewUrl || `/api/pdfs/${pdf.id}/view`),
        downloadFullUrl: getFullUrl(req, pdf.downloadUrl || `/api/pdfs/${pdf.id}/download`),
      }));
      return res.json({
        success: true,
        ...result,
      });
    }

    const formatted = result.map((pdf) => ({
      ...pdf,
      fullUrl: getFullUrl(req, pdf.fileUrl),
      viewFullUrl: getFullUrl(req, pdf.viewUrl || `/api/pdfs/${pdf.id}/view`),
      downloadFullUrl: getFullUrl(req, pdf.downloadUrl || `/api/pdfs/${pdf.id}/download`),
    }));

    return res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch PDFs",
      details: error.message,
    });
  }
};

/**
 * Get PDF by ID
 */
const getPdfByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const pdf = await pdfDocumentModel.getPdfById(id);

    if (!pdf) {
      return res.status(404).json({ success: false, error: "PDF not found" });
    }

    pdf.fullUrl = getFullUrl(req, pdf.fileUrl);
    pdf.viewFullUrl = getFullUrl(req, pdf.viewUrl || `/api/pdfs/${pdf.id}/view`);
    pdf.downloadFullUrl = getFullUrl(req, pdf.downloadUrl || `/api/pdfs/${pdf.id}/download`);

    return res.json({
      success: true,
      data: pdf,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch PDF",
      details: error.message,
    });
  }
};

/**
 * Extract Google Drive fileId from filePath or fileUrl
 */
function extractGoogleDriveFileId(filePath, fileUrl) {
  // If filePath looks like a Google Drive ID (not a path on disk and not ending in .pdf)
  if (
    filePath &&
    typeof filePath === "string" &&
    !filePath.includes("/") &&
    !filePath.includes("\\") &&
    !filePath.toLowerCase().endsWith(".pdf")
  ) {
    return filePath.trim();
  }

  // Check fileUrl or filePath for Google Drive URL patterns
  const candidateUrls = [fileUrl, filePath].filter(
    (u) => typeof u === "string" && u.includes("drive.google.com")
  );
  for (const url of candidateUrls) {
    const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1 && match1[1]) return match1[1];
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2 && match2[1]) return match2[1];
  }

  return null;
}

/**
 * Download or view a PDF inline (streams directly with CORS headers to avoid cross-origin blocking)
 */
const downloadPdfHandler = async (req, res) => {
  const origin = req.headers.origin || "*";

  // Preflight check
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Range, Accept, X-Requested-With"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.sendStatus(204);
  }

  // Set essential CORS headers on all responses (including errors)
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Range, Accept, X-Requested-With"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Disposition, Content-Length, Content-Range, Content-Type, Accept-Ranges"
  );
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Accept-Ranges", "bytes");

  try {
    const { id } = req.params;
    const isInline = req.query.inline === "true" || req.path.endsWith("/view");

    const pdf = await pdfDocumentModel.getPdfById(id);
    if (!pdf) {
      return res.status(404).json({ success: false, error: "PDF not found" });
    }

    const filename = pdf.originalName || pdf.title || `document-${id}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader("Content-Type", pdf.mimeType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      isInline
        ? `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        : `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    );

    // If HEAD request, respond without body
    if (req.method === "HEAD") {
      if (pdf.fileSize) res.setHeader("Content-Length", pdf.fileSize);
      return res.sendStatus(200);
    }

    // 1. If stored in Google Drive: stream binary directly (handles API or public download fallback seamlessly)
    const driveFileId = extractGoogleDriveFileId(pdf.filePath, pdf.fileUrl);
    if (driveFileId) {
      try {
        const driveResult = await getFileStreamFromGoogleDrive(
          driveFileId,
          req.headers.range
        );

        if (driveResult.status) {
          res.status(driveResult.status);
        }
        if (driveResult.contentLength) {
          res.setHeader("Content-Length", driveResult.contentLength);
        } else if (pdf.fileSize && !req.headers.range) {
          res.setHeader("Content-Length", pdf.fileSize);
        }
        if (driveResult.contentRange) {
          res.setHeader("Content-Range", driveResult.contentRange);
        }
        if (driveResult.contentType) {
          res.setHeader("Content-Type", driveResult.contentType);
        }

        driveResult.stream.on("error", (err) => {
          console.error(
            `Google Drive stream error for file ${driveFileId}:`,
            err.message
          );
          if (!res.headersSent) {
            res.status(502).json({
              success: false,
              error: "Failed to stream document from Google Drive",
              details: err.message,
            });
          } else {
            res.end();
          }
        });

        req.on("close", () => {
          if (
            driveResult.stream &&
            typeof driveResult.stream.destroy === "function"
          ) {
            driveResult.stream.destroy();
          }
        });

        return driveResult.stream.pipe(res);
      } catch (driveErr) {
        console.error(
          `Failed to initiate Google Drive stream for ${driveFileId}:`,
          driveErr.message
        );
        // Fall through to try local disk or external URL fallback
      }
    }

    // 2. Fallback for legacy files stored on local disk
    if (pdf.filePath) {
      const candidates = [
        path.isAbsolute(pdf.filePath)
          ? pdf.filePath
          : path.resolve(__dirname, "../../", pdf.filePath),
        path.isAbsolute(pdf.filePath)
          ? pdf.filePath
          : path.resolve(__dirname, "../", pdf.filePath),
        path.resolve(
          __dirname,
          "../../uploads/pdfs",
          path.basename(pdf.filePath)
        ),
        path.resolve(
          __dirname,
          "../uploads/pdfs",
          path.basename(pdf.filePath)
        ),
      ];

      let resolvedDiskPath = candidates.find((c) => fs.existsSync(c));

      // If exact path not found, search uploads/pdfs for file ending with originalName
      if (!resolvedDiskPath && pdf.originalName) {
        const uploadsDir = path.resolve(__dirname, "../../uploads/pdfs");
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          const match = files.find((f) => f.endsWith(pdf.originalName));
          if (match) {
            resolvedDiskPath = path.join(uploadsDir, match);
          }
        }
      }

      if (resolvedDiskPath) {
        const stat = fs.statSync(resolvedDiskPath);
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunksize = end - start + 1;

          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
          res.setHeader("Content-Length", chunksize);
          const fileStream = fs.createReadStream(resolvedDiskPath, {
            start,
            end,
          });
          return fileStream.pipe(res);
        }

        res.setHeader("Content-Length", stat.size);
        const fileStream = fs.createReadStream(resolvedDiskPath);
        return fileStream.pipe(res);
      }
    }

    // 3. Fallback for generic remote HTTP/HTTPS URLs (stream directly, never 302 redirect)
    if (
      pdf.fileUrl &&
      (pdf.fileUrl.startsWith("http://") || pdf.fileUrl.startsWith("https://"))
    ) {
      try {
        const fetchHeaders = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };
        if (req.headers.range) {
          fetchHeaders["Range"] = req.headers.range;
        }

        const remoteRes = await fetch(pdf.fileUrl, {
          headers: fetchHeaders,
          redirect: "follow",
        });

        if (remoteRes.ok || remoteRes.status === 206) {
          const contentType = remoteRes.headers.get("content-type") || "";
          if (!contentType.toLowerCase().includes("text/html")) {
            res.status(remoteRes.status);
            if (remoteRes.headers.get("content-length")) {
              res.setHeader(
                "Content-Length",
                remoteRes.headers.get("content-length")
              );
            }
            if (remoteRes.headers.get("content-range")) {
              res.setHeader(
                "Content-Range",
                remoteRes.headers.get("content-range")
              );
            }
            if (contentType) {
              res.setHeader("Content-Type", contentType);
            }
            const stream = Readable.fromWeb(remoteRes.body);
            return stream.pipe(res);
          }
        }
      } catch (remoteErr) {
        console.error("External URL fetch failed:", remoteErr.message);
      }
    }

    return res.status(502).json({
      success: false,
      error:
        "Unable to retrieve PDF from storage. Please verify file availability.",
    });
  } catch (error) {
    console.error("Failed to serve PDF file:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to serve file",
      details: error.message,
    });
  }
};

/**
 * Update PDF metadata and/or replace PDF file
 */
const updatePdfHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const existingPdf = await pdfDocumentModel.getPdfById(id);

    if (!existingPdf) {
      if (req.file && req.file.path) safeUnlink(req.file.path);
      return res.status(404).json({ success: false, error: "PDF not found" });
    }

    const { title, description } = req.body;
    let category_id = req.body.categoryId || req.body.category_id;
    const categoryName = req.body.categoryName || req.body.category_name;

    // If categoryName given, find or create category
    if (categoryName && categoryName.trim()) {
      const cat = await pdfCategoryModel.findOrCreateCategory(categoryName);
      category_id = cat.id;
    } else if (category_id) {
      const cat = await pdfCategoryModel.getCategoryById(category_id, false);
      if (!cat) {
        if (req.file && req.file.path) safeUnlink(req.file.path);
        return res
          .status(404)
          .json({ success: false, error: "Category not found" });
      }
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category_id !== undefined) updateData.category_id = category_id;

    // If replacement file uploaded
    if (req.file) {
      const driveResult = await uploadToGoogleDrive(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );

      updateData.file_name = driveResult.fileName;
      updateData.original_name = req.file.originalname;
      updateData.file_path = driveResult.fileId;
      updateData.file_url = driveResult.webViewLink;
      updateData.file_size = req.file.size;
      updateData.mime_type = req.file.mimetype || "application/pdf";

      // Delete the old file from Google Drive or disk
      if (existingPdf.filePath) {
        const fullOldPath = path.isAbsolute(existingPdf.filePath)
          ? existingPdf.filePath
          : path.resolve(__dirname, "../../", existingPdf.filePath);

        if (fs.existsSync(fullOldPath)) {
          safeUnlink(fullOldPath);
        } else {
          await deleteFromGoogleDrive(existingPdf.filePath);
        }
      }
    }

    const updated = await pdfDocumentModel.updatePdf(id, updateData);
    updated.fullUrl = getFullUrl(req, updated.fileUrl);

    return res.json({
      success: true,
      message: "PDF updated successfully",
      data: updated,
    });
  } catch (error) {
    if (req.file && req.file.path) safeUnlink(req.file.path);
    return res.status(500).json({
      success: false,
      error: "Failed to update PDF",
      details: error.message,
    });
  }
};

/**
 * Delete PDF from DB and disk/Google Drive
 */
const deletePdfHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRecord = await pdfDocumentModel.deletePdf(id);

    if (!deletedRecord) {
      return res.status(404).json({ success: false, error: "PDF not found" });
    }

    // Delete file from disk if local, or Google Drive if remote
    if (deletedRecord.file_path) {
      const fullPath = path.isAbsolute(deletedRecord.file_path)
        ? deletedRecord.file_path
        : path.resolve(__dirname, "../../", deletedRecord.file_path);

      if (fs.existsSync(fullPath)) {
        safeUnlink(fullPath);
      } else {
        await deleteFromGoogleDrive(deletedRecord.file_path);
      }
    }

    return res.json({
      success: true,
      message: "PDF deleted successfully",
      data: {
        id: deletedRecord.id,
        title: deletedRecord.title,
        originalName: deletedRecord.original_name,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to delete PDF",
      details: error.message,
    });
  }
};

module.exports = {
  uploadPdfHandler,
  getAllPdfsHandler,
  getPdfByIdHandler,
  downloadPdfHandler,
  updatePdfHandler,
  deletePdfHandler,
};
