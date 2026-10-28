import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/** Abbreviations the coding rules forbid in names: write the full word. */
const ABBREVIATIONS = [
  'e', 'ev', 'evt', 'err', 'btn', 'el', 'elem', 'idx', 'cfg', 'conf', 'msg', 'tmp', 'temp', 'val', 'res', 'req',
  'cb', 'fn', 'func', 'ctx', 'args', 'arg', 'params', 'param', 'opts', 'opt', 'prop', 'props', 'attr', 'attrs',
  'ref', 'obj', 'arr', 'str', 'num', 'len', 'cnt', 'img', 'src', 'dst', 'dir', 'doc', 'win', 'btns', 'sel', 'cur',
  'prev', 'min', 'max', 'sec', 'ms', 'ts', 'pct', 'cfgs', 'iter', 'init', 'calc', 'sub', 'reg', 'perm', 'pos',
]

/**
 * Structure rules start at the worst value found in the source when they were added (depth 3, nested callbacks 2,
 * 42 lines), and are lowered one cleanup issue at a time. Naming rules warn, and `npm run lint` fails when the
 * number of warnings grows, so the count only goes down.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'parity', 'tools'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 2],
      'max-lines-per-function': ['error', { max: 42, skipBlankLines: true, skipComments: true }],
      'id-denylist': ['warn', ...ABBREVIATIONS],
      'id-length': ['warn', { min: 2, properties: 'never', exceptions: ['x', 'y'] }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // describe and it blocks nest by design and are not functions in the sense of the rule
    files: ['src/**/*.test.ts'],
    rules: { 'max-nested-callbacks': ['error', 4], 'max-lines-per-function': 'off' },
  },
)
