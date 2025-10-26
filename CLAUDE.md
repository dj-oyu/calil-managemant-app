
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.


# Hono CLI Development Guidelines

This file documents the development guidelines and design decisions for Hono CLI.

## Architecture Guidelines

### Command Structure

- Each command is placed in `src/commands/{command}/index.ts`
- Related logic is organized within the same directory
- Complex features are properly modularized

### File Separation Principles

- **Separation by Function**: e.g., built-in middleware map separated into `builtin-map.ts`
- **Testability**: Parts that can be benchmarked or tested independently become standalone modules
- **Reusability**: Components that can be used by other features are made common

## Design Decisions

### Testing Strategy

- **Vitest** used (fast, full TypeScript support)
- **Type Safety**: Minimize use of `any`
- **Mocking**: Proper type definitions for test reliability
- **Test Execution**: Run tests with `bun run test`

### Build Tools

- **Bun** as main package manager
- **tsup** for building
- **Production Build**: Use `bun run build` for production builds
- **Development Build**: Use `bun run watch` for development with auto-rebuild
- **esbuild** used in serve command (TypeScript/JSX transformation)

### Code Quality

- **ESLint + Prettier** for code quality maintenance
- **Format and Lint Fix**: Use `bun run format:fix && bun run lint:fix` to automatically fix formatting and linting issues
- **GitHub Actions** for CI/CD (Node.js 20, 22, 24 support)
- **Type Safety** focused implementation

## Development Principles

1. **Simplicity**: Avoid overly complex implementations
2. **Modularity**: Properly separate features for easy testing and reuse
3. **Type Safety**: Maximize TypeScript benefits
4. **Performance**: Focus on optimization, especially for compile command
5. **Developer Experience**: Aim for developer-friendly CLI
6. **Consistency**: Always refer to projects under <https://github.com/honojs> for implementation patterns and conventions
7. **Documentation**: Always update README when adding or modifying features

## Hono Documentation Reference

When you need information about Hono framework, APIs, or middleware, use the following CLI commands:

### Quick Documentation Access

- **`hono docs`** - Display main documentation summary
- **`hono docs <path>`** - View specific documentation pages directly in terminal
- **`hono search <query>`** - Search through Hono documentation with keyword matching

### Common Usage Examples

```bash
# Search for specific topics
hono search middleware
hono search "getting started"
hono search jwt
hono search cors

# View specific documentation
hono docs /docs/api/context
hono docs /docs/guides/middleware
hono docs /docs/concepts/routing
hono docs /examples/basic

# Get overview of all Hono features
hono docs
```

### URL Path Conversion

For efficient documentation access from web URLs, convert paths using the following rule:

- `https://hono.dev/docs/middleware/builtin/basic-auth` → `hono docs /docs/middleware/builtin/basic-auth`
- `https://hono.dev/docs/api/context` → `hono docs /docs/api/context`
- `https://hono.dev/examples/basic` → `hono docs /examples/basic`

Simply remove the `https://hono.dev` portion and append the path to the `hono docs` command to access documentation directly in the terminal.

**Important**: When you need to fetch information from Hono documentation (e.g., `https://hono.dev/docs/middleware/builtin/basic-auth`), always use the `hono docs` command instead of WebFetch. For example:

- Instead of: `WebFetch(https://hono.dev/docs/middleware/builtin/basic-auth)`
- Use: `hono docs /docs/middleware/builtin/basic-auth`

### Recommended Workflow

1. **Search first**: Use `hono search <keyword>` to find relevant documentation
2. **View locally**: Use the provided `hono docs` command from search results to read full content
3. **Reference online**: Use the URL from search results for detailed browsing if needed

This approach ensures you have quick access to accurate, up-to-date Hono information without leaving the terminal.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Package Manager**: Bun
- **Build Tool**: tsup
- **Testing Framework**: Vitest
- **Linter**: ESLint + Prettier
- **CI/CD**: GitHub Actions