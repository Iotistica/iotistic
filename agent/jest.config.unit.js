/**
 * Jest configuration for UNIT tests only
 * Tests that mock all external dependencies
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  testMatch: ['**/*.unit.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|chai|chai-as-promised|sinon-chai)/)'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/migrations/**',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage/unit',
  verbose: true,
  displayName: 'Unit Tests',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/test/tsconfig.json'
    }]
  }
};
