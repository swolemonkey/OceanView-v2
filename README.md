# OceanView-v2

[![GitHub license](https://img.shields.io/github/license/swolemonkey/OceanView-v2)](https://github.com/swolemonkey/OceanView-v2/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/swolemonkey/OceanView-v2)](https://github.com/swolemonkey/OceanView-v2/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/swolemonkey/OceanView-v2)](https://github.com/swolemonkey/OceanView-v2/issues)

A modern trading bot with modular strategy architecture, enhanced SMC logic, and shared risk/reward management.

## Features

- **Modular Strategy Architecture**: Easily create and integrate new trading strategies
- **SMC Reversal Strategy**: Identify and capitalize on Supply and Demand zones
- **Risk Management**: Built-in risk/reward calculation and position sizing
- **Real-Time Monitoring**: Monitor trading performance in real-time
- **Backtesting**: Test strategies against historical data

## Project Structure

```
.
├── apps/       # Application packages (frontend, backend, etc.)
├── packages/   # Shared packages (strategies, utilities, etc.)
├── scripts/    # Utility scripts
└── migrations/ # Database migrations
```

## Development

### Prerequisites

- Node.js >=20.x
- pnpm >=10.0.0
- Docker (optional, for containerized development)

### Setup

```bash
# Install dependencies
pnpm install

# Generate Prisma client and database
pnpm --filter server db:generate

# Seed initial data
pnpm tsx scripts/seedBots.ts

# Start development server
pnpm dev
```

### Available Scripts

- `pnpm build` - Build all packages and applications
- `pnpm dev` - Start development servers (Fastify + Vite)
- `pnpm lint` - Run linters
- `pnpm test` - Run tests

### Testing

```bash
# Run server tests
pnpm --filter server test
```

## Deployment

The application can be deployed using Docker or directly to platforms like Fly.io:

```bash
# Build Docker image
docker build -f Dockerfile.backend -t oceanview-v2 .

# Deploy to Fly.io
fly deploy
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all contributors who have helped shape this project
- Built with modern JavaScript/TypeScript tooling and libraries 