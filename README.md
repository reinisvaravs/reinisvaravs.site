# Setinbound Calendar & Email API Service

## 🚀 Overview

A comprehensive Google Calendar and Gmail integration service built with Node.js and Express. This API provides robust calendar management, event booking, and professional email sending capabilities for business automation workflows.

## ✨ Key Features

### 📅 Calendar Management

- **Calendar Availability**: Check free/busy times across multiple Google Workspaces
- **Event Booking**: Create calendar events with automatic Google Meet link generation
- **Multi-Workspace Support**: Handle multiple Google Workspace domains seamlessly
- **Timezone Handling**: Full timezone support with automatic UTC conversion
- **Domain-Wide Delegation**: Service account impersonation for enterprise security

### 📧 Email System

- **Professional HTML Emails**: Beautiful, responsive email templates
- **Custom Branding**: Fully customizable company branding and messaging
- **Dynamic Content**: Conditional rendering based on available event data
- **Multiple Recipients**: Send to multiple attendees with one API call
- **Gmail API Integration**: Secure email sending via service account impersonation

### 🔒 Security & Authentication

- **API Key Protection**: Secure endpoint access with authentication headers
- **Environment Variables**: All secrets stored securely in `.env`
- **Service Account Authentication**: Google service account with Domain-Wide Delegation
- **Input Validation**: Comprehensive request validation and error handling

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Google APIs**: Calendar API v3, Gmail API v1
- **Authentication**: Google Service Account with Domain-Wide Delegation (DWD)
- **Development**: Nodemon for hot reloading and development efficiency
- **Testing**: Custom test suite with comprehensive validation

## 📁 Project Structure

```
reinisvaravs.site/
├── routes/                    # API route handlers
│   ├── n8n.js                # Main business logic endpoints
│   ├── api.js                # General API routes
│   └── public.js             # Public frontend routes
├── tests/                    # Comprehensive test suite
│   ├── test_availability.js  # Calendar availability tests
│   ├── test_event_booking.js # Event booking tests
│   └── test_email_sending.js # Email sending tests
├── public/                   # Static frontend files
├── gCalendar.js             # Google Calendar integration logic
├── emailService.js          # Gmail API and email template service
├── db.js                    # Database utilities
├── server.js                # Main Express server
├── package.json             # Dependencies and scripts
├── nodemon.json             # Development configuration
└── .env                     # Environment variables (not in repo)
```

## 🔧 Setup & Installation

### Prerequisites

- Node.js (v16 or higher)
- Google Cloud Platform account
- Google Workspace with Domain-Wide Delegation configured

### Installation Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd reinisvaravs.site
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file with:

   ```env
   API_SECRET=your_api_secret_key
   GOOGLE_CREDENTIALS=your_google_service_account_json
   PORT=8383
   ```

   **Note**: The `.env` file is ignored by git for security. Only environment variables for secrets are stored here - all other configuration comes from request bodies.

4. **Setup Google Service Account**

   - Create a service account in Google Cloud Console
   - Enable Calendar API and Gmail API
   - Configure Domain-Wide Delegation in Google Workspace Admin
   - Add required scopes:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.compose`

5. **Start the development server**
   ```bash
   npm run dev
   ```

## 🌐 API Endpoints

### Calendar Management

#### **POST** `/n8n/get_calendar_availability`

Check calendar availability for specific time periods.

**Required Headers:**

```
x-api-key: YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**

```json
{
  "google_calendar_email": "calendar@company.com",
  "timezone": "Europe/Riga",
  "days": 7,
  "work_start_hour": 9,
  "work_end_hour": 17,
  "slot_duration_minutes": 60
}
```

#### **POST** `/n8n/book_calendar_event`

Create calendar events with Google Meet integration.

**Request Body:**

```json
{
  "event_title": "Strategy Meeting",
  "event_description": "Quarterly planning session",
  "start_time": "2025-08-28T10:00:00+03:00",
  "end_time": "2025-08-28T11:30:00+03:00",
  "timezone": "Europe/Riga",
  "attendees": ["user1@company.com", "user2@company.com"],
  "google_calendar_email": "calendar@company.com"
}
```

### Email System

#### **POST** `/n8n/send_event_email`

Send professional HTML event confirmation emails.

**Request Body:**

```json
{
  "event_title": "Board Meeting",
  "event_description": "Monthly board meeting",
  "start_time": "2025-08-28T14:00:00+02:00",
  "end_time": "2025-08-28T16:00:00+02:00",
  "timezone": "Europe/Berlin",
  "attendees": ["user1@company.com", "user2@company.com"],
  "meet_link": "https://meet.google.com/abc-def-ghi",
  "event_link": "https://calendar.google.com/event/123",
  "organizer_name": "John Smith",
  "organizer_email": "john@company.com",
  "impersonate_email": "admin@company.com",

  "company_name": "ACME Corporation",
  "email_subject_prefix": "Meeting Invitation",
  "email_header_title": "Meeting Confirmed",
  "email_header_subtitle": "Your meeting has been scheduled",
  "footer_company_name": "ACME Corp Calendar System",
  "footer_message": "This is an automated confirmation",
  "sender_name": "John Smith, CEO"
}
```

## 🧪 Testing

The project includes comprehensive tests for all major functionality (tests are not included in git but available locally during development):

### Run Individual Tests

```bash
# Test calendar availability
node tests/test_availability.js

# Test event booking (full flow)
node tests/test_event_booking.js

# Test email sending (with custom branding)
node tests/test_email_sending.js
```

**Note:** Test files are excluded from version control for security (they contain API calls with real credentials).

### Test Features

- ✅ **Calendar Availability**: Real-time free/busy checking
- ✅ **Event Booking**: Full event creation with Google Meet links
- ✅ **Email Sending**: Professional HTML emails with custom branding
- ✅ **Error Handling**: Comprehensive validation and error responses
- ✅ **Authentication**: Service account and API key validation
- ✅ **Timezone Support**: Multi-timezone handling and conversion

## 🎨 Email Template Features

### Dynamic Content Rendering

- Event details only show if data is provided
- Organizer information conditionally displayed
- Google Meet and Calendar links appear when available
- Custom branding throughout the template

### Professional Design

- Responsive HTML template compatible with all email clients
- Clean, minimal design with professional typography
- Custom company branding and messaging
- Mobile-friendly responsive layout

### Customization Options

- **Company Branding**: Full company name and footer customization
- **Subject Lines**: Custom prefixes and formatting
- **Header Content**: Personalized titles and subtitles
- **Footer Messages**: Custom footer text and branding
- **Organizer Display**: Professional sender information

## 🔐 Security Best Practices

### Environment Variables

- All secrets stored in `.env` file (never committed to repository)
- Service account credentials loaded from environment
- API keys validated on every request
- Only secrets use environment variables - all other configuration comes from request bodies

### Google Authentication

- Service account with Domain-Wide Delegation
- Minimal required scopes for Calendar and Gmail APIs
- Secure impersonation for multi-workspace support

### Input Validation

- Comprehensive request body validation
- Email format verification
- Timezone and datetime validation
- Attendee array validation

## 🚀 Development

### Development Server

```bash
npm run dev  # Starts with nodemon for auto-reload
```

### Production Server

```bash
npm start    # Standard Node.js server
```

### Hot Reloading

Nodemon is configured to watch all relevant files and restart automatically on changes.

### Version Control

**Files included in git:**

- All source code (`*.js`)
- Core configuration (`package.json`)
- Documentation (`README.md`)
- Route handlers (`routes/`)

**Files ignored by git:**

- Environment variables (`.env`, `.env.*`)
- Dependencies (`node_modules/`)
- Development configuration (`nodemon.json`)
- Test suite (`tests/` directory)
- Temporary files (`uploads/`, `converted/`)
- System files (`.DS_Store`, logs)
- Build artifacts and cache files

## 📋 Requirements

### Google Cloud Setup

1. Enable Calendar API and Gmail API
2. Create service account with JSON key
3. Configure Domain-Wide Delegation in Google Workspace Admin
4. Add required API scopes

### Environment Configuration

- Node.js environment with all dependencies
- Secure `.env` file with all required variables (secrets only)
- Network access to Google APIs
- `nodemon.json` for development configuration (not in git)
- Comprehensive test suite in `tests/` directory (not in git)

## 🎯 Use Cases

Perfect for:

- **Business Automation**: Streamline meeting scheduling and confirmations
- **CRM Integration**: Automated calendar and email workflows
- **Multi-Tenant Applications**: Support multiple organizations
- **Professional Services**: Client meeting management and communication
- **Enterprise Workflows**: Scalable calendar and email automation

---

**Built with ❤️ for seamless business automation**

_Empowering businesses through intelligent calendar and email automation_

---

_This README was enhanced with assistance from ChatGPT_
