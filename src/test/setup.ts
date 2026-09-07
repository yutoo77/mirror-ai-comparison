import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Cold lazy-route transforms can exceed the library's default 1s on Windows.
configure({ asyncUtilTimeout: 3000 });
