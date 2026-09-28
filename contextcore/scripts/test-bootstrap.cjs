const os = require('node:os');

// tsx falls back to os.userInfo() for its temp directory suffix on Windows.
// Restricted environments can fail that account lookup with ENOMEM.
if (typeof process.geteuid !== 'function') {
  process.geteuid = () => -1;
}

try {
  os.userInfo();
} catch {
  Object.defineProperty(os, 'userInfo', {
    configurable: true,
    value: () => ({
      uid: -1,
      gid: -1,
      username: process.env.USERNAME || process.env.USER || 'node',
      homedir: process.env.USERPROFILE || os.tmpdir(),
      shell: null,
    }),
  });
}
