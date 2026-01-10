# Azure Media Sharing Backend

This is the backend implementation for the cloud-native media sharing web application assignment.

## Prerequisites
- Node.js installed

## Setup Instructions

1.  **Install Dependencies**
    Open your terminal in this directory and run:
    ```bash
    npm install express mssql @azure/storage-blob multer dotenv
    ```

2.  **Environment Configuration**
    Create a `.env` file based on the example:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and fill in your actual Azure credentials:
    - `DB_USER` and `DB_PASSWORD` for the SQL Database.
    - `AZURE_STORAGE_CONNECTION_STRING` for the Blob Storage account.

3.  **Run the Server**
    Start the application:
    ```bash
    node index.js
    ```
    The server will start on port 3000 (default).

## API Endpoints

-   **GET /**
    -   Health check. Returns "API is running."
-   **GET /photos**
    -   Returns a JSON list of all photos.
-   **POST /photos**
    -   Uploads a new photo.
    -   Body (multipart/form-data):
        -   `title` (text, required)
        -   `caption` (text, optional)
        -   `location` (text, optional)
        -   `image` (file, required)
