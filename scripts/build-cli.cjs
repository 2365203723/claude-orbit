// 把 orbit CLI 编译成单文件 CommonJS,打包后随 extraResources 分发
const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.join(__dirname, '..', 'src', 'cli', 'orbit.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: path.join(__dirname, '..', 'out', 'cli', 'orbit.cjs'),
  // node 内置 + 原生模块保持 external
  external: ['node-pty', 'electron'],
}).then(() => {
  console.log('✓ orbit CLI built → out/cli/orbit.cjs');
}).catch((e) => { console.error(e); process.exit(1); });
