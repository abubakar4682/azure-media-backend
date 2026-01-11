const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.CONTAINER_NAME || 'photos';

let blobServiceClient;
let containerClient;

try {
    blobServiceClient = BlobServiceClient.fromConnectionString(
        AZURE_STORAGE_CONNECTION_STRING
    );
    containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    console.log('Connected to Azure Blob Storage');
} catch (error) {
    console.error('Blob Storage Connection Failed:', error.message);
}

/**
 * Upload image buffer to Azure Blob Storage (SAFE FOR AZURE APP SERVICE)
 */
async function uploadImageToBlob(buffer, originalName, mimeType) {
    if (!containerClient) {
        throw new Error('Blob storage client not initialized');
    }

    const extension = originalName.split('.').pop();
    const blobName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(7)}.${extension}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // ✅ IMPORTANT FIX — use uploadData (NOT upload)
    await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: {
            blobContentType: mimeType,
        },
    });

    console.log(`Blob uploaded successfully: ${blobName}`);
    return blockBlobClient.url;
}

/**
 * Delete image from Azure Blob Storage
 */
async function deleteImageFromBlob(blobNameOrUrl) {
    if (!containerClient) {
        console.error('Blob storage client not initialized');
        return;
    }

    try {
        let blobName = blobNameOrUrl;

        if (blobNameOrUrl.includes(CONTAINER_NAME)) {
            const parts = blobNameOrUrl.split(`/${CONTAINER_NAME}/`);
            if (parts.length > 1) {
                blobName = parts[1];
            }
        }

        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.deleteIfExists();
        console.log(`Blob deleted: ${blobName}`);
    } catch (error) {
        console.error('Error deleting blob:', error.message);
    }
}

module.exports = {
    uploadImageToBlob,
    deleteImageFromBlob,
};
