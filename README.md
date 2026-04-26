# 🌍 Wandurlust

**🌐 Live Demo:** [https://wandurlust-31y0.onrender.com](https://wandurlust-31y0.onrender.com)

**Wandurlust** is a full-stack web application inspired by Airbnb, designed to connect travelers with incredible places to stay. From finding the perfect vacation home to becoming a host and earning money, Wandurlust offers a seamless, premium, and fully featured platform for the modern explorer.

---

## ✨ Key Features

*   **User Authentication & Security**: Secure signup, login, and robust session management utilizing `passport` and `passport-local-mongoose`.
*   **Property Listings (CRUD)**: Hosts can create, read, update, and delete property listings. Image uploads are seamlessly handled using `multer` and stored securely on **Cloudinary**.
*   **Booking System:** Users can book available properties, view generated PDF tickets/receipts, and manage their trips.
*   **Host Dashboard**: A dedicated interface for property owners to manage their properties, view new booking notifications globally, and track recent reservations.
*   **Interactive Reviews**: Guests can review and leave ratings for properties they've stayed at, enhancing community trust.
*   **Real-Time Messaging**: Socket.io powered in-app chat between guests and hosts, with live unread badge notifications.
*   **Interactive Maps**: Leaflet.js powered maps on all listing pages — with GPS tracking, route planning, and a global discovery map on the listings index.
*   **🤖 WanderBot AI Assistant** *(New)*: A floating AI chatbot powered by the **Google Gemini API** that provides:
    *   **Live listing context** — knows all current properties, prices, locations fetched directly from MongoDB on every query.
    *   **Real-time availability** — tells users which properties are currently booked vs available.
    *   **Live weather** — fetches current weather for top listing destinations via `wttr.in`.
    *   **Multi-turn conversations** — maintains context across the chat session.
    *   **Multi-model fallback** — automatically tries `gemini-2.5-flash` → `2.0-flash` → `2.0-flash-lite` → `1.5-flash` for maximum reliability.
    *   Responds in Hindi, English, or Hinglish based on user's language.
*   **Responsive & Premium UI**: Built with a custom glassmorphism aesthetic, sleek animations, dark mode, and an intuitive layout.
*   **Global Error Handling**: Centralized error management with `connect-flash` messages for seamless user feedback.

---

## 🛠️ Tech Stack

### **Frontend**
*   **EJS (Embedded JavaScript)**: Powerful templating engine.
*   **CSS3**: Custom styles featuring glassmorphism, skeleton loaders, dark mode, and smooth animations.
*   **Bootstrap 5**: Responsive grid and UI components.
*   **Leaflet.js**: Interactive maps with GPS, routing, and clustering.

### **Backend**
*   **Node.js & Express.js**: Fast and scalable server-side framework.
*   **MongoDB & Mongoose**: NoSQL database for flexible data modeling.
*   **Socket.io**: Real-time bidirectional messaging.
*   **Google Gemini API** *(New)*: Powers the WanderBot AI assistant via raw REST calls.

### **Middleware & Tools**
*   **Passport.js**: Authentication middleware.
*   **Cloudinary**: Cloud-based image and video management.
*   **Multer**: Middleware for handling `multipart/form-data` (image uploads).
*   **connect-flash**: Flash messages for user actions.
*   **express-session**: Session management.
*   **Joi**: Data validation.
*   **wttr.in** *(New)*: Free weather API used by WanderBot for live weather data.

---

## 📂 Project Structure

```text
Wandurlust/
│
├── controllers/       # Route logic and business operations
├── models/            # Mongoose schemas (Listing, User, Review, Booking, Chat)
├── public/            # Static assets (CSS, JS, Images)
├── routes/            # Express router files
│   ├── listing.js
│   ├── review.js
│   ├── user.js
│   ├── booking.js
│   └── ai.js          # ← NEW: WanderBot AI chat route
├── services/          # ← NEW: Business logic services
│   └── wanderbot.js   # ← NEW: Gemini API calls, DB context building, weather fetch
├── utils/             # Utility classes and helper functions
├── views/             # EJS templates and UI components
│
├── .env               # Environment variables (see setup below)
├── app.js             # Main application entry point
├── middleware.js       # Custom Express middlewares
├── schema.js          # Joi validation schemas
└── package.json       # Project dependencies and scripts
```

---

## 🚀 Getting Started

### **Prerequisites**
*   [Node.js](https://nodejs.org/) (v18 or higher)
*   [MongoDB](https://www.mongodb.com/) (Local or MongoDB Atlas)
*   Cloudinary Account
*   Google Gemini API Key (free at [aistudio.google.com](https://aistudio.google.com/apikey))

### **Installation**

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Tapesh-01/Wandurlust.git
    cd Wandurlust
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Variables Setup**

    Create a `.env` file in the root directory:
    ```env
    # Database
    ATLASDB_URL=your_mongodb_connection_string

    # Server Session
    SECRET=your_super_secret_session_key

    # Cloudinary Config
    CLOUD_NAME=your_cloudinary_cloud_name
    CLOUD_API_KEY=your_cloudinary_api_key
    CLOUD_API_SECRET=your_cloudinary_api_secret

    # Google Gemini AI (for WanderBot)
    GEMINI_API_KEY=your_gemini_api_key
    ```

4.  **Run the application**
    ```bash
    node app.js
    # or with auto-reload:
    npx nodemon app.js
    ```
    The server will start on `http://localhost:8080`.

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Tapesh-01/Wandurlust/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License
This project is licensed under the **ISC License**.

---
*Built with ❤️ for passionate travelers and hosts.*
