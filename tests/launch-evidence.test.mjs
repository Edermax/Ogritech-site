import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectLaunchEvidence } from '../scripts/launch-evidence.mjs';

test('launch evidence expands directories, deduplicates files and reports missing or empty documents', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ogritech-launch-'));
  try {
    await mkdir(join(dir,'functions','nested'),{recursive:true});
    await mkdir(join(dir,'functions','retired-empty'),{recursive:true});
    await mkdir(join(dir,'empty-directory'),{recursive:true});
    await writeFile(join(dir,'functions','handler.ts'),'handler');
    await writeFile(join(dir,'functions','nested','helper.ts'),'helper');
    await writeFile(join(dir,'empty.md'),'');
    const evidence=await collectLaunchEvidence(pathToFileURL(dir+'/'),['functions','functions/handler.ts','empty.md','empty-directory','missing.md','https://example.invalid/evidence']);
    assert.deepEqual(evidence.files,['functions/handler.ts','functions/nested/helper.ts']);
    assert.deepEqual(evidence.missing,['empty-directory','empty.md','missing.md']);
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(),'ogritech-launch-')));
    await rm(dir,{recursive:true,force:true});
  }
});
