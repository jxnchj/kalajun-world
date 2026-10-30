"""Execution-only policy; never changes geometric/numerical acceptance budgets."""
def budget(mode,phase,extended,available_bytes):
 if extended:
  assert mode=='geometry' and phase in ('zero-cover','corrected-cover'),'Extended tier only for explicit cover geometry phases'
  assert available_bytes>=6_000_000_000,'Extended cover requires MemAvailable >= 6 GB'
  return 900,'root-reviewed-progress-based-cover-extension','One explicit attempt; prior300s finite-progress timeout, unchanged math/contact/area thresholds'
 return 300,'default','Default bounded execution'

def refuse_snapshot_overwrite(candidate,phase):
 from pathlib import Path
 candidate=Path(candidate)
 label={'generate-zero':'zero','solve':'corrected'}.get(phase)
 if label:
  for name in (label+'-state.json',label+'-settlement-unvalidated.blend'):
   assert not (candidate/name).exists(),('Refusing immutable snapshot overwrite',name)
