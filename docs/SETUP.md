# Setup Guide

This guide will help you set up the NFL Confidence Pools Platform on your local machine or production server.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 16+** - [Download from nodejs.org](https://nodejs.org/)
- **MySQL 8.0+** - Your database is already set up with all tables
- **Git** - For cloning and version control
- **npm 8+** - Usually comes with Node.js

## Development Setup

### 1. Install Dependencies

From the `pools-app` directory:

```bash
npm install
```

This will install all required packages including:
- Express.js and middleware
- Socket.io for real-time features  
- MySQL database driver
- Authentication and security packages
- All other dependencies listed in package.json

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your specific settings:

```bash
# Required Settings
NODE_ENV=development
PORT=3000
DATABASE_HOST=localhost
DATABASE_USER=your-username
DATABASE_PASSWORD=your-password
DATABASE_NAME=pools
JWT_SECRET=your-super-secret-jwt-key-change-this
SESSION_SECRET=your-super-secret-session-key-change-this
```

**Important**: Generate strong, unique secrets for JWT_SECRET and SESSION_SECRET in production.

### 3. Database Connection

Your MySQL database should already be set up with all 25 tables. Verify your connection settings in `.env` match your database configuration.

Test the connection by starting the application - it will log connection success or failure.

### 4. Start Development Server

```bash
npm run dev
```

This starts the server with nodemon for auto-restart on file changes.

You should see:
```
✅ Database connected successfully
✅ Application initialized successfully
✅ Socket.io server initialized
🚀 Server running on port 3000
🌐 Environment: development
```

### 5. Access the Application

Open your browser to:
- **Application**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

## Production Deployment

### 1. Environment Setup

Set production environment variables:

```bash
NODE_ENV=production
PORT=3000
APP_URL=https://your-domain.com
DATABASE_HOST=your-production-db-host
# ... other production settings
```

### 2. Security Configuration

Generate strong secrets:
```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate session secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. SSL/HTTPS Setup

For production, configure SSL certificates and update your reverse proxy (nginx/Apache) to handle HTTPS.

### 4. Start Production Server

```bash
npm start
```

Or use a process manager like PM2:
```bash
npm install -g pm2
pm2 start app.js --name "pools-app"
pm2 startup
pm2 save
```

## Database Schema Verification

Your database should include these tables:
- `users` - User accounts and authentication
- `leagues` - League configuration  
- `league_users` - User-league relationships
- `league_entries` - Multiple entries per user
- `games` - NFL game schedule
- `teams` - NFL team information
- `picks` - User game selections
- `tiebreakers` - Tiebreaker predictions
- `results` - Game outcomes
- `chat_messages` - Real-time chat
- `notifications` - User notifications
- Plus 14 more supporting tables

## Service Configuration

### Email Service (Optional)

For password resets and notifications, configure SMTP:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### SMS Service (Optional)

For SMS notifications via Twilio:

```bash
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

## Development Tools

### Useful Commands

```bash
# Development server with auto-restart
npm run dev

# Production server
npm start

# Code linting
npm run lint

# View logs
tail -f logs/app.log
```

### Development URLs

- **Main App**: http://localhost:3000
- **Registration**: http://localhost:3000/auth/register  
- **Login**: http://localhost:3000/auth/login
- **Health Check**: http://localhost:3000/health
- **API Docs**: http://localhost:3000/api (coming soon)

## Testing the Setup

1. **Database Connection**: Check console for "✅ Database connected successfully"
2. **Socket.io**: Check console for "✅ Socket.io server initialized"  
3. **Registration**: Create a test user account
4. **Authentication**: Log in with test credentials
5. **Dashboard**: Access should redirect to dashboard when authenticated

## Troubleshooting

### Common Issues

**Database Connection Failed**
- Verify database credentials in `.env`
- Ensure MySQL service is running
- Check firewall settings
- Verify database name exists

**Port Already in Use**
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

**Missing Dependencies**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Permission Issues**
```bash
# Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) ~/.npm
```

### Log Files

Application logs are written to:
- `logs/error.log` - Error messages
- `logs/combined.log` - All log messages
- Console output in development mode

### Environment Variables

Required variables:
- `DATABASE_*` - Database connection
- `JWT_SECRET` - Authentication tokens
- `SESSION_SECRET` - Session encryption

Optional variables:
- `SMTP_*` - Email notifications
- `TWILIO_*` - SMS notifications
- `REDIS_*` - Caching (future)

## Next Steps

Once setup is complete:

1. **Create Admin User**: Register the first user (becomes admin)
2. **Configure Themes**: Test the 4 theme options
3. **Test Real-time**: Open multiple browser tabs to test chat
4. **Add NFL Data**: Import current season games (coming in next phases)
5. **Create Test League**: Test the full user flow

## Getting Help

If you encounter issues:

1. Check the logs in `logs/` directory
2. Verify all environment variables are set
3. Ensure database connection is working
4. Review the main README.md for detailed documentation
5. Check the BLUEPRINT.md for technical specifications

The platform is designed to be developer-friendly with comprehensive error logging and helpful console messages to guide you through any issues.