# src/ingestion/parser.py
import pdfplumber
import re
import pandas as pd
import csv
from src.config import CATEGORY_RULES
from ingestion.learning import load_learned_rules  # Ensure this import is updated


class ChaseStatementParser:
    def __init__(self, user_id="default"):
        self.user_id = user_id  # <--- Store user_id

        self.date_pattern = re.compile(r"^(\d{2}\s[A-Za-z]{3}\s\d{4})")
        self.money_pattern = re.compile(r"([+-]?£[\d,]+\.\d{2})")

    def parse(self, file_path):
        # ... (parse logic remains same) ...
        raw_transactions = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                raw_transactions.extend(self._extract_page(page))
        return self._clean_and_categorize(raw_transactions)

    def _extract_page(self, page):
        # ... (same extraction logic) ...
        # (Copy your existing _extract_page method here)
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
                    "Amount": None, "Balance": None
                }
                matches = self.money_pattern.findall(line)
                if len(matches) >= 2:
                    current_trans["Amount"] = matches[-2]
                    current_trans["Balance"] = matches[-1]
                    desc = current_trans["Description"].replace(matches[-2], "").replace(matches[-1], "")
                    current_trans["Description"] = desc.strip()
                elif len(matches) == 1:
                    current_trans["Amount"] = matches[0]
            elif current_trans:
                if self._is_junk(line): continue
                matches = self.money_pattern.findall(line)
                if matches:
                    if len(matches) >= 2:
                        current_trans["Amount"] = matches[-2]
                        current_trans["Balance"] = matches[-1]
                    elif len(matches) == 1:
                        if current_trans["Amount"] is None: current_trans["Amount"] = matches[0]
                else:
                    current_trans["Description"] += " " + line.strip()
        if current_trans: transactions.append(current_trans)
        return transactions

    def _is_junk(self, line):
        return any(x in line for x in ["Account number:", "Page ", "Opening balance", "Closing balance"])

    def _clean_and_categorize(self, data):
        df = pd.DataFrame(data)
        if df.empty: return df

        df['Amount'] = df['Amount'].astype(str).str.replace('£', '').str.replace(',', '')
        df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce').fillna(0.0)
        df = df[df['Amount'] != 0.0]  # Drop zero amounts

        if 'Balance' in df.columns:
            df['Balance'] = df['Balance'].astype(str).str.replace('£', '').str.replace(',', '')
            df['Balance'] = pd.to_numeric(df['Balance'], errors='coerce')

        df['Date'] = pd.to_datetime(df['Date'], format='%d %b %Y', errors='coerce')
        df['Type'] = df['Amount'].apply(lambda x: 'Expense' if x < 0 else 'Income')

        # Pass user_id implicitly via self.user_id if needed,
        # but _get_category needs to handle the loading
        df['Category'] = df['Description'].apply(self._get_category)

        return df

    def _get_category(self, desc):
        desc = str(desc).strip()

        # 1. CHECK LEARNING FILE (Specific to User)
        # We must update load_learned_rules to accept user_id
        learned_rules = load_learned_rules(self.user_id)
        if desc in learned_rules:
            return learned_rules[desc]

        # 2. FALLBACK TO CONFIG
        desc_upper = desc.upper()
        for cat, keywords in CATEGORY_RULES.items():
            for k in keywords:
                if k.upper() in desc_upper: return cat
        return "Uncategorized"


class AmexCSVParser:
    def __init__(self, user_id="default"):
        self.user_id = user_id  # <--- Store user_id

    def parse(self, file_path):
        try:
            df = pd.read_csv(file_path)
            df['Date'] = pd.to_datetime(df['Date'], format='%d/%m/%Y', errors='coerce')
            df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce') * -1
            df['Type'] = df['Amount'].apply(lambda x: 'Expense' if x < 0 else 'Income')
            df['Description'] = df['Description'].str.strip()
            df['Balance'] = 0.0

            # Use the ChaseParser logic for categorization to keep it DRY
            # We create a helper instance with the same user_id
            helper = ChaseStatementParser(self.user_id)
            df['Category'] = df['Description'].apply(helper._get_category)

            return df[['Date', 'Description', 'Amount', 'Type', 'Category', 'Balance']]
        except Exception as e:
            print(f"Error parsing Amex CSV: {e}")
            return pd.DataFrame()
