import pdfplumber
import re
import pandas as pd
from src.config import CATEGORY_RULES
from src.ingestion.learning import load_learned_rules


class ChaseStatementParser:
    def __init__(self, user_id: str = "default"):
        self.user_id = user_id
        # Load learned rules ONCE per parser instance â€” eliminates the N+1 DB calls
        self._learned_rules: dict[str, str] = (
            load_learned_rules(user_id) if user_id and user_id != "default" else {}
        )
        self.date_pattern  = re.compile(r"\d{2}[A-Za-z]{3}\d{4}")
        self.money_pattern = re.compile(r"-?[\d,]+\.\d{2}")

    def apply_vendor_cache(self, vendor_cache: dict[str, str]) -> None:
        """Merge a pre-loaded vendor->category cache into learned rules.
        Called from upload.py before parsing so cache hits avoid Groq entirely."""
        self._learned_rules.update(vendor_cache)

    def parse(self, file) -> pd.DataFrame:
        raw_transactions = []
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                raw_transactions.extend(self._extract_page(page))
        return self._clean_and_categorize(raw_transactions)

    def _extract_page(self, page) -> list[dict]:
        text = page.extract_text()
        if not text:
            return []
        lines = text.split("\n")
        transactions = []
        current_trans: dict | None = None
        for line in lines:
            date_match = self.date_pattern.match(line)
            if date_match:
                if current_trans:
                    transactions.append(current_trans)
                current_trans = {
                    "Date": date_match.group(1),
                    "Description": line[len(date_match.group(1)):].strip(),
                    "Amount": None,
                    "Balance": None,
                }
                matches = self.money_pattern.findall(line)
                if len(matches) >= 2:
                    current_trans["Amount"]  = matches[-2]
                    current_trans["Balance"] = matches[-1]
                    desc = current_trans["Description"].replace(matches[-2], "").replace(matches[-1], "")
                    current_trans["Description"] = desc.strip()
                elif len(matches) == 1:
                    current_trans["Amount"] = matches[0]
            elif current_trans:
                if self._is_junk(line):
                    continue
                matches = self.money_pattern.findall(line)
                if matches:
                    if len(matches) >= 2:
                        current_trans["Amount"]  = matches[-2]
                        current_trans["Balance"] = matches[-1]
                    elif current_trans["Amount"] is None:
                        current_trans["Amount"] = matches[0]
                else:
                    current_trans["Description"] += " " + line.strip()
        if current_trans:
            transactions.append(current_trans)
        return transactions

    def _is_junk(self, line: str) -> bool:
        return any(x in line for x in ["Account number", "Page ", "Opening balance", "Closing balance"])

    def _clean_and_categorize(self, data: list[dict]) -> pd.DataFrame:
        df = pd.DataFrame(data)
        if df.empty:
            return df
        df["Category"] = df["Description"].apply(self.get_category)
        return df

    def get_category(self, desc: str) -> str:
        desc = str(desc).strip()
        # 1. Check per-user learned rules (populated from DB once in __init__)
        if desc in self._learned_rules:
            return self._learned_rules[desc]
        # 2. Fall back to static keyword config rules
        desc_upper = desc.upper()
        for cat, keywords in CATEGORY_RULES.items():
            for k in keywords:
                if k.upper() in desc_upper:
                    return cat
        return "Uncategorized"


class AmexCSVParser:
    def __init__(self, user_id: str = "default"):
        self.user_id = user_id
        # Load learned rules ONCE â€” same fix as ChaseStatementParser
        self._learned_rules: dict[str, str] = (
            load_learned_rules(user_id) if user_id and user_id != "default" else {}
        )

    def apply_vendor_cache(self, vendor_cache: dict[str, str]) -> None:
        """Merge pre-loaded vendor->category cache (same as ChaseStatementParser)."""
        self._learned_rules.update(vendor_cache)

    def parse(self, file) -> pd.DataFrame:
        try:
            df = pd.read_csv(file)
            df["Date"]        = pd.to_datetime(df["Date"], format="%d/%m/%Y", errors="coerce")
            df["Amount"]      = pd.to_numeric(df["Amount"], errors="coerce") * -1
            df["Type"]        = df["Amount"].apply(lambda x: "Expense" if x < 0 else "Income")
            df["Description"] = df["Description"].str.strip()
            df["Balance"]     = 0.0
            helper = ChaseStatementParser(self.user_id)
            helper._learned_rules = self._learned_rules  # share the same pre-loaded rules
            df["Category"]    = df["Description"].apply(helper.get_category)
            return df[["Date", "Description", "Amount", "Type", "Category", "Balance"]]
        except Exception as e:
            print(f"Error parsing Amex CSV: {e}")
            return pd.DataFrame()