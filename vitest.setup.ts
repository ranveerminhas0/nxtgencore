import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake';
process.env.DISCORD_TOKEN = 'fake-token';
