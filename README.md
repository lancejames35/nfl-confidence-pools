# NFL Confidence Pools Platform

A comprehensive, professional-grade web platform for hosting NFL confidence pools, survivor leagues, and squares games. Built with mobile-first design principles, real-time features, and extensive customization options.

## 🏈 Features

### Core Pool Types
- **Confidence Pools** - Straight up or against spread picking with drag & drop interface
- **Survivor Leagues** - Single/double/triple elimination formats (Phase 2)
- **Squares Pools** - 10x10 grids with flexible payout systems (Phase 3)

### Key Differentiators
- **Multi-theme System** - Per-league visual customization
- **Multiple Entries** - Users can have multiple entries per league
- **Real-time Chat** - League-specific chat with reactions and mentions
- **Drag & Drop Picks** - Intuitive confidence point assignment
- **Advanced Tiebreakers** - MNF totals, custom questions, multiple levels
- **Mobile-First Design** - Optimized for phone usage during games

### Advanced Features
- **Auto-save Picks** - Changes saved instantly as you make them
- **Live Notifications** - Email, SMS, push, and in-app notifications
- **Comprehensive Admin Tools** - League management and member administration
- **Audit Logging** - Complete activity tracking
- **Social Features** - Chat, reactions, mentions, file sharing

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- MySQL 8.0+
- npm 8+

### Installation

1. **Clone and setup**
   ```bash
   cd pools-app
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and other settings
   ```

3. **Database Setup**
   - Your MySQL database should already have all tables created
   - Update the database connection settings in `.env`:
   ```
   DATABASE_HOST=your-host
   DATABASE_USER=your-username
   DATABASE_PASSWORD=your-password
   DATABASE_NAME=pools
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`

### Production Deployment
```bash
npm start
```

## 🛠 Technology Stack

### Backend
- **Node.js** + **Express.js** - Web framework
- **EJS** + **express-ejs-layouts** - Template engine with layouts
- **MySQL** + **mysql2** - Database with connection pooling
- **Socket.io** - Real-time WebSocket communication
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **express-session** - Session management with MySQL storage

### Frontend
- **Bootstrap 5.3.0** - Mobile-first responsive CSS framework
- **jQuery** - DOM manipulation and AJAX
- **SortableJS** - Drag and drop functionality
- **Socket.io Client** - Real-time client features

### Security & Middleware
- **helmet** - Security headers
- **express-rate-limit** - Rate limiting
- **express-validator** - Input validation and sanitization
- **cors** - Cross-origin resource sharing

### Utilities
- **winston** - Logging
- **nodemailer** - Email notifications
- **multer** - File uploads
- **moment** - Date/time handling
- **lodash** - Utility functions

## 📱 Mobile-First Design

The platform is designed mobile-first with:
- **Large touch targets** (44px minimum)
- **Thumb-friendly navigation** at bottom of screen
- **Fast loading** with optimized assets
- **Progressive Web App** features
- **Responsive design** across all devices

## 🎨 Theme System

Each league can choose from 4 distinct themes:

1. **Clean Sports Modern** - Professional, ESPN-like design
2. **Bold Game Day** - High-contrast, energetic game day feel
3. **Classic Fantasy** - Friendly, approachable fantasy football vibe
4. **Premium Dark Mode** - Sleek, high-tech dark theme

Themes control colors, fonts, styling, and overall visual identity per league.

## 🏗 Architecture

### Project Structure
```
pools-app/
├── app.js              # Main application entry point
├── package.json        # Dependencies and scripts
├── config/             # Configuration files
│   ├── database.js     # Database connection and utilities
│   ├── socket.js       # Socket.io configuration
│   └── themes.js       # Theme system configuration
├── controllers/        # Route handlers and business logic
├── middleware/         # Authentication, validation, error handling
│   ├── auth.js         # Authentication middleware
│   ├── validation.js   # Input validation
│   ├── errorHandler.js # Global error handling
│   └── rateLimit.js    # Rate limiting configurations
├── models/             # Database models and queries
├── routes/             # API endpoints and web routes
│   └── auth.js         # Authentication routes
├── views/              # EJS templates
│   ├── layouts/        # Layout templates
│   ├── auth/           # Authentication pages
│   ├── leagues/        # League management pages
│   ├── picks/          # Picks interface pages
│   └── dashboard/      # Dashboard pages
├── public/             # Static assets
│   ├── css/            # Stylesheets
│   ├── js/             # Client-side JavaScript
│   ├── img/            # Images
│   └── themes/         # Theme-specific assets
├── services/           # Business logic services
├── sockets/            # Socket.io event handlers
├── jobs/               # Background jobs and cron tasks
├── utils/              # Helper functions
└── docs/               # Documentation
    └── BLUEPRINT.md    # Complete development blueprint
```

### Database Schema
The application uses 25 MySQL tables supporting:
- **User Management** - Authentication, profiles, preferences
- **League System** - Multi-league support with customization
- **Pool Types** - Confidence, survivor, and squares pools
- **Real-time Chat** - Messages, reactions, threading
- **Notification System** - Multi-channel delivery
- **Audit Logging** - Complete activity tracking

## 🔧 Configuration

### Environment Variables
See `.env.example` for all configuration options including:
- Database connection settings
- JWT and session secrets
- Email/SMS service configuration
- API keys for external services
- Security and rate limiting settings

### Database Connection
The app uses MySQL connection pooling for performance:
```javascript
// Configured in config/database.js
const pool = mysql.createPool({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    connectionLimit: 10,
    acquireTimeout: 60000,
    // ... additional options
});
```

## 🔐 Security Features

- **Password Hashing** - bcrypt with salt rounds
- **JWT Authentication** - Secure token-based auth
- **Session Management** - MySQL-backed sessions
- **Input Validation** - Comprehensive validation middleware
- **Rate Limiting** - Multiple limiters for different endpoints
- **Security Headers** - Helmet.js protection
- **CORS Configuration** - Proper cross-origin handling
- **XSS Protection** - Input sanitization
- **SQL Injection Prevention** - Parameterized queries

## 🚀 Performance Optimizations

- **Connection Pooling** - Database connection reuse
- **Compression** - Gzip compression for responses  
- **Static Asset Caching** - Optimized cache headers
- **Image Optimization** - Sharp for image processing
- **Lazy Loading** - Efficient data loading patterns
- **Background Jobs** - Heavy operations moved to background

## 📊 Real-time Features

### Socket.io Implementation
- **League Rooms** - Separate channels per league
- **Live Chat** - Real-time messaging with reactions
- **Pick Updates** - Auto-save with live commissioner view
- **Score Updates** - Live game score broadcasts
- **Presence System** - Online/offline user status
- **Typing Indicators** - Chat typing status

### Event Types
- Chat messages and reactions
- Pick updates and deadline warnings
- Score updates and standings changes
- User presence and league activity
- Administrative notifications

## 🧪 Development

### Development Commands
```bash
npm run dev     # Start development server with nodemon
npm start       # Start production server
npm run lint    # Run ESLint
npm test        # Run tests (when implemented)
```

### Development Server Features
- **Auto-restart** with nodemon
- **Error logging** with stack traces
- **Request logging** with Morgan
- **Source maps** for debugging
- **Environment detection** for dev-specific features

### Code Structure Guidelines
- **MVC Architecture** - Clear separation of concerns
- **Middleware Pattern** - Reusable request processing
- **Service Layer** - Business logic abstraction
- **Error Handling** - Consistent error processing
- **Input Validation** - Comprehensive validation middleware
- **Database Abstraction** - Utility methods for common operations

## 🔄 API Endpoints

### Authentication
```
POST /auth/register     # User registration
POST /auth/login        # User login
POST /auth/logout       # User logout
POST /auth/forgot-password # Password reset request
POST /auth/reset-password/:token # Password reset confirmation
```

### Leagues (coming in next phases)
```
GET    /api/leagues                 # User's leagues
POST   /api/leagues                 # Create league
GET    /api/leagues/:id             # League details
PUT    /api/leagues/:id             # Update league
DELETE /api/leagues/:id             # Delete league
```

### Real-time WebSocket Events
```javascript
// Chat events
socket.emit('join_league', {leagueId})
socket.emit('chat_message', {leagueId, message})
socket.emit('message_reaction', {messageId, emoji})

// Pick events  
socket.emit('pick_update', {leagueId, entryId, gameId, team, confidence})

// Score events (broadcast)
socket.on('score_update', {gameId, homeScore, awayScore})
socket.on('standings_update', {week, newStandings})
```

## 📱 Progressive Web App

The platform includes PWA features:
- **Service Worker** - Offline capabilities
- **App Manifest** - Install as native app
- **Push Notifications** - Background notifications
- **Offline Support** - Cache critical resources
- **App-like Experience** - Native app feel

## 🎯 Roadmap

### Phase 1: MVP (Confidence Pools) ✅
- User authentication and profiles
- League creation and management  
- Confidence pool picks with drag & drop
- Basic scoring and standings
- Real-time chat system
- Email notifications

### Phase 2: Enhanced Features
- Survivor league support
- Advanced notification system (SMS, push)
- Multiple entries per user
- Advanced tiebreaker systems
- Comprehensive admin tools
- Performance optimization

### Phase 3: Premium Features
- Squares pool support
- Payment integration
- Advanced analytics
- Mobile app (React Native)
- API for third-party integrations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For questions, issues, or support:
- Create an issue in the repository
- Contact the development team
- Check the documentation in `/docs/`

---

**Built with ❤️ for NFL fans everywhere**