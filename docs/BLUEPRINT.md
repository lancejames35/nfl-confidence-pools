# NFL Confidence Pools Platform - Complete Development Blueprint

## Project Overview

Build a comprehensive web platform for hosting NFL confidence pools, survivor leagues, and squares games. This is a multi-pool hosting service where commissioners can create leagues with extensive customization options, and players can participate in multiple leagues with multiple entries each.

### Core Vision
- **Mobile-first design** - Most users will access on phones during games
- **Real-time experience** - Live chat, auto-saving picks, instant updates
- **Professional grade** - Support hundreds of leagues with thousands of users
- **Highly customizable** - Each league gets unique theming and rule sets
- **Multiple pool types** - Start with confidence pools, expand to survivor and squares

### Key Differentiators
- **Per-league visual themes** - Each league has its own look and feel
- **Multiple entries per user** - Users can have 3+ entries in same league
- **Advanced tiebreaker system** - MNF totals, custom questions, multiple levels
- **Drag & drop picks interface** - Intuitive confidence point assignment
- **Rich communication** - Threaded chat, reactions, mentions, notifications

## Technology Stack

### Backend Framework & Core
- **Node.js** - Runtime environment
- **Express.js** - Web application framework
- **EJS** - Template engine for server-side rendering
- **express-ejs-layouts** - Layout support for EJS

### Database & Storage
- **MySQL 2** (mysql2 package) - Database driver
- **Railway MySQL** - Hosted database service
- **express-mysql-session** - MySQL-based session storage

### Authentication & Security
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT token handling
- **express-session** - Session management
- **helmet** - Security headers middleware
- **cors** - Cross-origin resource sharing

### Validation & Middleware
- **express-validator** - Input validation and sanitization
- **connect-flash** - Flash messaging
- **morgan** - HTTP request logging
- **multer** - File upload handling

### Real-time Features
- **Socket.io** - WebSocket connections for chat and live updates
- **Socket.io namespaces** - Separate channels per league

### Data Processing
- **csv-parser** - CSV file processing for NFL data imports
- **papaparse** - CSV parsing (frontend)
- **lodash** - Utility functions
- **moment** - Date manipulation

### Frontend Libraries
- **Bootstrap 5.3.0** - CSS framework (via CDN)
- **jQuery** - JavaScript library for DOM manipulation
- **SortableJS** - Drag and drop library for picks interface

### Development & Infrastructure
- **nodemon** - Development server auto-restart
- **dotenv** - Environment variable management
- **Railway** - Cloud hosting platform
- **Railway CLI** - Deployment management

## Database Schema

The application uses a comprehensive 25-table MySQL database (already created) designed to support multiple pool types, extensive customization, and scalability.

### Core Tables Overview
- **users** - User accounts and profiles
- **leagues** - League configuration and settings
- **league_users** - User-league relationships
- **league_entries** - Multiple entries per user
- **games** - NFL game schedule
- **teams** - NFL team information
- **picks** - User picks for games
- **tiebreakers** - Tiebreaker predictions
- **results** - Game results
- **spreads** - Point spreads and odds
- **weekly_scores** - Weekly scoring and rankings
- **season_scores** - Season-long standings
- **confidence_pool_settings** - Confidence pool rules
- **survivor_pool_settings** - Survivor pool rules
- **squares_pool_settings** - Squares pool configuration
- **squares_assignments** - Square ownership
- **chat_messages** - League chat system
- **message_reactions** - Chat reactions
- **notifications** - User notifications
- **notification_preferences** - Notification settings
- **league_invitations** - Invitation system
- **payout_structures** - Prize distribution
- **scoring_rules** - Custom scoring rules
- **audit_logs** - Activity tracking
- **oauth_providers** - Social login support

## Application Architecture

### MVC Architecture
- **Models** - Handle database operations and data validation
- **Views** - EJS templates with theme-aware rendering
- **Controllers** - Process requests, coordinate between models and views
- **Services** - Reusable business logic (scoring, notifications, etc.)
- **Middleware** - Authentication, validation, error handling
- **Socket handlers** - Real-time communication logic

### Folder Structure
```
pools-app/
├── controllers/           # Route handlers and business logic
│   ├── authController.js
│   ├── leagueController.js
│   ├── pickController.js
│   ├── chatController.js
│   └── adminController.js
├── middleware/           # Authentication, validation, error handling
│   ├── auth.js
│   ├── validation.js
│   ├── errorHandler.js
│   └── rateLimit.js
├── models/              # Database models and queries
│   ├── User.js
│   ├── League.js
│   ├── Pick.js
│   ├── Game.js
│   └── Score.js
├── routes/              # API endpoints and web routes
│   ├── auth.js
│   ├── leagues.js
│   ├── picks.js
│   ├── api.js
│   └── admin.js
├── views/               # EJS templates
│   ├── layouts/
│   ├── auth/
│   ├── leagues/
│   ├── picks/
│   └── dashboard/
├── public/              # Static assets (CSS, JS, images)
│   ├── css/
│   ├── js/
│   ├── img/
│   └── themes/          # Per-league theme assets
├── services/            # Business logic services
│   ├── scoringService.js
│   ├── nflDataService.js
│   ├── emailService.js
│   └── notificationService.js
├── sockets/             # Socket.io handlers
│   ├── chatHandlers.js
│   ├── pickHandlers.js
│   └── scoreHandlers.js
├── jobs/                # Scheduled tasks
│   ├── scoreCalculation.js
│   ├── deadlineReminders.js
│   └── nflDataSync.js
├── utils/               # Helper functions
│   ├── database.js
│   ├── helpers.js
│   └── constants.js
└── config/              # Database, environment configs
    ├── database.js
    ├── socket.js
    └── themes.js
```

## API Design

### REST API Endpoints

#### Authentication & User Management
```
POST   /api/auth/register           # User registration
POST   /api/auth/login              # User login
POST   /api/auth/logout             # User logout
POST   /api/auth/forgot-password    # Password reset request
POST   /api/auth/reset-password     # Password reset completion
POST   /api/auth/verify-email       # Email verification
POST   /api/auth/resend-verification # Resend verification email

GET    /api/user/profile            # Get user profile
PUT    /api/user/profile            # Update user profile
GET    /api/user/preferences        # Get user preferences
PUT    /api/user/preferences/notifications # Update notification settings
POST   /api/user/upload-avatar      # Upload profile picture
PUT    /api/user/password           # Change password
DELETE /api/user/account            # Delete user account
```

#### League Management
```
GET    /api/leagues                    # User's leagues
POST   /api/leagues                    # Create league
GET    /api/leagues/:id                # League details
PUT    /api/leagues/:id                # Update league (commissioner)
DELETE /api/leagues/:id                # Delete league (commissioner)

GET    /api/leagues/:id/members        # League members
POST   /api/leagues/:id/join           # Join league (via code)
DELETE /api/leagues/:id/members/:userId # Remove member (commissioner)
PUT    /api/leagues/:id/members/:userId/role # Change role

GET    /api/leagues/:id/entries        # All entries in league
POST   /api/leagues/:id/entries        # Add additional entry
PUT    /api/leagues/:id/entries/:entryId # Update entry details
DELETE /api/leagues/:id/entries/:entryId # Remove entry
```

#### Picks & Tiebreakers (Combined Interface)
```
GET    /api/leagues/:id/picks/:week           # Get picks page data (games + tiebreakers)
GET    /api/leagues/:id/picks/:week/:entryId  # Specific entry picks
POST   /api/leagues/:id/picks/:week/:entryId  # Submit picks + tiebreakers
PUT    /api/leagues/:id/picks/:week/:entryId  # Update picks + tiebreakers
GET    /api/leagues/:id/picks/:week/deadline  # Check deadline status

# Individual pick operations (for drag & drop auto-save)
PUT    /api/picks/:pickId/confidence   # Update single pick confidence
PUT    /api/picks/:pickId/team         # Update team selection
PUT    /api/tiebreakers/:tiebreakerIds # Update tiebreaker predictions
```

#### Scoring & Standings
```
GET    /api/leagues/:id/standings              # Current season standings
GET    /api/leagues/:id/standings/:week        # Weekly standings
GET    /api/leagues/:id/scores/:entryId        # Individual entry performance
GET    /api/leagues/:id/scores/:entryId/:week  # Entry specific week
POST   /api/leagues/:id/calculate/:week        # Manual score calculation
```

#### Chat System
```
GET    /api/leagues/:id/chat                   # Get chat messages
POST   /api/leagues/:id/chat                   # Send message
PUT    /api/chat/:messageId                    # Edit message
DELETE /api/chat/:messageId                    # Delete message
POST   /api/chat/:messageId/react              # Add reaction
DELETE /api/chat/:messageId/react/:emoji       # Remove reaction
PUT    /api/chat/:messageId/pin                # Pin message
```

#### Invitations
```
GET    /api/leagues/:id/invitations            # League invitations
POST   /api/leagues/:id/invitations/email      # Send email invite
POST   /api/leagues/:id/invitations/code       # Create join code
PUT    /api/invitations/:id/revoke             # Revoke invitation
POST   /api/invitations/:code/accept           # Accept via join code
POST   /api/invitations/:id/respond            # Accept/decline email invite
```

#### Games & NFL Data
```
GET    /api/games/:week                        # Games for week
GET    /api/games/:gameId                      # Single game details
GET    /api/games/:gameId/result               # Game result
POST   /api/admin/games/sync                   # Sync NFL schedule
POST   /api/admin/results/update               # Update game results
```

### Socket.io Real-time Events

#### Chat Events
```javascript
// Join league room
socket.emit('join_league', {leagueId, userId})

// Live chat messages
socket.emit('chat_message', {leagueId, message})
socket.broadcast.to(leagueId).emit('new_message', messageData)

// Message reactions
socket.emit('message_reaction', {messageId, emoji})
socket.broadcast.to(leagueId).emit('reaction_update', {messageId, reactions})
```

#### Pick Updates (Auto-save)
```javascript
// Live pick updates (saved automatically on drag/drop)
socket.emit('pick_update', {leagueId, entryId, gameId, team, confidence})
// Note: Only commissioner sees live picks, others wait until deadline
```

#### Score & Game Updates
```javascript
// Live score updates during games
socket.broadcast.to('public').emit('score_update', {gameId, homeScore, awayScore})
socket.broadcast.to(leagueId).emit('standings_update', {week, newStandings})

// Deadline warnings
socket.broadcast.to(leagueId).emit('deadline_warning', {week, minutesLeft})

// New league member
socket.broadcast.to(leagueId).emit('member_joined', {userName, entryName})
```

## User Interface & Experience

### Mobile-First Design Principles
- **Large touch targets** (44px minimum)
- **Thumb-friendly navigation** at bottom of screen
- **Fast loading** with skeleton screens
- **Offline capability** for viewing data
- **Progressive Web App** features
- **Optimistic updates** - show changes immediately, sync in background

### Core Page Layouts

#### Picks Page (Primary Interface)
The picks page combines team selection, confidence point assignment, and tiebreaker submissions in one seamless interface.

**Mobile Layout Features:**
- **Drag & drop confidence ranking** with large touch targets
- **Auto-save functionality** - picks saved immediately on every change
- **Visual deadline countdown** - prominent timer showing time remaining
- **Entry selector** - dropdown for users with multiple entries
- **Integrated tiebreakers** - MNF total, custom questions at bottom
- **Team color coding** - subtle background tints for visual recognition
- **Spread display** - current betting lines clearly shown
- **Lock status indicators** - show which picks can still be changed

**Drag & Drop Implementation:**
- **Touch-friendly drag handles** clearly visible
- **Smooth animations** for reordering
- **Visual feedback** during drag operations
- **Haptic feedback** on mobile devices
- **Snap-to-position** when dropping
- **Undo capability** for accidental changes

#### League Dashboard
Central hub for league activity and navigation.

**Key Elements:**
- **Current rank/status** prominently displayed
- **Primary action button** - "Make Picks" or "View Results"
- **Activity feed** - recent chat messages, score updates
- **Quick stats** - weekly performance, season trend
- **Navigation shortcuts** - standings, chat, settings

#### Standings/Leaderboard
Real-time standings with rich performance data.

**Features:**
- **Week/Season toggle** with smooth transitions
- **Rank movement indicators** - arrows showing change
- **User highlighting** - current user's entries stand out
- **Performance trends** - hot/cold streaks visible
- **Expandable details** - tap for weekly breakdown
- **Search/filter** for large leagues

#### Chat Interface
Real-time communication hub for each league.

**Features:**
- **Threaded conversations** with reply support
- **Emoji reactions** for quick responses
- **@Mentions** with notifications
- **File/image sharing** capabilities
- **Message search** and history
- **Pinned messages** for important announcements

### Per-League Theme System

Each league can choose its own visual identity from four distinct themes:

#### Theme 1: Clean Sports Modern
- **Colors**: Navy primary (`#1a365d`), green accent (`#38a169`)
- **Typography**: Bold sans-serif (Roboto/Inter)
- **Style**: Minimal cards, subtle shadows, clean whitespace
- **Mood**: Professional, ESPN-like, easy to scan

#### Theme 2: Bold Game Day
- **Colors**: Forest green (`#22543d`), gold accent (`#d69e2e`)
- **Typography**: Athletic fonts (Oswald headers)
- **Style**: High contrast, bold buttons, prominent CTAs
- **Mood**: Energetic, exciting, game day atmosphere

#### Theme 3: Classic Fantasy
- **Colors**: Rich blue (`#2b6cb0`), orange highlights (`#ed8936`)
- **Typography**: Friendly fonts (Poppins/Open Sans)
- **Style**: Rounded corners, approachable design
- **Mood**: Fantasy football vibe, social and fun

#### Theme 4: Premium Dark Mode
- **Colors**: Dark gray (`#2d3748`), electric blue (`#4299e1`)
- **Typography**: Sleek, technical fonts
- **Style**: Dark theme, neon highlights, modern cards
- **Mood**: Premium, high-tech, night game feel

**Theme Implementation:**
- **Commissioner selects theme** during league creation
- **Live preview** shows picks page and standings in each theme
- **Consistent theming** across all league pages
- **CSS variables** for easy theme switching
- **Future expansion** - custom logos, team colors, backgrounds

### Navigation Structure

#### Mobile Navigation (Bottom Tab Bar)
```
┌─────────────────────┐
│ 🏠  📊  ⚡  💬  👤 │
│Home Rankings Picks Chat Me│
└─────────────────────┘
```

#### Desktop Navigation
- **Top navigation bar** with league selector
- **Sidebar navigation** for league-specific pages
- **Breadcrumb navigation** for deep pages

### Key User Flows

#### New User Registration → First League
1. **Registration** - Email/password or social login
2. **Profile setup** - Name, avatar, timezone
3. **Join league** - Via invite code or email
4. **Picks tutorial** - Interactive guide for drag & drop
5. **First picks submission** - Guided experience

#### Commissioner League Creation
1. **Basic details** - Name, entry fee, max participants
2. **Theme selection** - Live preview of 4 options
3. **Game rules** - Straight up vs spread, point system
4. **Advanced settings** - Tiebreakers, deadlines, payouts
5. **Invite members** - Email, join codes, direct links
6. **League launch** - Activate and notify members

#### Weekly Picks Workflow
1. **Deadline notification** - Email/push 24 hours before
2. **Picks page** - Games loaded, previous picks shown
3. **Team selection & confidence** - Drag & drop interface
4. **Tiebreaker submission** - MNF total or custom questions
5. **Auto-save confirmation** - Picks saved automatically
6. **Final review** - Summary before deadline
7. **Lock confirmation** - Picks locked at deadline

## Key Features & Functionality

### Core Pool Types

#### Confidence Pools (MVP)
- **Straight up or against spread** picking
- **Flexible point systems** - 1-16, 1-14, custom ranges
- **Drag & drop confidence assignment** with auto-save
- **Multiple tiebreaker systems** - MNF totals, custom questions
- **Weekly and season-long scoring**
- **Advanced deadline management** - per game or league-wide

#### Survivor Leagues (Phase 2)
- **Single/double/triple elimination** formats
- **Team reuse restrictions** - prevent picking same team twice
- **Rebuy mechanics** with cost multipliers
- **Late entry with penalty systems**
- **Elimination tracking and notifications**

#### Squares Pools (Phase 3)
- **10x10 grids** with random number assignment
- **Flexible payout systems** - quarterly vs final only
- **Multiple assignment methods** - first-come vs random
- **Trading and transfer capabilities**
- **Automated payouts based on scores**

### Advanced Features

#### Multiple Entries System
- **Users can have multiple entries** in same league
- **Separate team names** for each entry
- **Independent scoring** and rankings
- **Consolidated dashboard** showing all entries
- **Entry-specific chat and notifications**

#### Flexible Scoring Systems
- **JSON-based rule configuration** for maximum flexibility
- **Standard confidence scoring** - points = confidence value
- **Bonus systems** - perfect weeks, upset bonuses, high confidence
- **Penalty systems** - missed picks, late submissions
- **Playoff multipliers** and special event scoring
- **Custom point values** for different leagues

#### Real-time Communication
- **League-specific chat** with threaded conversations
- **@Mentions** with push notifications
- **Emoji reactions** for quick responses
- **File and image sharing**
- **System announcements** for scores, deadlines
- **Commissioner tools** - pin messages, moderate content

#### Advanced Tiebreakers
- **Multiple tiebreaker levels** - primary, secondary, tertiary
- **MNF total points** - classic tiebreaker
- **Margin of victory** predictions
- **Player statistics** - passing yards, touchdowns
- **Custom questions** - completely flexible
- **Automated scoring** with manual override options

#### Comprehensive Notifications
- **Multi-channel delivery** - email, SMS, push, in-app
- **Intelligent scheduling** - time zone aware
- **Batching and grouping** - avoid notification spam
- **User preference controls** - granular notification settings
- **Rich content** - action buttons, deep links
- **Retry mechanisms** with exponential backoff

#### Administrative Tools
- **Commissioner dashboard** with league management
- **Member management** - roles, permissions, removal
- **Score calculation tools** with manual override
- **Invitation system** - email, join codes, direct links
- **Audit logging** - complete activity tracking
- **Payout management** - automated calculations, manual adjustments

## Development Phases

### Phase 1: MVP (Confidence Pools)
**Timeline: Week 1-2**

**Core Features:**
- User authentication and profile management
- League creation and joining
- Confidence pool setup and configuration
- Picks interface with drag & drop
- Basic scoring and standings
- League chat system
- Email notifications for deadlines

**Pages to Build:**
- Registration/Login
- User dashboard
- League creation wizard
- Picks page (drag & drop interface)
- Standings/leaderboard
- League chat
- Basic settings

**Technical Infrastructure:**
- Database setup with all core tables
- User authentication system
- Real-time chat with Socket.io
- NFL data integration (manual entry for MVP)
- Basic email notification system
- Mobile-responsive design with Bootstrap

### Phase 2: Enhanced Features
**Timeline: Week 3-4**

**Additional Features:**
- Survivor league support
- Advanced notification system (SMS, push)
- Multiple entries per user
- Advanced tiebreaker systems
- Comprehensive admin tools
- Audit logging and activity tracking
- Performance optimization

**Technical Enhancements:**
- NFL API integration for automated data
- Background job processing
- Caching layer for performance
- Advanced validation and security
- Error handling and monitoring

### Phase 3: Premium Features
**Timeline: Future releases**

**Advanced Features:**
- Squares pool support
- Payment integration
- Advanced analytics and reporting
- Mobile app (React Native)
- API for third-party integrations
- Multi-season support

## Technical Implementation Guidelines

### Database Design Patterns
- **Consistent naming conventions** - snake_case for columns, clear prefixes
- **Proper indexing** - foreign keys, common query patterns
- **Data integrity** - foreign key constraints, proper data types
- **Scalability considerations** - partitioning for large data sets
- **JSON fields** for flexible configuration storage

### Performance Considerations
- **Database connection pooling** for high concurrency
- **Query optimization** with proper indexing
- **Caching strategies** - Redis for session data, frequent queries
- **Lazy loading** for large data sets
- **Image optimization** and CDN usage
- **Background job processing** for heavy operations

### Security Requirements
- **Password hashing** with bcryptjs
- **JWT token management** with proper expiration
- **Input validation** on all user inputs
- **Rate limiting** to prevent abuse
- **SQL injection prevention** with parameterized queries
- **XSS protection** with proper output encoding
- **CSRF protection** for state-changing operations

### Mobile Optimization
- **Responsive design** with Bootstrap grid system
- **Touch-friendly interfaces** with large tap targets
- **Fast loading** with optimized assets
- **Offline capabilities** with service workers
- **Progressive Web App** features
- **Performance monitoring** for mobile networks

### Error Handling & Monitoring
- **Comprehensive error logging** with stack traces
- **User-friendly error messages** without technical details
- **Graceful degradation** when services are unavailable
- **Health check endpoints** for monitoring
- **Performance metrics** tracking
- **Automated alerting** for critical issues

## NFL Data Integration

### Data Sources
- **Primary**: ESPN API or similar for schedule and scores
- **Backup**: Manual entry system for reliability
- **Spreads**: Integration with sportsbook APIs or manual entry
- **Real-time scores**: WebSocket feeds during games

### Data Management
- **Automated synchronization** with scheduled jobs
- **Manual override capabilities** for commissioners
- **Data validation** to catch inconsistencies
- **Historical data preservation** for analytics
- **Multiple timezone support** for game times

## Testing Strategy

### Unit Testing
- **Models and database operations**
- **Business logic services**
- **Utility functions**
- **API endpoint responses**

### Integration Testing
- **Database interactions**
- **External API integrations**
- **Email/notification systems**
- **Authentication flows**

### User Interface Testing
- **Cross-browser compatibility**
- **Mobile device testing**
- **Accessibility compliance**
- **Performance testing**

### Load Testing
- **Database performance under load**
- **Concurrent user scenarios**
- **Real-time features stress testing**
- **Peak usage simulation (Sunday game days)**

## Deployment & Infrastructure

### Hosting Platform
- **Railway** for application hosting
- **Railway MySQL** for database
- **Railway CLI** for deployment automation
- **Custom domain** with SSL certificate

### Environment Management
- **Development** - Local development environment
- **Staging** - Pre-production testing environment
- **Production** - Live application environment
- **Environment-specific configurations**

### Monitoring & Maintenance
- **Application performance monitoring**
- **Database performance tracking**
- **Error rate monitoring**
- **Uptime monitoring**
- **Automated backups**
- **Security updates and patching**

## Success Criteria

### MVP Success Metrics
- **User registration and engagement**
- **League creation and participation rates**
- **Picks submission rates and timeliness**
- **Chat activity and user interaction**
- **Mobile usage statistics**
- **Performance and reliability metrics**

### Technical Performance Goals
- **Page load times** < 2 seconds on mobile
- **API response times** < 500ms for common operations
- **Uptime** > 99.5% during NFL season
- **Mobile optimization** score > 90 on PageSpeed Insights
- **User satisfaction** measured through feedback and usage patterns