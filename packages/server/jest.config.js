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
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^onnxruntime-node$': '<rootDir>/__mocks__/onnxruntime-node.js',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
}; 