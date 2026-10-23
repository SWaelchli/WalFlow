"""Skip the mutants outside the walflow-qa mutation scope: operator swaps no real bug looks like (to bit
operators, number tweaks) and, optionally, solver.py lines outside a range.
Usage, after `cosmic-ray init`: python cosmic-ray-filter.py cr.sqlite [solver_first_line solver_last_line]"""
import re, sys
from cosmic_ray.work_db import use_db, WorkDB
from cosmic_ray.work_item import WorkResult, WorkerOutcome

KEEP = re.compile(r"core/(ReplaceBinaryOperator_(Add_Sub|Sub_Add|Mul_Div|Div_Mul|Pow_Mul)$"
                  r"|ReplaceComparisonOperator|ReplaceUnaryOperator|AddNot|Replace(Or|And|True|False)With"
                  r"|ZeroIterationForLoop|ReplaceBreakWithContinue|ReplaceContinueWithBreak)")
first, last = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (0, 10**9)
with use_db(sys.argv[1], WorkDB.Mode.open) as db:
    skip = kept = 0
    for item in list(db.pending_work_items):
        m = item.mutations[0]
        out_of_range = m.module_path.name == "solver.py" and not (first <= m.start_pos[0] <= last)
        if not KEEP.match(m.operator_name) or out_of_range:
            db.set_result(item.job_id, WorkResult(worker_outcome=WorkerOutcome.SKIPPED, output="out of mutation scope"))
            skip += 1
        else:
            kept += 1
    print(f"kept {kept}, skipped {skip}")
