# Calil Management App

A web application for managing library books using the [Calil API](https://calil.jp/). Built with Hono and Bun, this app provides a modern interface for tracking books you want to read and books you've already read.

## Features

- 📚 **Book List Management**: Manage "wish to read" and "already read" book lists from Calil
- 🔍 **NDL Search Integration**: Fetch detailed book information from the National Diet Library (NDL) OpenSearch API
- 🖼️ **Cover Image Caching**: Automatic caching of book cover images for improved performance
- 🔐 **Authentication**: Secure authentication using Puppeteer for Calil API access
- 📊 **Application Logging**: Built-in logging system with web-based log viewer
- ⚡ **Fast Performance**: Built on Bun runtime for optimal speed

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast all-in-one JavaScript runtime
- **Framework**: [Hono](https://hono.dev) - Ultrafast web framework
- **Automation**: [Puppeteer](https://pptr.dev) - Headless browser for authentication
- **XML Parsing**: fast-xml-parser for NDL API responses

## Installation

Install dependencies:

```bash
bun install
```

## Usage

### Development Mode

Run the application with hot reload:

```bash
bun run dev
```

### Production Mode

Run the application:

```bash
bun run start
```

The server will start at `http://localhost:8787`

### Available Endpoints

- `/` - Main book list interface with tabs for wish and read books
- `/api/books/:isbn` - Fetch detailed book information from NDL
- `/api/cover/:isbn` - Get cached book cover image
- `/log` - View application logs
- `/auth/*` - Authentication endpoints

### Building Binaries

Build standalone executables for different platforms:

```bash
# Build for all platforms
bun run build:binary

# Build for specific platforms
bun run build:binary:linux
bun run build:binary:windows
bun run build:binary:mac
```

Binaries will be created in the `dist/` directory.

## Project Structure

```
├── src/
│   ├── app/           # Application server and routes
│   ├── features/      # Feature modules
│   │   ├── calil/     # Calil API integration
│   │   ├── ndl/       # NDL search utilities
│   │   ├── covers/    # Cover image caching
│   │   └── auth/      # Authentication
│   └── shared/        # Shared utilities
├── client/            # Client-side scripts
└── index.tsx          # Application entry point
```

## License

This project is private.
