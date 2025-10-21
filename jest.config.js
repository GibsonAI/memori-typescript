export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|@prisma)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Ensure proper test teardown
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 30000,
  // Clear mocks and modules between tests
  clearMocks: true,
  restoreMocks: true,
  // Optimized database setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup/database/jest-setup.ts'],
  globalSetup: '<rootDir>/tests/setup/database/global-setup.ts',
  globalTeardown: '<rootDir>/tests/setup/database/global-teardown.ts',
};