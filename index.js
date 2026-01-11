/************************************************
 * Load environment variables FIRST
 ************************************************/
require('dotenv').config();

/************************************************
 * Imports
 ************************************************/
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { sql, poolPromise } = require('./db');
const { uploadImageToBlob, deleteImageFromBlob } = require('./blob');

/************************************************
 * App initialization
 ************************************************/
const app = express();
const port = process.env.PORT || 4000;

/************************************************89
 * Middleware
 ************************************************/

// ✅ CORS — MUST be after app is created
app.use(cors({
  origin: '*', // OK for coursework
  methods: ['GET', 'POST', 'DELETE'],
}));

// Parse JSON bodies
app.use(express.json());

// Multer: store file in memory (needed for Azure Blob)
const upload = multer({
  storage: multer.memoryStorage(),
});

/************************************************
 * Routes
 ************************************************/

// 1️⃣ Health check
app.get('/', (req, res) => {
  res.send('API is running.');
});

// 2️⃣ Get all photos
app.get('/photos', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query('SELECT * FROM Photos ORDER BY created_at DESC');

    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching photos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3️⃣ Upload a photo
app.post('/photos', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    if (!req.body.title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const { title, caption, location } = req.body;
    const file = req.file;

    // Upload image to Azure Blob Storage
    const imageUrl = await uploadImageToBlob(
      file.buffer,
      file.originalname,
      file.mimetype
    );

    // Save metadata to Azure SQL
    const pool = await poolPromise;
    const result = await pool.request()
      .input('title', sql.NVarChar(255), title)
      .input('caption', sql.NVarChar(500), caption || null)
      .input('location', sql.NVarChar(255), location || null)
      .input('image_url', sql.NVarChar(500), imageUrl)
      .query(`
        INSERT INTO Photos (title, caption, location, image_url)
        OUTPUT INSERTED.*
        VALUES (@title, @caption, @location, @image_url)
      `);

    res.status(201).json(result.recordset[0]);

  } catch (err) {
    console.error('Error uploading photo:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// 4️⃣ Delete a photo
app.delete('/photos/:id', async (req, res) => {
  const photoId = parseInt(req.params.id, 10);

  try {
    const pool = await poolPromise;

    // Get image URL
    const photoResult = await pool.request()
      .input('id', sql.Int, photoId)
      .query('SELECT image_url FROM Photos WHERE id = @id');

    if (photoResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const imageUrl = photoResult.recordset[0].image_url;

    // Delete from Blob Storage
    if (imageUrl) {
      await deleteImageFromBlob(imageUrl);
    }

    // Delete from SQL
    await pool.request()
      .input('id', sql.Int, photoId)
      .query('DELETE FROM Photos WHERE id = @id');

    res.json({ message: 'Photo deleted successfully' });

  } catch (err) {
    console.error('Error deleting photo:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// 5️⃣ Add comment
app.post('/photos/:id/comments', async (req, res) => {
  const photoId = parseInt(req.params.id, 10);
  const { comment_text } = req.body;

  if (!comment_text || comment_text.trim() === '') {
    return res.status(400).json({ error: 'Comment text is required' });
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

    // Foreign key violation → photo not found
    if (err.number === 547) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// 6️⃣ Get comments
app.get('/photos/:id/comments', async (req, res) => {
  const photoId = parseInt(req.params.id, 10);

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('photoId', sql.Int, photoId)
      .query(`
        SELECT * FROM Comments
        WHERE photo_id = @photoId
        ORDER BY created_at DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/************************************************
 * Start server
 ************************************************/
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});



// require('dotenv').config();

// const express = require('express');
// const cors = require('cors');
// const multer = require('multer');
// const { sql, poolPromise } = require('./db');
// const { uploadImageToBlob, deleteImageFromBlob } = require('./blob');

// const app = express();
// const port = process.env.PORT || 3000;

// /* =========================
//    GLOBAL MIDDLEWARE
// ========================= */

// // CORS (FIXES YOUR FRONTEND ISSUE)
// app.use(cors({
//   origin: '*', // OK for coursework
//   methods: ['GET', 'POST', 'DELETE'],
// }));

// // Parse JSON bodies
// app.use(express.json());

// // Multer (memory storage for blob upload)
// const upload = multer({ storage: multer.memoryStorage() });

// /* =========================
//    ROUTES
// ========================= */

// // Health check
// app.get('/', (req, res) => {
//   res.send('API is running.');
// });

// // Get all photos
// app.get('/photos', async (req, res) => {
//   try {
//     const pool = await poolPromise;
//     const result = await pool.request()
//       .query('SELECT * FROM Photos ORDER BY created_at DESC');
//     res.json(result.recordset);
//   } catch (err) {
//     console.error('Error fetching photos:', err);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // Upload photo
// app.post('/photos', upload.single('image'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No image file provided' });
//     }
//     if (!req.body.title) {
//       return res.status(400).json({ error: 'Title is required' });
//     }

//     const { title, caption, location } = req.body;
//     const file = req.file;

//     const imageUrl = await uploadImageToBlob(
//       file.buffer,
//       file.originalname,
//       file.mimetype
//     );

//     const pool = await poolPromise;
//     const result = await pool.request()
//       .input('title', sql.NVarChar(255), title)
//       .input('caption', sql.NVarChar(500), caption || null)
//       .input('location', sql.NVarChar(255), location || null)
//       .input('imageUrl', sql.NVarChar(500), imageUrl)
//       .query(`
//         INSERT INTO Photos (title, caption, location, image_url)
//         OUTPUT INSERTED.*
//         VALUES (@title, @caption, @location, @imageUrl)
//       `);

//     res.status(201).json(result.recordset[0]);

//   } catch (err) {
//     console.error('Error uploading photo:', err);
//     res.status(500).json({ error: 'Failed to process request' });
//   }
// });

// // Delete photo
// app.delete('/photos/:id', async (req, res) => {
//   try {
//     const pool = await poolPromise;

//     const photo = await pool.request()
//       .input('id', sql.Int, req.params.id)
//       .query('SELECT image_url FROM Photos WHERE id = @id');

//     if (!photo.recordset.length) {
//       return res.status(404).json({ error: 'Photo not found' });
//     }

//     await deleteImageFromBlob(photo.recordset[0].image_url);

//     await pool.request()
//       .input('id', sql.Int, req.params.id)
//       .query('DELETE FROM Photos WHERE id = @id');

//     res.json({ message: 'Photo deleted successfully' });

//   } catch (err) {
//     console.error('Error deleting photo:', err);
//     res.status(500).json({ error: 'Failed to delete photo' });
//   }
// });

// // Add comment
// app.post('/photos/:id/comments', async (req, res) => {
//   if (!req.body.comment_text?.trim()) {
//     return res.status(400).json({ error: 'Comment text cannot be empty' });
//   }

//   try {
//     const pool = await poolPromise;
//     const result = await pool.request()
//       .input('photoId', sql.Int, req.params.id)
//       .input('comment_text', sql.NVarChar(sql.MAX), req.body.comment_text)
//       .query(`
//         INSERT INTO Comments (photo_id, comment_text)
//         OUTPUT INSERTED.*
//         VALUES (@photoId, @comment_text)
//       `);

//     res.status(201).json(result.recordset[0]);
//   } catch (err) {
//     console.error('Error adding comment:', err);
//     res.status(500).json({ error: 'Failed to add comment' });
//   }
// });

// // Get comments
// app.get('/photos/:id/comments', async (req, res) => {
//   try {
//     const pool = await poolPromise;
//     const result = await pool.request()
//       .input('photoId', sql.Int, req.params.id)
//       .query(`
//         SELECT * FROM Comments
//         WHERE photo_id = @photoId
//         ORDER BY created_at DESC
//       `);

//     res.json(result.recordset);
//   } catch (err) {
//     console.error('Error fetching comments:', err);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// /* =========================
//    START SERVER
// ========================= */

// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });
