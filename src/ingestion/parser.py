import re
import logging
import pdfplumber
import pandas as pd
from src.config import CATEGORY_RULES
from src.ingestion.learning import load_learned_rules

logger = logging.getLogger(__name__)

# Chase UK statement format - each transaction spans multiple lines:
#   01 Feb 2026
#   Amazon
#   Purchase
#   -£53.61
#   £508.88

_DATE_RE       = re.compile(r'^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$')
_SIGNED_AMT_RE = re.compile(r'^[+\-\u2212]?£[\d,]+\.\d{2}$')
_BALANCE_RE    = re.compile(r'^£[\d,]+\.\d{2}$')

_TRANSACTION_TYPES = {
    'purchase', 'direct debit', 'transfer', 'payment',
    'standing order', 'refund', 'faster payment', 'bank transfer',
}
_JUNK_EXACT = {
    'date', 'transaction details', 'amount', 'balance',
    'opening balance', 'closing balance', 'money in', 'money out',
    '+', '-', '=',
}
_JUNK_PATTERNS = [
    re.compile(r'^page \d+ of \d+', re.I),
    re.compile(r'account statement', re.I),
    re.compile(r'^\d{1,2}\s+[a-z]+\s+\d{4}\s*[-]\s*\d{1,2}\s+[a-z]+\s+\d{4}$', re.I),
    re.compile(r'^account number', re.I),
    re.compile(r'^sort code', re.I),
    re.compile(r'^some useful', re.I),
    re.compile(r'^foreign currency', re.I),
    re.compile(r'^the aer is', re.I),
    re.compile(r'^your deposit', re.I),
    re.compile(r'^chase is a registered', re.I),
    re.compile(r'^when you make', re.I),
    re.compile(r'^interest$', re.I),
]


def _is_junk(line: str) -> bool:
    low = line.lower().strip()
    if not low:
        return True
    if low in _JUNK_EXACT:
        return True
    for pat in _JUNK_PATTERNS:
        if pat.search(low):
            return True
    return False


def _parse_signed_amount(s: str) -> float:
    # Handle Unicode minus as well as regular minus
    s = s.replace('\u2212', '-').replace('£', '').replace(',', '')
    return float(s)


def _try_table_parse(pdf) -> list:
    """Fallback: use pdfplumber table extraction if text parse fails."""
    transactions = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            for row in table:
                if not row or len(row) < 3:
                    continue
                date_cell = (row[0] or '').strip()
                desc_cell = (row[1] or '').strip()
                amt_cell  = (row[2] or '').strip()
                if not date_cell or not desc_cell or not amt_cell:
                    continue
                if date_cell.lower() in ('date',):
                    continue
                if desc_cell.lower() in ('transaction details',):
                    continue
                if date_cell.lower() in ('opening balance', 'closing balance'):
                    continue
                try:
                    date = pd.to_datetime(date_cell, format='%d %b %Y', errors='raise')
                except Exception:
                    try:
                        date = pd.to_datetime(date_cell, dayfirst=True, errors='raise')
                    except Exception:
                        continue
                amt_str = amt_cell.replace('\u2212', '-').replace('£', '').replace(',', '').strip()
                try:
                    amount = float(amt_str)
                except ValueError:
                    continue
                transactions.append({'Date': date, 'Description': desc_cell, 'Amount': amount})
    return transactions


def _try_text_parse(all_lines: list) -> list:
    """State-machine parser for Chase UK multi-line text format."""
    transactions = []
    cur_date = None
    cur_desc_parts = []
    cur_amount = None

    def flush():
        nonlocal cur_date, cur_desc_parts, cur_amount
        if cur_date and cur_desc_parts and cur_amount is not None:
            desc = ' '.join(cur_desc_parts).strip()
            if desc.lower() not in ('opening balance', 'closing balance'):
                transactions.append({
                    'Date': cur_date,
                    'Description': desc,
                    'Amount': cur_amount,
                })
        cur_date = None
        cur_desc_parts = []
        cur_amount = None

    for raw in all_lines:
        line = raw.strip()
        if not line or _is_junk(line):
            continue
        if _DATE_RE.match(line):
            flush()
            try:
                cur_date = pd.to_datetime(line.strip(), format='%d %b %Y')
            except Exception:
                cur_date = pd.to_datetime(line.strip(), dayfirst=True, errors='coerce')
            continue
        if cur_date is None:
            continue
        if _SIGNED_AMT_RE.match(line):
            cur_amount = _parse_signed_amount(line)
            continue
        if _BALANCE_RE.match(line) and cur_amount is not None:
            flush()
            continue
        if line.lower() in _TRANSACTION_TYPES:
            continue
        if cur_amount is None:
            cur_desc_parts.append(line)

    flush()
    return transactions


class ChaseStatementParser:
    def __init__(self, user_id: str = 'default'):
        self.user_id = user_id
        self._learned_rules = (
            load_learned_rules(user_id) if user_id and user_id != 'default' else {}
        )

    def apply_vendor_cache(self, vendor_cache: dict) -> None:
        self._learned_rules.update(vendor_cache)

    def parse(self, file) -> pd.DataFrame:
        all_lines = []
        try:
            with pdfplumber.open(file) as pdf:
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text()
                    if text:
                        page_lines = text.split('\n')
                        all_lines.extend(page_lines)
                        if i == 0:
                            logger.info('[CHASE] Page 1 raw lines (first 20):')
                            for ln in page_lines[:20]:
                                logger.info('  %s', repr(ln))

                transactions = _try_text_parse(all_lines)
                logger.info('[CHASE] Text parse found %d transactions', len(transactions))

                if not transactions:
                    logger.info('[CHASE] Text parse empty - trying table extraction')
                    file.seek(0)
                    with pdfplumber.open(file) as pdf2:
                        transactions = _try_table_parse(pdf2)
                    logger.info('[CHASE] Table parse found %d transactions', len(transactions))

        except Exception as e:
            logger.error('[CHASE] PDF parse error: %r', e)
            import traceback
            traceback.print_exc()
            return pd.DataFrame()

        if not transactions:
            logger.warning('[CHASE] Both parse strategies returned 0 transactions')
            logger.info('[CHASE] Total raw lines: %d', len(all_lines))
            logger.info('[CHASE] Sample lines 0-30: %s', all_lines[:30])
            return pd.DataFrame()

        df = pd.DataFrame(transactions)
        df['Category'] = df['Description'].apply(self.get_category)
        df['Balance']  = 0.0
        df['Type']     = df['Amount'].apply(lambda x: 'Expense' if x < 0 else 'Income')
        logger.info('[CHASE] Done: %d rows', len(df))
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


class AmexCSVParser:
    def __init__(self, user_id: str = 'default'):
        self.user_id = user_id
        self._learned_rules = (
            load_learned_rules(user_id) if user_id and user_id != 'default' else {}
        )

    def apply_vendor_cache(self, vendor_cache: dict) -> None:
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
            logger.error('[AMEX] Parse error: %r', e)
            return pd.DataFrame()
