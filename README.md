# AudioBook Backend API

A robust, scalable backend API service for AudioBook management built with TypeScript, Express.js, and Prisma.

## Prerequisites

- Node.js **26.4.0**
- npm **11.17.0** (run `nvm use` / `fnm use` in this directory to match `.nvmrc`)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your actual configuration values

# Setup database (see docs/PRISMA_SETUP.md)
npm run db:generate
npm run db:push

# Start development server
npm run dev
```

## 🔐 Environment Setup

1. **Copy the template**: `cp .env.example .env`
2. **Edit `.env`** with your actual values:
   - Database credentials
   - JWT secrets (generate with `openssl rand -base64 32`)
   - API keys and other sensitive data
3. **Never commit `.env`** - it's already in `.gitignore`

**Important**: The `.env.example` file contains template values and is safe to commit. The actual `.env` file contains secrets and should never be committed to version control.

## Subscriptions

Subscription plans and user subscriptions are in **auth-service** (`/auth/subscription-plans`, `/auth/subscriptions`). This service evaluates audiobook tier gating via `AUTH_SERVICE_URL`. See [auth-service/docs/SUBSCRIPTIONS.md](../auth-service/docs/SUBSCRIPTIONS.md).

## 📚 Documentation

All documentation is available in the [`docs/`](./docs/) folder:

- **[📖 Complete Documentation](./docs/README.md)** - Overview and quick start guide
- **[🔌 API Reference](./docs/API_DOCUMENTATION.md)** - Complete API documentation
- **[🚀 Deployment Commands](./docs/DEPLOYMENT_COMMANDS.md)** - Environment setup and deployment guide
- **[💬 Message Management](./docs/MESSAGE_MANAGEMENT.md)** - Centralized message system
- **[🗄️ Database Setup](./docs/PRISMA_SETUP.md)** - Prisma configuration guide

## ✨ Features

- **RESTful API** with comprehensive CRUD operations
- **TypeScript** with strict type safety
- **MVC Architecture** following best practices
- **OOP Design** with modular, reusable components
- **API Versioning** with structured routing
- **Pagination & Filtering** for efficient data handling
- **Search Functionality** across multiple fields
- **Input Validation** with comprehensive error handling
- **Centralized Messages** for maintainability
- **Database Integration** with Prisma ORM
- **Security Features** with Helmet.js and CORS
- **Testing Suite** with Jest
- **Documentation** with comprehensive guides

## 🏗️ Architecture..

```
src/
├── config/           # Configuration & environment
├── controllers/      # HTTP request handlers
├── middleware/       # Express middleware
├── models/          # Data transfer objects
├── routes/          # API routing configuration
├── services/        # Business logic layer
├── types/           # TypeScript definitions
├── utils/           # Utility functions
└── tests/           # Test suites
```

## 🔧 Development

```bash
# Development
npm run dev          # Start with hot reload
npm run build        # Build for production
npm start           # Start production server

# Testing
npm test            # Run tests
npm run test:watch  # Watch mode
npm run test:coverage # With coverage

# Code Quality
npm run lint        # Check code style
npm run lint:fix    # Fix code style issues

# Database
npm run db:generate # Generate Prisma client
npm run db:push     # Push schema changes
npm run db:migrate  # Run migrations
npm run db:seed     # Seed initial data
npm run db:studio   # Open Prisma Studio
```

## 🌐 API Endpoints

- **Health Check**: `GET /api/health`
- **AudioBooks**: `GET /api/v1/audiobooks`
- **Search**: `GET /api/v1/audiobooks/search`
- **Statistics**: `GET /api/v1/audiobooks/stats`
- **By Genre**: `GET /api/v1/audiobooks/genre/:genre`
- **By Author**: `GET /api/v1/audiobooks/author/:author`

## 📖 Interactive API Documentation

Once the server is running, you can access:

- **Swagger UI**: `http://localhost:3000/api-docs` - Interactive API documentation
- **OpenAPI Spec**: `http://localhost:3000/api-docs.json` - Machine-readable API specification

All Srota backend services expose the same documentation URLs: `/api-docs` (UI) and `/api-docs.json` (spec). Authentication uses JWT `Authorization: Bearer <token>` (`bearerAuth` in the spec).

The API documentation is generated using a **code-first approach** with comprehensive schemas, examples, and interactive testing capabilities.

## 🛡️ Security & Best Practices

- Input validation and sanitization
- SQL injection protection
- XSS protection
- Security headers with Helmet.js
- CORS configuration
- Type-safe database operations
- Comprehensive error handling
- Centralized message management

## 📊 Tech Stack

- **Runtime**: Node.js 26.4.0
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Testing**: Jest
- **Linting**: ESLint
- **Security**: Helmet.js, CORS
- **Documentation**: Markdown

## 🤝 Contributing

1. Follow MVC and OOP patterns
2. Use TypeScript with strict typing
3. Write comprehensive tests
4. Update documentation
5. Follow centralized message management
6. Ensure linting passes

## 📄 License

ISC License

---

For detailed information, please refer to the [documentation](./docs/README.md).
