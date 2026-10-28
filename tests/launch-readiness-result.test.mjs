import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidateReadiness } from '../scripts/launch-readiness-result.mjs';
const base={gate:{verdict:'APROVADO'},audit:{verdict:'APROVADO'},integrity:{verdict:'APROVADO'},databaseStatus:'success'};
test('technical checks cannot imply a commercial approval or hide a database failure',()=>{
  assert.equal(consolidateReadiness(base),'APROVADO');
  assert.equal(consolidateReadiness({...base,gate:{verdict:'BLOQUEADO'}}),'BLOQUEADO');
  assert.equal(consolidateReadiness({...base,databaseStatus:'failure'}),'NAO_APROVADO');
  for(const databaseStatus of [undefined,'skipped','cancelled']) assert.equal(consolidateReadiness({...base,databaseStatus}),'INCOMPLETO');
  assert.equal(consolidateReadiness({...base,missingEvidence:true}),'INCOMPLETO');
  assert.equal(consolidateReadiness({...base,gate:null}),'INCOMPLETO');
  assert.equal(consolidateReadiness({...base,audit:{verdict:'NAO_APROVADO'}}),'NAO_APROVADO');
});
