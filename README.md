# 🌍 Wandurlust

**Wandurlust** is a full-stack web application inspired by Airbnb, designed to connect travelers with incredible places to stay. From finding the perfect vacation home to becoming a host and earning money, Wandurlust offers a seamless, premium, and fully featured platform for the modern explorer.

---

## ✨ Key Features

*   **User Authentication & Security**: Secure signup, login, and robust session management utilizing `passport` and `passport-local-mongoose`.
*   **Property Listings (CRUD)**: Hosts can create, read, update, and delete property listings. Image uploads are seamlessly handled using `multer` and stored securely on **Cloudinary**.
*   **Booking System:** Users can book available properties, view generated PDF tickets/receipts, and manage their trips.
*   **Host Dashboard**: A dedicated interface for property owners to manage their properties, view new booking notifications globally, and track recent reservations.
*   **Interactive Reviews**: Guests can review and leave ratings for properties they've stayed at, enhancing community trust.
*   **Responsive & Premium UI**: Built with a custom glassmorphism aesthetic, sleek animations, and an intuitive layout designed with HTML, CSS, and EJS templates.
*   **Global Error Handling**: Centralized error management to gracefully catch and display errors and `connect-flash` messages for seamless user feedback.

---

## 🛠️ Tech Stack

### **Frontend**
*   **EJS (Embedded JavaScript)**: Powerful templating engine.
*   **CSS3**: Custom styles featuring modern UI trends like glassmorphism and smooth animations.

### **Backend**
*   **Node.js & Express.js**: Fast and scalable server-side framework.
*   **MongoDB & Mongoose**: NoSQL database for flexible data modeling and robust ORM.

### **Middleware & Tools**
*   **Passport.js**: Authentication middleware.
*   **Cloudinary**: Cloud-based image and video management.
*   **Multer**: Middleware for handling `multipart/form-data` (image uploads).
*   **connect-flash**: Flash messages for user actions.
*   **express-session**: Session management.
*   **Joi**: Data validation.
*   **Nodemailer**: Email handling (where applicable).

---

## 🚀 Getting Started

Follow these instructions to set up the project locally on your machine.

### **Prerequisites**
Make sure you have the following installed:
*   [Node.js](https://nodejs.org/) (v14 or higher)
*   [MongoDB](https://www.mongodb.com/) (Local installation or MongoDB Atlas URI)
*   Cloudinary Account (For image uploads)

### **Installation**

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/wandurlust.git
    cd wandurlust
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Variables Setup**
    Create a `.env` file in the root directory and add the following keys:
    ```env
    # Database
    ATLASDB_URL=your_mongodb_connection_string

    # Server Session
    SECRET=your_super_secret_session_key

    # Cloudinary Config
    CLOUD_NAME=your_cloudinary_cloud_name
    CLOUD_API_KEY=your_cloudinary_api_key
    CLOUD_API_SECRET=your_cloudinary_api_secret
    ```

4.  **Run the application**
    ```bash
    # For development (using node or nodemon if installed globally)
    node app.js
    ```
    The server will start on `http://localhost:8080`.

---

## 📂 Project Structure

```text
Wandurlust/
│
├── controllers/       # Route logic and business operations
├── init/              # Database initialization scripts and sample data
├── models/            # Mongoose schemas (Listing, User, Review, Booking)
├── public/            # Static assets (CSS, JS, Images)
├── routes/            # Express router files
├── utils/             # Utility classes and helper functions (ExpressError)
├── views/             # EJS templates and UI components
│
├── .env               # Environment variables
├── app.js             # Main application entry point
├── middleware.js      # Custom Express middlewares
├── schema.js          # Joi validation schemas
└── package.json       # Project dependencies and scripts
```

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/yourusername/wandurlust/issues).

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
