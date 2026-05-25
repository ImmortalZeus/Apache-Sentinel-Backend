import type { Config } from 'jest'

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.spec.ts'],
    moduleNameMapper: {
        '^dto/(.*)$': '<rootDir>/src/dto/$1',
        '^entities/(.*)$': '<rootDir>/src/entities/$1',
        '^services/(.*)$': '<rootDir>/src/services/$1',
        '^utils/(.*)$': '<rootDir>/src/utils/$1',
        '^routes/(.*)$': '<rootDir>/src/routes/$1',
        '^detectors/(.*)$': '<rootDir>/src/detectors/$1',
        '^middleware/(.*)$': '<rootDir>/src/middleware/$1',
        '^controllers/(.*)$': '<rootDir>/src/controllers/$1',
        '^config\\.json$': '<rootDir>/src/config.json'
    },
    clearMocks: true,
    collectCoverageFrom: ['src/**/*.ts', '!src/__tests__/**', '!src/server.ts']
}

export default config
