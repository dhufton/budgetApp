import re
from typing import Dict, List

_TRANSFER_PATTERNS = [
    re.compile(r"\bINTERNAL TRANSFER\b", re.I),
    re.compile(r"\bTRANSFER TO\b", re.I),
    re.compile(r"\bTRANSFER FROM\b", re.I),
    re.compile(r"\bFASTER PAYMENT TO\b", re.I),
    re.compile(r"\bFASTER PAYMENT FROM\b", re.I),
    re.compile(r"\bCREDIT CARD PAYMENT\b", re.I),
    re.compile(r"\bBALANCE PAYMENT\b", re.I),
    re.compile(r"\bAMEX\b.*\bPAYMENT\b", re.I),
    re.compile(r"\bAMERICAN EXPRESS\b.*\bPAYMENT\b", re.I),
]


def is_internal_transfer(description: str) -> bool:
    if not description:
        return False
    desc = str(description).strip()
    return any(p.search(desc) for p in _TRANSFER_PATTERNS)


def apply_transfer_classification(transactions: List[Dict]) -> List[Dict]:
    for txn in transactions:
        if is_internal_transfer(txn.get("description", "")):
            txn["category"] = "Transfer"
    return transactions
