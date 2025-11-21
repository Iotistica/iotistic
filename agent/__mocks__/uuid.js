// Jest manual mock for uuid package
// Required because uuid v13+ is ESM-only and incompatible with Jest's CommonJS mode

module.exports = {
  v4: jest.fn(() => '00000000-0000-0000-0000-000000000000'),
  v1: jest.fn(() => '00000000-0000-0000-0000-000000000000'),
  v3: jest.fn(() => '00000000-0000-0000-0000-000000000000'),
  v5: jest.fn(() => '00000000-0000-0000-0000-000000000000'),
  validate: jest.fn(() => true),
  parse: jest.fn((uuid) => Buffer.from(uuid.replace(/-/g, ''), 'hex')),
  stringify: jest.fn((arr) => {
    const hex = Buffer.from(arr).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  })
};
