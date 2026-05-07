const fs = require('fs');
const path = require('path');

const templateDir = path.join(
  __dirname,
  'node_modules',
  'app-builder-lib',
  'templates',
  'nsis'
);

const installSectionFile = path.join(templateDir, 'installSection.nsh');

if (!fs.existsSync(installSectionFile)) {
  console.log('[patch-nsis] installSection.nsh not found, skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(installSectionFile, 'utf8');

const marker = '/* XKAutoTester-patched */';

if (content.includes(marker)) {
  console.log('[patch-nsis] Already patched, skipping.');
  process.exit(0);
}

content = content.replace(
  /\$\{IfNot\} \$\{Silent\}\s*\n\s*SetDetailsPrint none\s*\n\$\{endif\}/,
  `${marker}\n${'${IfNot} ${Silent}'}\n  SetDetailsPrint both\n${'${endif}'}`
);

if (!content.includes(marker)) {
  console.error('[patch-nsis] Failed to apply patch - pattern not found!');
  process.exit(1);
}

content = content.replace(
  /(!insertmacro uninstallOldVersion SHELL_CONTEXT)/,
  'DetailPrint "Removing previous version..."\n$1'
);

content = content.replace(
  /(!insertmacro installApplicationFiles)/,
  'DetailPrint "Extracting application files..."\n$1'
);

content = content.replace(
  /(!insertmacro registryAddInstallInfo)/,
  'DetailPrint "Registering application information..."\n$1'
);

content = content.replace(
  /(!insertmacro addStartMenuLink \$keepShortcuts)/,
  'DetailPrint "Creating shortcuts..."\n$1'
);

fs.writeFileSync(installSectionFile, content, 'utf8');
console.log('[patch-nsis] Successfully patched installSection.nsh');
console.log('[patch-nsis] - SetDetailsPrint none -> both');
console.log('[patch-nsis] - Added DetailPrint messages for installation phases');
