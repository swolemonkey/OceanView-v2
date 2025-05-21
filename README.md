# OceanView-v2 - A modern monorepo application for ocean data visualization.

A pnpm monorepo project.

## Project Structure

```
.
├── apps/       # Application packages
└── packages/   # Shared packages
```

## Development

### Prerequisites

- Node.js >=20.x
- pnpm >=10.0.0

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Available Scripts

- `pnpm build` - Build all packages and applications
- `pnpm dev` - Start development servers
- `pnpm lint` - Run linters
- `pnpm test` - Run tests
```

```bash
# first time
pnpm --filter server db:generate    # creates dev.db & Prisma client
pnpm tsx scripts/seedBots.ts        # After first db:generate, run to insert the Scalper bot

# dev loop
pnpm dev        # runs Fastify + Vite (SQLite – no Docker required)
```

### Testing
```bash
pnpm --filter server test
``` 