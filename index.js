const express = require('express');
const multer = require('multer');
const { sql, poolPromise } = require('./db');
const { uploadImageToBlob, deleteImageFromBlob } = require('./blob');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configure multer for memory storage (we need the buffer to upload to blob)
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to parse JSON bodies
app.use(express.json());

// 1. Health check endpoint
// GET /
app.get('/', (req, res) => {
    res.send('API is running.');
});

// 2. Fetch all photos
// GET /photos
app.get('/photos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM Photos ORDER BY created_at DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching photos:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 3. Upload a photo
// POST /photos
// Expects: title, caption (optional), location (optional), image (file)
app.post('/photos', upload.single('image'), async (req, res) => {
    try {
        // Validate request
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!req.body.title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const { title, caption, location } = req.body;
        const file = req.file;

        // 1. Upload image to Azure Blob Storage
        const imageUrl = await uploadImageToBlob(file.buffer, file.originalname, file.mimetype);

        // 2. Save metadata to Azure SQL Database
        const pool = await poolPromise;

        // Use parameterized query to prevent SQL injection
        const result = await pool.request()
            .input('title', sql.NVarChar(255), title)
            .input('caption', sql.NVarChar(500), caption || null) // Handle optional
            .input('location', sql.NVarChar(255), location || null) // Handle optional
            .input('imageUrl', sql.NVarChar(500), imageUrl)
            .query(`
                INSERT INTO Photos (title, caption, location, image_url)
                OUTPUT INSERTED.*
                VALUES (@title, @caption, @location, @imageUrl)
            `);

        // Return the created record
        res.status(201).json(result.recordset[0]);

    } catch (err) {
        console.error('Error uploading photo:', err);
        res.status(500).json({ error: 'Failed to process request' });
    }
});



// 4. Delete a photo
// DELETE /photos/:id
app.delete('/photos/:id', async (req, res) => {
    const photoId = req.params.id;
    try {
        const pool = await poolPromise;

        // 1. Fetch photo to get image URL
        const photoResult = await pool.request()
            .input('id', sql.Int, photoId)
            .query('SELECT image_url FROM Photos WHERE id = @id');

        if (photoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        const imageUrl = photoResult.recordset[0].image_url;

        // 2. Delete from Azure Blob Storage
        if (imageUrl) {
            await deleteImageFromBlob(imageUrl);
        }

        // 3. Delete from Azure SQL (Cascade delete will handle comments)
        await pool.request()
            .input('id', sql.Int, photoId)
            .query('DELETE FROM Photos WHERE id = @id');

        res.status(200).json({ message: 'Photo deleted successfully' });

    } catch (err) {
        console.error('Error deleting photo:', err);
        res.status(500).json({ error: 'Failed to delete photo' });
    }
});

// 5. Add a comment to a photo
// POST /photos/:id/comments
app.post('/photos/:id/comments', async (req, res) => {
    const photoId = req.params.id;
    const { comment_text } = req.body;

    if (!comment_text || comment_text.trim() === '') {
        return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('photoId', sql.Int, photoId)
            .input('comment_text', sql.NVarChar(sql.MAX), comment_text)
            .query(`
                INSERT INTO Comments (photo_id, comment_text)
                OUTPUT INSERTED.*
                VALUES (@photoId, @comment_text)
            `);

        res.status(201).json(result.recordset[0]);

    } catch (err) {
        console.error('Error adding comment:', err);
        if (err.number === 547) {
            return res.status(404).json({ error: 'Photo not found' });
        }
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// 6. Get comments for a photo
// GET /photos/:id/comments
app.get('/photos/:id/comments', async (req, res) => {
    const photoId = req.params.id;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('photoId', sql.Int, photoId)
            .query('SELECT * FROM Comments WHERE photo_id = @photoId ORDER BY created_at DESC');

        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching comments:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
