# budgetApp/src/ingestion/parser.py
import pdfplumber
import re
import pandas as pd
from config import CATEGORY_RULES


class ChaseStatementParser:
    def __init__(self):
        self.date_pattern = re.compile(r"^(\d{2}\s[A-Za-z]{3}\s\d{4})")
        self.money_pattern = re.compile(r"([+-]?£[\d,]+\.\d{2})")

    def parse_multiple(self, file_paths):
        """Parses a list of file paths and returns a combined DataFrame."""
        all_data = []
        for path in file_paths:
            try:
                df = self.parse(path)
                all_data.append(df)
            except Exception as e:
                print(f"Failed to parse {path}: {e}")

        if not all:
            return pd.DataFrame()

        combined_df = pd.concat(all_data, ignore_index=True)
        # Drop duplicates in case the same file was uploaded twice
        return combined_df.drop_duplicates()

    def parse(self, file_path):
        raw_transactions = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                raw_transactions.extend(self._extract_page(page))
        return self._clean_and_categorize(raw_transactions)

    def _extract_page(self, page):
        text = page.extract_text()
        if not text: return []

        lines = text.split('\n')
        transactions = []
        current_trans = {}

        for line in lines:
            date_match = self.date_pattern.match(line)
            if date_match:
                if current_trans: transactions.append(current_trans)
                current_trans = {
                    "Date": date_match.group(1),
                    "Description": line[len(date_match.group(1)):].strip(),
                    "Amount": None
                }
                self._find_amount(current_trans, line)
            elif current_trans:
                if self._is_junk(line): continue
                if not current_trans['Amount']:
                    self._find_amount(current_trans, line)
                else:
                    current_trans["Description"] += " " + line.strip()

        if current_trans: transactions.append(current_trans)
        return transactions

    def _find_amount(self, trans, line):
        matches = self.money_pattern.findall(line)
        if matches:
            # Usually the second to last money value is the transaction amount (last is balance)
            # If only one exists, it's likely the amount
            val = matches[-2] if len(matches) >= 2 else matches[0]
            trans["Amount"] = val
            # Clean description
            trans["Description"] = trans["Description"].replace(val, "").strip()

    def _is_junk(self, line):
        return any(x in line for x in ["Account number:", "Page ", "Opening balance", "Closing balance"])

    def _clean_and_categorize(self, data):
        df = pd.DataFrame(data)
        if df.empty: return df

        # Clean Amount
        df['Amount'] = df['Amount'].astype(str).str.replace('£', '').str.replace(',', '')
        df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce').fillna(0.0)

        # Parse Dates
        df['Date'] = pd.to_datetime(df['Date'], format='%d %b %Y', errors='coerce')

        # Categorize
        df['Category'] = df['Description'].apply(self._get_category)

        # Filter: Only keep expenses (negative amounts) for budgeting
        # (You might want to flip this logic if you track income, but for budgeting usually we look at costs)
        return df

    def _get_category(self, desc):
        desc = str(desc).upper()
        for cat, keywords in CATEGORY_RULES.items():
            for k in keywords:
                if k.upper() in desc: return cat
        return "Uncategorized"
