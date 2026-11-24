const fs = require("fs");
const path = require("path");
const pdfCategoryModel = require("../models/pdfCategoryModel");
const pdfDocumentModel = require("../models/pdfDocumentModel");
const { uploadToGoogleDrive, deleteFromGoogleDrive } = require("../services/googleDriveService");

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
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:3000";
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
      }));
      return res.json({
        success: true,
        ...result,
      });
    }

    const formatted = result.map((pdf) => ({
      ...pdf,
      fullUrl: getFullUrl(req, pdf.fileUrl),
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
 * Download or view a PDF inline
 */
const downloadPdfHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const isInline = req.query.inline === "true" || req.path.endsWith("/view");

    const pdf = await pdfDocumentModel.getPdfById(id);
    if (!pdf) {
      return res.status(404).json({ success: false, error: "PDF not found" });
    }

    // If stored in Google Drive or external URL
    if (pdf.fileUrl && (pdf.fileUrl.startsWith("http://") || pdf.fileUrl.startsWith("https://"))) {
      if (isInline) {
        return res.redirect(pdf.fileUrl);
      }
      const directDownloadUrl = `https://drive.google.com/uc?export=download&id=${pdf.filePath}`;
      return res.redirect(directDownloadUrl);
    }

    // Fallback for legacy files stored on local disk
    const fullFilePath = path.isAbsolute(pdf.filePath)
      ? pdf.filePath
      : path.resolve(__dirname, "../../", pdf.filePath);

    if (!fs.existsSync(fullFilePath)) {
      return res
        .status(404)
        .json({ success: false, error: "File not found on server" });
    }

    if (isInline) {
      res.setHeader("Content-Type", pdf.mimeType || "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(pdf.originalName)}"`,
      );
      return res.sendFile(fullFilePath);
    }

    return res.download(fullFilePath, pdf.originalName);
  } catch (error) {
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
