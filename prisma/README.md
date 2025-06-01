# Prisma Configuration

## Schema Location

The main Prisma schema is located at `./prisma/schema.prisma`. When generating the Prisma client, make sure to specify this schema:

```bash
npx prisma generate --schema=./prisma/schema.prisma
```

## Model Naming Conventions

Note that while models are defined with uppercase names in the schema (e.g., `model Bot`), the Prisma client uses lowercase property names (e.g., `prisma.bot`).

## Troubleshooting

If you encounter TypeScript errors like:

```
Property 'bot' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'
```

Make sure you've generated the Prisma client using the correct schema file as mentioned above. 