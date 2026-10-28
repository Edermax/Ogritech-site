export function consolidateReadiness({ gate, audit, integrity, databaseStatus, missingEvidence = false }) {
  if (!gate || !audit || !integrity || missingEvidence) return 'INCOMPLETO';
  if (databaseStatus === 'failure' || [gate.verdict, audit.verdict, integrity.verdict].includes('NAO_APROVADO')) return 'NAO_APROVADO';
  if (databaseStatus !== 'success') return 'INCOMPLETO';
  if (audit.verdict !== 'APROVADO' || integrity.verdict !== 'APROVADO') return 'INCOMPLETO';
  return ['APROVADO', 'BLOQUEADO'].includes(gate.verdict) ? gate.verdict : 'INCOMPLETO';
}
