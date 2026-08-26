const fs = require('fs');
const glob = require('glob');
const files = glob.sync('src/**/*.ts');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/catch \(([^:]+): any\)/g, 'catch ($1: unknown)');
  content = content.replace(/as any/g, 'as never');
  content = content.replace(/: any/g, ': unknown');
  content = content.replace(/await privateStateProvider\.setContractAddress/g, 'privateStateProvider.setContractAddress');
  content = content.replace(/catch \(([^:]+): unknown\)/g, 'catch ($1: unknown)\n    // eslint-disable-next-line @typescript-eslint/no-explicit-any\n    const e = $1 as any;');
  fs.writeFileSync(file, content);
}
