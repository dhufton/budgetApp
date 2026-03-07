import re
import logging
import pdfplumber
import pandas as pd
from src.config import CATEGORY_RULES
from src.ingestion.learning import load_learned_rules

logger = logging.getLogger(__name__)

# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Chase UK statement format (multi-line per transaction):
#
#   01 Feb 2026
#   Amazon
#   Purchase
#   £53.61
#   £508.88
#
# Each transaction = date / description (1+ lines) / type / signed amount / balance
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_DATE_RE        = re.compile(r'^\d{2} [A-Za-z]{3} \d{4}$')
_SIGNED_AMT_RE  = re.compile(r'^[+\-]Â£[\d,]+\.\d{2}$')       # e.g. -Â£53.61 / +Â£46.00
_BALANCE_RE     = re.compile(r'^Â£[\d,]+\.\d{2}$')             # e.g. Â£508.88
_TRANSACTION_TYPES = {
    'purchase', 'direct debit', 'transfer', 'payment',
    'standing order', 'refund', 'faster payment',
}
_JUNK_EXACT = {
    'date', 'transaction details', 'amount', 'balance',
    'opening balance', 'closing balance', 'money in', 'money out',
    '+', 'âˆ’', '=',
}
_JUNK_PATTERNS = [
    re.compile(r'^page \d+ of \d+$', re.I),
    re.compile(r"account statement$", re.I),
    re.compile(r'^\d{2} [a-z]+ \d{4} [-â€“] \d{2} [a-z]+ \d{4}$', re.I),
    re.compile(r'^account number:', re.I),
    re.compile(r'^sort code:', re.I),
    re.compile(r'^some useful information', re.I),
    re.compile(r'^foreign currency', re.I),
    re.compile(r'^the aer is', re.I),
    re.compile(r'^your deposit is eligible', re.I),
    re.compile(r'^chase is a registered', re.I),
]


def _is_junk(line: str) -> bool:
    low = line.lower().strip()
    if not low:
        return True
    if low in _JUNK_EXACT:
        return True
    for pat in _JUNK_PATTERNS:
        if pat.match(low):
            return True
    return False


def _parse_amount(s: str) -> float:
    """'-Â£1,234.56' â†’ -1234.56,  '+Â£46.00' â†’ 46.0"""
    return float(s.replace('Â£', '').replace(',', ''))


def _parse_balance(s: str) -> float:
    return float(s.replace('Â£', '').replace(',', ''))


def _extract_transactions(all_lines: list[str]) -> list[dict]:
    """State-machine parser for Chase UK multi-line PDF format."""
    transactions = []

    # Current transaction being built
    cur_date  = None
    cur_desc_parts: list[str] = []
    cur_type  = None
    cur_amount = None

    def flush():
        nonlocal cur_date, cur_desc_parts, cur_type, cur_amount
        if cur_date and cur_desc_parts and cur_amount is not None:
            desc = ' '.join(cur_desc_parts).strip()
            if desc.lower() not in ('opening balance', 'closing balance'):
                transactions.append({
                    'Date':        cur_date,
                    'Description': desc,
                    'Amount':      cur_amount,
                })
        cur_date = None
        cur_desc_parts = []
        cur_type = None
        cur_amount = None

    for raw in all_lines:
        line = raw.strip()
        if not line or _is_junk(line):
            continue

        # â”€â”€ New date â†’ flush previous, start fresh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if _DATE_RE.match(line):
            flush()
            cur_date = pd.to_datetime(line, format='%d %b %Y')
            continue

        # â”€â”€ Nothing started yet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if cur_date is None:
            continue

        # â”€â”€ Signed amount (debit/credit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if _SIGNED_AMT_RE.match(line):
            cur_amount = _parse_amount(line)
            continue

        # â”€â”€ Balance line (unsigned Â£X.XX) â€” transaction is now complete â”€â”€
        if _BALANCE_RE.match(line) and cur_amount is not None:
            flush()
            continue

        # â”€â”€ Transaction type keyword â€” not part of description â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if line.lower() in _TRANSACTION_TYPES:
            cur_type = line
            continue

        # â”€â”€ Everything else is part of the description â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # Only accumulate if we haven't seen the amount yet
        if cur_amount is None:
            cur_desc_parts.append(line)

    flush()  # capture last transaction
    return transactions


class ChaseStatementParser:
    def __init__(self, user_id: str = 'default'):
        self.user_id = user_id
        self._learned_rules: dict[str, str] = (
            load_learned_rules(user_id) if user_id and user_id != 'default' else {}
        )

    def apply_vendor_cache(self, vendor_cache: dict[str, str]) -> None:
        self._learned_rules.update(vendor_cache)

    def parse(self, file) -> pd.DataFrame:
        all_lines: list[str] = []
        try:
            with pdfplumber.open(file) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        all_lines.extend(text.split('\n'))
        except Exception as e:
            logger.error(f'[CHASE] Failed to open PDF: {e!r}')
            return pd.DataFrame()

        if not all_lines:
            logger.warning('[CHASE] PDF produced no text')
            return pd.DataFrame()

        transactions = _extract_transactions(all_lines)
        logger.info(f'[CHASE] Extracted {len(transactions)} transactions')

        if not transactions:
            return pd.DataFrame()

        df = pd.DataFrame(transactions)
        df['Category'] = df['Description'].apply(self.get_category)
        df['Balance']  = 0.0
        df['Type']     = df['Amount'].apply(lambda x: 'Expense' if x < 0 else 'Income')
        return df[['Date', 'Description', 'Amount', 'Type', 'Category', 'Balance']]

    def get_category(self, desc: str) -> str:
        desc = str(desc).strip()
        if desc in self._learned_rules:
            return self._learned_rules[desc]
        desc_upper = desc.upper()
        for cat, keywords in CATEGORY_RULES.items():
            for k in keywords:
                if k.upper() in desc_upper:
                    return cat
        return 'Uncategorized'


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Amex CSV parser (unchanged structure, same learned_rules fix)
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class AmexCSVParser:
    def __init__(self, user_id: str = 'default'):
        self.user_id = user_id
        self._learned_rules: dict[str, str] = (
            load_learned_rules(user_id) if user_id and user_id != 'default' else {}
        )

    def apply_vendor_cache(self, vendor_cache: dict[str, str]) -> None:
        self._learned_rules.update(vendor_cache)

    def parse(self, file) -> pd.DataFrame:
        try:
            df = pd.read_csv(file)
            df['Date']        = pd.to_datetime(df['Date'], format='%d/%m/%Y', errors='coerce')
            df['Amount']      = pd.to_numeric(df['Amount'], errors='coerce') * -1
            df['Type']        = df['Amount'].apply(lambda x: 'Expense' if x < 0 else 'Income')
            df['Description'] = df['Description'].str.strip()
            df['Balance']     = 0.0
            helper = ChaseStatementParser(self.user_id)
            helper._learned_rules = self._learned_rules
            df['Category']    = df['Description'].apply(helper.get_category)
            return df[['Date', 'Description', 'Amount', 'Type', 'Category', 'Balance']]
        except Exception as e:
            logger.error(f'[AMEX] Parse error: {e!r}')
            return pd.DataFrame()