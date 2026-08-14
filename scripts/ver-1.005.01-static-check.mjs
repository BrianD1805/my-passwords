import fs from 'node:fs';
const main = fs.readFileSync('src/main.jsx','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const sw = fs.readFileSync('public/sw.js','utf8');
const db = fs.readFileSync('netlify/functions/_db.js','utf8');
let passed=0, failed=0;
function check(name, ok){ if(ok){console.log(`PASS  ${name}`); passed++;} else {console.error(`FAIL  ${name}`); failed++;} }
check('Version references align to Ver-1.005.01', pkg.version==='1.5.1' && /Password-Encrypt Ver-1\.005\.01/.test(main) && /Password-Encrypt Ver-1\.005\.01/.test(db) && /my-passwords-v1\.005\.01/.test(sw));
const statePos = main.indexOf('const emergencyImportEntryRequested');
const effectPos = main.indexOf('if (!emergencyImportEntryRequested || locked || emergencyImportLoadRef.current) return;');
const lateRoutePos = main.indexOf("const emergencyImportEntry = isVaultRoute && vaultSearchParams.get('emergencyImport') === '1';");
check('Emergency import startup flag is resolved before its effect', statePos > -1 && effectPos > statePos);
check('Startup effect no longer reads late route constant', effectPos > -1 && lateRoutePos > effectPos);
check('Import effect depends on early-safe flag', /\[emergencyImportEntryRequested, locked\]/.test(main));
if(failed){ console.error(`\n${failed} Ver-1.005.01 startup check(s) failed; ${passed} passed.`); process.exit(1);}
console.log(`\nAll ${passed} Ver-1.005.01 startup checks passed.`);
