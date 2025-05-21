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

### Local DB
```bash
docker compose up -d timescaledb
pnpm --filter server db:generate
```

### Quick Start
```bash
docker compose up -d timescaledb redis
pnpm --filter server dev     # will start polling CoinGecko every 5 s
``` 