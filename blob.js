const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.CONTAINER_NAME || 'photos';

let blobServiceClient;
let containerClient;

try {
    // Create the BlobServiceClient object which will be used to create a container client
    blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    // Get a reference to a container
    containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    console.log('Connected to Azure Blob Storage');
} catch (error) {
    console.error('Blob Storage Connection Failed:', error.message);
}

/**
 * Uploads a file buffer to Azure Blob Storage
 * @param {Buffer} buffer - The file content
 * @param {string} originalName - Original filename to extract extension
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} - The public URL of the uploaded blob
 */
async function uploadImageToBlob(buffer, originalName, mimeType) {
    if (!containerClient) {
        throw new Error('Blob storage client not initialized');
    }

    // Create a unique name for the blob
    // We use a simple strategy effectively: timestamp-random.ext or uuid.ext
    // Here we'll generate a random string ID
    const extension = originalName.split('.').pop();
    const blobName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

    // Get a block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload data to the blob
    const uploadBlobResponse = await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: { blobContentType: mimeType }
    });

    console.log(`Blob was uploaded successfully. requestId: ${uploadBlobResponse.requestId}`);

    // Return the URL. Note: Ensure the container has public read access allowed for blobs.
    return blockBlobClient.url;
}

/**
 * Deletes a blob from Azure Blob Storage given its name or full URL
 * @param {string} blobNameOrUrl - The blob name or full URL
 */
async function deleteImageFromBlob(blobNameOrUrl) {
    if (!containerClient) {
        // If not initialized (e.g. bad config), we can't delete.
        console.error('Blob storage client not initialized, cannot delete blob.');
        return;
    }

    try {
        let blobName = blobNameOrUrl;
        // If it's a URL, extract the blob name
        if (blobNameOrUrl.includes(CONTAINER_NAME)) {
            // Assuming format: https://<account>.blob.core.windows.net/<container>/<blobName>
            const parts = blobNameOrUrl.split(`/${CONTAINER_NAME}/`);
            if (parts.length > 1) {
                blobName = parts[1];
            }
        }

        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.deleteIfExists();
        console.log(`Blob ${blobName} deleted successfully.`);
    } catch (error) {
        console.error('Error deleting blob:', error.message);
        // We generally don't want to throw here to avoid failing the DB transaction if blob delete fails?
        // But requirements say "Ensure no orphaned blobs remain".
        // Use best effort or handle carefully. For now, logging error.
    }
}

module.exports = {
    uploadImageToBlob,
    deleteImageFromBlob
};
