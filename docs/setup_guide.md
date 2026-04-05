# Setup & Run Guide: Wandurlust

Follow these steps to set up and run the Wandurlust project on your local machine.

## 📋 Prerequisites
Before you begin, ensure you have the following installed:
- **Node.js** (v18.x or higher recommended)
- **MongoDB** (Local instance or MongoDB Atlas)
- **Git**

## 🛠️ Step 1: Clone & Install
1. Open your terminal and navigate to your workspace.
2. Clone the repository (if you haven't already):
   ```bash
   git clone https://github.com/Tapesh-01/Wandurlust.git
   cd Wandurlust
   ```
3. Install the required npm packages:
   ```bash
   npm install
   ```

## 🔐 Step 2: Environment Configuration
The application requires several environment variables to function correctly.
1. Create a `.env` file in the root directory.
2. Add the following variables to the `.env` file:
   ```env
   # Database Connection
   ATLASDB_URL=your_mongodb_connection_string

   # Session Secret
   SECRET=your_super_secret_session_key

   # Cloudinary Credentials (for image uploads)
   CLOUD_NAME=your_cloudinary_cloud_name
   CLOUD_API_KEY=your_cloudinary_api_key
   CLOUD_API_SECRET=your_cloudinary_api_secret
   ```

## 🗃️ Step 3: Initialize Database (Optional)
If you want to seed the database with sample listing data:
1. Navigate to the `init` directory:
   ```bash
   cd init
   ```
2. Run the initialization script:
   ```bash
   node index.js
   ```
3. Go back to the root directory:
   ```bash
   cd ..
   ```

## 🚀 Step 4: Run the Application
You can start the server using the following command:
```bash
node app.js
```
The server will start on **port 8080** by default.

### 🌐 Accessing the App
Open your browser and visit: `http://localhost:8080`

## 🧪 Common Troubleshooting
- **Database Connection Error**: Ensure your MongoDB server is running or your ATLASDB_URL is correct.
- **Multer/Cloudinary Errors**: Verify your Cloudinary credentials in the `.env` file.
- **Port 8080 Already in Use**: Change the port in `app.js` (line 138) or terminate the process using that port.
