# reinisvaravs.site

## 🚀 Calendar API Service

A robust Google Calendar integration service built with Node.js and Express, featuring:

### ✨ Features
- **Calendar Availability**: Check free/busy times across multiple Google Workspaces
- **Event Booking**: Create calendar events with automatic Google Meet integration
- **Multi-Workspace Support**: Handle multiple Google Workspace domains
- **Timezone Handling**: Support for multiple timezones with UTC conversion
- **Secure Authentication**: API key-based security with environment variables

### 🛠️ Tech Stack
- **Backend**: Node.js + Express
- **Google APIs**: Calendar API v3, Google Meet integration
- **Authentication**: Service Account with Domain-Wide Delegation
- **Development**: Nodemon for hot reloading

### 📁 Project Structure
```
reinisvaravs.site/
├── routes/           # API route handlers
├── tests/            # Comprehensive test suite
├── public/           # Static frontend files
├── gCalendar.js      # Google Calendar integration
├── server.js         # Main Express server
└── .env              # Environment configuration
```

### 🔧 Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure `.env` with Google credentials
4. Run development server: `npm run dev`

### 🧪 Testing
- **Comprehensive Tests**: `node tests/test_booking_best_case.js`
- **Real Meeting Booking**: `node tests/book_my_meeting.js`
- **Test Runner**: `node tests/run_tests.js --all`

### 🌐 API Endpoints
- **POST** `/n8n/get_calendar_availability` - Check calendar availability
- **POST** `/n8n/book_calendar_event` - Create calendar events with Google Meet

### 🔐 Security
- API key authentication required for all `/n8n` endpoints
- Google service account credentials stored securely in environment variables
- Domain-wide delegation for calendar access

---

**Built with ❤️ for seamless calendar integration**
