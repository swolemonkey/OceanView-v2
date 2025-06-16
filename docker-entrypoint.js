#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const env = { ...process.env }

// If running the web server then migrate existing database
if (process.argv.slice(-3).join(' ') === 'pnpm run start' || 
    process.argv.slice(-3).join(' ') === 'pnpm --dir=packages/server start:docker' ||
    process.argv.slice(-3).join(' ') === 'pnpm --dir=packages/server dev') {
  console.log("Starting database setup...")
  
  // prepare database
  console.log("Running database migrations...")
  await exec('npx prisma migrate deploy --schema=/app/packages/server/prisma/schema.prisma')
  
  // Run the seedAll script to ensure all mandatory rows exist
  console.log("Running database seeding...")
  await exec('pnpm tsx scripts/seedAll.ts')
  
  console.log("Database setup completed.")
}

// launch application
if (process.env.BUCKET_NAME) {
  await exec(`litestream replicate -config litestream.yml -exec ${JSON.stringify(process.argv.slice(2).join(' '))}`)
} else {
  await exec(process.argv.slice(2).join(' '))
}

function exec(command) {
  console.log(`Executing: ${command}`)
  const child = spawn(command, { shell: true, stdio: 'inherit', env })
  return new Promise((resolve, reject) => {
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} failed rc=${code}`))
      }
    })
  })
}
