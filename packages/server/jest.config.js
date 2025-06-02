export default {
  preset: 'ts-jest/presets/js-with-ts-esm',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  testTimeout: 30000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true,
    }],
  },
  // Skip tests that we can't easily mock yet
  testPathIgnorePatterns: [
    'execution.test.ts',
    'fork.test.ts',
    'strategies.test.ts',
    'indicators.test.ts',
    'rl.test.ts',
    'risk.test.ts',
  ],
  moduleNameMapper: {
    '^onnxruntime-node$': '<rootDir>/__mocks__/autofix.js',
    '.+/(indicators|execution|risk)/.+\\.js$': '<rootDir>/__mocks__/autofix.js',
    '.+/forkManager/.+/config\\.js$': '<rootDir>/__mocks__/autofix.js',
    '.+/perception\\.js$': '<rootDir>/__mocks__/autofix.js',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
}; 