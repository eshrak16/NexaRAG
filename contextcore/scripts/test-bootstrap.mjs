import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const userInfo = os.userInfo.bind(os);

try {
  userInfo();
} catch {
  // Node's Windows account lookup can fail in restricted execution environments.
  // tsx only needs the username to construct its temporary directory path.
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || process.env.USER || 'node',
    homedir: process.env.USERPROFILE || os.tmpdir(),
    shell: null,
  });
  syncBuiltinESMExports();
}
